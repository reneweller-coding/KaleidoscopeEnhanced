#include <float.h>
#include <math.h>

#include "shader_setup.h"
#include "filterShader.h"
#include "Utils.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>
#include <QtCore/QSettings>
#include <GL/GLU.h>


static float minSides = 2.0;
static unsigned int maxSides = 14;

// Half-float colour format for the reaction-diffusion state buffers (Gray-Scott
// needs more precision than 8-bit or the pattern decays).  GLee may not define
// the core token, so provide it if missing.
#ifndef GL_RGBA16F
#define GL_RGBA16F 0x881A
#endif

// Live-tunable look parameters (shared across all configs, set by hotkeys).
float FilterShader::s_reactivity  = 1.0f;
float FilterShader::s_trailAmount = 0.6f;
float FilterShader::s_moodStrength = 1.0f;
float FilterShader::s_renderScale = 1.0f;

// Settings file lives next to the Configurations folder (parent of Debug/Release),
// matching how shaders and configs are loaded ("..\\...").
static QString settingsFilePath()
{
	return QString( "..\\kaleidoscope_settings.ini" );
}

void FilterShader::loadSettings()
{
	QSettings s( settingsFilePath(), QSettings::IniFormat );
	s_reactivity   = clampParam( s.value( "reactivity",  s_reactivity  ).toFloat(), 0.f, 3.0f  );
	s_trailAmount  = clampParam( s.value( "trails",      s_trailAmount ).toFloat(), 0.f, 0.95f );
	s_moodStrength = clampParam( s.value( "mood",        s_moodStrength).toFloat(), 0.f, 2.5f  );
	setRenderScale( s.value( "renderScale", s_renderScale ).toFloat() );  // clamps internally
}

void FilterShader::saveSettings()
{
	QSettings s( settingsFilePath(), QSettings::IniFormat );
	s.setValue( "reactivity",  s_reactivity   );
	s.setValue( "trails",      s_trailAmount  );
	s.setValue( "mood",        s_moodStrength );
	s.setValue( "renderScale", s_renderScale  );
	s.sync();
	fprintf( stderr, "Saved settings: react=%.2f trails=%.2f mood=%.2f scale=%.2f\n",
	         s_reactivity, s_trailAmount, s_moodStrength, s_renderScale );
}


float ROUND(float f)
{
	if(f-floor(f) < 0.5)
		return floor(f);
	else
		return ceil(f);
}


// Move 'cur' toward 'target' by at most rate*dt this frame (slew-rate limiter).
// Used to keep audio-driven brightness from changing fast enough to strobe.
static float slewToward(float cur, float target, float rate, float dt)
{
	float maxStep = rate * dt;
	if (target > cur)
		return (target - cur < maxStep) ? target : cur + maxStep;
	else
		return (cur - target < maxStep) ? target : cur - maxStep;
}



// Constructor
FilterShader::FilterShader( )
: m_mesh(0)
, m_npot_supported(false)
, m_width(100)
, m_height(100)
, m_texInternalFormat(GL_RGBA8)
, m_texFormat(GL_RGBA)
, m_texType(GL_UNSIGNED_BYTE)
, m_fboEffectTexture1(1)
, m_fboEffectTexture2(2)
, m_fboEffectCombine1(1)
, m_fboEffectCombine2(2)
, m_attachmentpoint(GL_COLOR_ATTACHMENT0_EXT)
, m_texID1(0)
, m_texID2(0)
, m_texIDFBOEffectTexture1(0)
, m_texIDFBOEffectTexture2(0)
, m_texIDFBOEffectCombine1(0)
, m_texIDFBOEffectCombine2(0)
, m_imageList()
, m_imageListIterator()
, m_time()
, m_interpolationTexture(1.0)
, m_timeTexture()
, m_timeTextureSolo(15.0)//rwrw 30
, m_timeTextureInterpolation(20.0) //rwrw 50
, m_actTex(1)
, m_nextTex(2)
, m_stateTexture(1) //State == 1 => Solo
, m_lastTime(0.0)
, m_triggerImageload(false)
, m_waitForImageToLoad(false)
, m_globaltime(0.0)
, m_stateInterpolationEffectTexture(0)
, m_interpolationEffectTexture( 1.0 )
, m_effectTextureTimeInterpolation( 10 )
//, m_effectTextureMinTimeInterpolation( 10 )
//, m_effectTextureMaxTimeInterpolation( 20 )
, m_stateInterpolationEffectCombine(0)
, m_interpolationEffectCombine( 1.0 )
, m_effectCombineTimeInterpolation( 10 )
//, m_effectCombineMinTimeInterpolation( 12 )
//, m_effectCombineMaxTimeInterpolation( 27 )
, m_maxIterationsEffectSearch(100)
, m_nanotimer()
, m_nrTextureUploads(0)
{
	m_effectTextures.clear();
	m_effectCombines.clear();
}




void FilterShader::init( const QString &directory, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax, unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax )
{
	m_imageDirectory = directory;

	m_timeTextureSoloMin = timeTextureSoloMin;
	m_timeTextureSoloMax = timeTextureSoloMax;
	m_timeTextureInterpolationMin = timeTextureInterpolationMin;
	m_timeTextureInterpolationMax = timeTextureInterpolationMax;
}

void FilterShader::start( int width, int height )
{
	// Revisiting an already-built configuration: just resize, don't rebuild.
	// (Rebuilding leaked GL programs/textures/FBOs and spawned a duplicate
	//  ImageLoader thread every time you switched back to a configuration.)
	if( m_started )
	{
		resize( width, height );
		return;
	}
	m_started = true;

	m_nanotimer.start();

	m_imageList.clear();
	traverse( m_imageDirectory, m_imageList );
	m_imageListIterator = m_imageList.begin();

	printf( "Nr of images: %d\n", (int) m_imageList.size() );
	if( m_imageList.isEmpty() )
		fprintf( stderr, "WARNING: image directory '%s' missing or empty - "
		                 "using a procedural fallback texture.\n",
		         m_imageDirectory.toLocal8Bit().constData() );

	qsrand(0);  // no-op: QRandomGenerator is auto-seeded
    unsigned int start = qrand() % (m_imageList.size() + 1);
	for( unsigned int i = 0; i < start; i++ )
		m_imageListIterator++;
	
	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_actEffectTexture = qrand() % m_effectTextures.size();
		if( m_effectTextures[m_actEffectTexture]->useShader() )
			break;
	}

	//m_actEffectTexture = 0; //rwrwtest


	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_nextEffectTexture = qrand() % m_effectTextures.size();
		if( m_nextEffectTexture != m_actEffectTexture && 
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() ) < 12 )
			&& m_effectTextures[m_nextEffectTexture]->useShader()
			)
			break;
	}

	
	if( m_nextEffectTexture == m_actEffectTexture )
	{
		m_nextEffectTexture += 1;
		if( m_nextEffectTexture == m_effectTextures.size() )
			m_nextEffectTexture = 0;
	}

	//m_effectTextures[m_actEffectTexture]->startInterpolators();



	//rwrwtest
	//m_actEffectTexture = qrand() % m_effectTextures.size();


    m_timeInterpolationEffectTexture = (float) (m_effectTextures[m_actEffectTexture]->getTimeSolo());


	//m_actEffectCombine = qrand() % m_effectCombines.size();

	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_actEffectCombine = qrand() % m_effectCombines.size();
		if( m_effectCombines[m_actEffectCombine]->useShader() )
			break;
	}

	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_nextEffectCombine = qrand() % m_effectCombines.size();
		if( m_nextEffectCombine != m_actEffectCombine && 
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() +
			m_effectCombines[m_actEffectCombine]->getComplexity() +
			m_effectCombines[m_nextEffectCombine]->getComplexity() ) < 20 )
			&& m_effectCombines[m_nextEffectCombine]->useShader()
			)
			break;
	}

	if( m_nextEffectCombine == m_actEffectCombine )
	{
		m_nextEffectCombine += 1;
		if( m_nextEffectCombine == m_effectCombines.size() )
			m_nextEffectCombine = 0;
	}


	//rwrwtest
	//m_actEffectCombine = 6;//5;//3;

    m_timeInterpolationEffectCombine = (float) (m_effectCombines[m_actEffectCombine]->getTimeSolo());

	//Start the timers
	m_time.start();
	m_timeTexture.start();
	m_timeEffectTexture.start();
	m_timeEffectCombine.start();

	
	//m_filterShader = new FilterShader(100,100, directory);
	m_imageLoader = new ImageLoader( this );
    m_imageLoader->start();

	loadShader();
	reinit( width, height );
}

QString FilterShader::activeShaderInfo() const
{
	auto base = [](const char *p) -> QString {
		QString s = QString::fromLatin1(p ? p : "?");
		int i = s.lastIndexOf('\\'); if (i < 0) i = s.lastIndexOf('/');
		return (i >= 0) ? s.mid(i + 1) : s;
	};
	QString out;
	if (!m_effectTextures.empty())
	{
		out += "TEX   " + base(m_effectTextures[m_actEffectTexture]->fragmentName());
		if (m_stateInterpolationEffectTexture != 0)
			out += QString("   → %1  (%2%)")
			       .arg(base(m_effectTextures[m_nextEffectTexture]->fragmentName()))
			       .arg(int((1.0f - m_interpolationEffectTexture) * 100.0f + 0.5f));
	}
	out += "\n";
	if (!m_effectCombines.empty())
	{
		out += "COMB  " + base(m_effectCombines[m_actEffectCombine]->fragmentName());
		if (m_stateInterpolationEffectCombine != 0)
			out += QString("   → %1  (%2%)")
			       .arg(base(m_effectCombines[m_nextEffectCombine]->fragmentName()))
			       .arg(int((1.0f - m_interpolationEffectCombine) * 100.0f + 0.5f));
	}
	return out;
}

void FilterShader::stop()
{
	m_imageLoader->terminate();

	cleanTextures();
	cleanShaderPrograms();

	delete m_imageLoader;
}












#if 0

// Constructor
FilterShader::FilterShader(int width, int height, const QString &directory)
: m_mesh(0)
, m_npot_supported(false)
, m_width(width)
, m_height(height)
, m_texInternalFormat(GL_RGBA8)
, m_texFormat(GL_RGBA)
, m_texType(GL_UNSIGNED_BYTE)
, m_fboEffectTexture1(1)
, m_fboEffectTexture2(2)
, m_fboEffectCombine1(1)
, m_fboEffectCombine2(2)
, m_attachmentpoint(GL_COLOR_ATTACHMENT0_EXT)
, m_texID1(0)
, m_texID2(0)
, m_texIDFBOEffectTexture1(0)
, m_texIDFBOEffectTexture2(0)
, m_texIDFBOEffectCombine1(0)
, m_texIDFBOEffectCombine2(0)
, m_imageList()
, m_imageListIterator()
, m_time()
, m_interpolationTexture(1.0)
, m_timeTexture()
, m_timeTextureSolo(15.0)//rwrw 30
, m_timeTextureSoloMin(5.0)//rwrw 30
, m_timeTextureSoloMax(40.0) //rwrw 120
, m_timeTextureInterpolation(20.0) //rwrw 50
, m_timeTextureInterpolationMin(20.0) //rwrw 40
, m_timeTextureInterpolationMax(80.0) //rwrw 80
, m_actTex(1)
, m_nextTex(2)
, m_stateTexture(1) //State == 1 => Solo
, m_lastTime(0.0)
, m_triggerImageload(false)
, m_waitForImageToLoad(false)
, m_globaltime(0.0)
, m_stateInterpolationEffectTexture(0)
, m_interpolationEffectTexture( 1.0 )
, m_effectTextureTimeInterpolation( 10 )
//, m_effectTextureMinTimeInterpolation( 10 )
//, m_effectTextureMaxTimeInterpolation( 20 )
, m_stateInterpolationEffectCombine(0)
, m_interpolationEffectCombine( 1.0 )
, m_effectCombineTimeInterpolation( 10 )
//, m_effectCombineMinTimeInterpolation( 12 )
//, m_effectCombineMaxTimeInterpolation( 27 )
, m_maxIterationsEffectSearch(100)
, m_nanotimer()
, m_nrTextureUploads(0)
{
	m_nanotimer.start();

	m_imageList.clear();
	traverse( directory, m_imageList );
	m_imageListIterator = m_imageList.begin();

	printf( "Nr of images: %d\n", (int) m_imageList.size() );

	qsrand(0);  // no-op: QRandomGenerator is auto-seeded
    unsigned int start = qrand() % (m_imageList.size() + 1);
	for( unsigned int i = 0; i < start; i++ )
		m_imageListIterator++;
	
	m_effectTextures.clear();
	m_effectCombines.clear();


	
	EffectShader *tunnelPlain = new EffectShader( "..\\TunnelPlain.frag", 20, 120, 30, 120 );
	tunnelPlain->addUniform( "speed", 0.001f, 0.05f );
	tunnelPlain->addUniform( "sides", 3.0f, 14.0f );
	tunnelPlain->addUniform( "power", 1.0f, 4.0f );



	EffectShader *bubbles = new EffectShader( "..\\Bubble.frag", 20, 120, 30, 120 );
	bubbles->addUniform( "speed", 1.0f, 2.5f );
	bubbles->addUniform( "speedColor", 0.5f, 1.5f );
	bubbles->addUniform( "negative", 0.1f );
	bubbles->addUniform( "vigneting", 0.5f );

	TextureEffectKaleidoscopeBase *textureTunnel = new TextureEffectKaleidoscopeBase( "..\\Tunnel.frag", 120, 300, 40, 90 );
	textureTunnel->addUniform( "rotate", 0.7 );
	textureTunnel->addUniform( "speedTunnel", 0.001f, 0.06 );


	TextureEffectKaleidoscopeBase *textureTunnelReverse = new TextureEffectKaleidoscopeBase( "..\\TunnelReverse.frag", 20, 120, 20, 40 );
	textureTunnel->addUniform( "rotate", 0.7 );
	textureTunnel->addUniform( "speedTunnel", 0.001f, 0.03f );
	textureTunnel->addUniform( "speedTunnelReverse", 0.0001f, 0.01f );

	
	TextureEffectKaleidoscopeBase *textureTunnelAccel = new TextureEffectKaleidoscopeBase( "..\\TunnelAcceleration.frag", 10, 20, 10, 20 );
	//TextureEffectKaleidoscopeBase *textureTunnelAccel = new TextureEffectKaleidoscopeBase( "..\\TunnelAcceleration.frag", 40, 180, 10, 40 );
	textureTunnelAccel->addUniform( "rotate", 0.7 );
	textureTunnelAccel->addUniform( "speedTunnel", 0.001f, 0.03f );
	textureTunnelAccel->addUniformInterpolator( "speedTunnelAccel", 0.0, 0.0005f, 0.01f, 0.09f );
	
	
	TextureEffectKaleidoscopeBase *textureTunnelAccel2 = new TextureEffectKaleidoscopeBase( "..\\TunnelAcceleration.frag", 10, 20, 10, 20 );
	//TextureEffectKaleidoscopeBase *textureTunnelAccel2 = new TextureEffectKaleidoscopeBase( "..\\TunnelAcceleration.frag", 40, 180, 10, 40 );
	textureTunnelAccel2->addUniform( "rotate", 0.7 );
	textureTunnelAccel2->addUniform( "speedTunnel", 0.001f, 0.03f );
	textureTunnelAccel2->addUniformInterpolator( "speedTunnelAccel", 0.0, 0.0005f, 0.01f, 0.09f );


	//////////More Tunnels and plain Kaleidoscopes to increase the probability/////////
	
	TextureEffectKaleidoscopeBase *textureKaleidoscopeBase = new TextureEffectKaleidoscopeBase( 20, 90, 60, 120 );
	textureKaleidoscopeBase->addUniform( "rotate", 0.7 );
	
	TextureEffectKaleidoscopeBase *textureKaleidoscopeBase2 = new TextureEffectKaleidoscopeBase( 20, 90, 60, 120 );
	textureKaleidoscopeBase2->addUniform( "rotate", 0.7 );
	
	TextureEffectKaleidoscopeBase *textureKaleidoscopeBase3 = new TextureEffectKaleidoscopeBase( 20, 90, 60, 120 );
	textureKaleidoscopeBase3->addUniform( "rotate", 0.7 );

	TextureEffectKaleidoscopeBase *textureTunnel2 = new TextureEffectKaleidoscopeBase( "..\\Tunnel.frag", 120, 300, 40, 90 );
	textureTunnel2->addUniform( "rotate", 0.7 );
	textureTunnel2->addUniform( "speedTunnel", 0.001f, 0.06 );

	TextureEffectKaleidoscopeBase *textureTunnel3 = new TextureEffectKaleidoscopeBase( "..\\Tunnel.frag", 120, 300, 40, 90 );
	textureTunnel3->addUniform( "rotate", 0.7 );
	textureTunnel3->addUniform( "speedTunnel", 0.001f, 0.06 );

	///////////////////////////////////////////////////////////////////////////////////



	
	EffectShader *rorschach = new EffectShader( "..\\Rorschach.frag", 20, 120, 30, 120 );
	rorschach->addUniform( "positive", 0.5 );
	rorschach->addUniform( "posX", 0.1f, 0.9f );
	rorschach->addUniform( "posY", 0.1f, 0.9f );
	rorschach->addUniform( "posZ", 0.1f, 0.9f );
	rorschach->addUniform( "divisor", .1f, 0.001f );
	//rorschach->addUniform( "fiOffset", .001f, 2.0f );
	rorschach->addUniform( "fiOffset", .001f, 10.0f );



	
	TextureEffectKaleidoscopeBase *textureEffectParallaxKaleidoscope = new TextureEffectKaleidoscopeBase( "..\\TextureEffectParallaxKaleidoscope.frag", 60, 240, 20, 60 );
	textureEffectParallaxKaleidoscope->addUniform( "rotate", 0.2 );
	textureEffectParallaxKaleidoscope->addUniform( "speedMovement", 3.0f, 6.0f ); //5.0
	textureEffectParallaxKaleidoscope->addUniform( "extend", 2000.0f, 8000.0f ); //4000
	textureEffectParallaxKaleidoscope->addUniform( "direction", 0.5 );

	
	TextureEffectKaleidoscopeBase *textureEffectParallaxKaleidoscopeTunnel = new TextureEffectKaleidoscopeBase( "..\\TextureEffectParallaxKaleidoscopeTunnel.frag", 60, 240, 20, 60 );
	textureEffectParallaxKaleidoscopeTunnel->addUniform( "rotate", 0.2 );
	textureEffectParallaxKaleidoscopeTunnel->addUniform( "speedMovement", 3.0f, 6.0f ); //5.0
	textureEffectParallaxKaleidoscopeTunnel->addUniform( "extend", 2000.0f, 8000.0f ); //4000
	textureEffectParallaxKaleidoscopeTunnel->addUniform( "speedTunnel", 0.01f, 0.06 );
	textureEffectParallaxKaleidoscopeTunnel->addUniform( "direction", 0.5 );



	rorschach->setComplexity( 10 );//10
	bubbles->setComplexity( 10 );//10
	tunnelPlain->setComplexity( 1 );//3
	textureTunnel->setComplexity( 1 );
	textureTunnelReverse->setComplexity( 1 );//8
	textureKaleidoscopeBase->setComplexity( 1 );


	textureEffectParallaxKaleidoscopeTunnel->setProbability( 0.005 );
	textureEffectParallaxKaleidoscope->setProbability( 0.01 );
	rorschach->setProbability( 0.01 );
	bubbles->setProbability( 0.01 );
	textureTunnelReverse->setProbability( 0.01 );
	tunnelPlain->setProbability( 0.005 );
	textureKaleidoscopeBase->setProbability( 0.05 );
	textureKaleidoscopeBase2->setProbability( 0.05 );
	textureKaleidoscopeBase3->setProbability( 0.05 );
	//textureKaleidoscopeBase -> 1.0
	//textureKaleidoscopeBase2 -> 1.0
	//textureKaleidoscopeBase3 -> 1.0
	//textureTunnel -> 1.0
	//textureTunnel2 -> 1.0
	//textureTunnel3 -> 1.0
	//textureTunnelAccel -> 1.0
	//textureTunnelAccel2 -> 1.0


	m_effectTextures.push_back( textureTunnelAccel2 );
	m_effectTextures.push_back( textureTunnelAccel );
	/*m_effectTextures.push_back( textureKaleidoscopeBase );
	m_effectTextures.push_back( textureTunnel );
	m_effectTextures.push_back( textureKaleidoscopeBase2 );
	m_effectTextures.push_back( textureKaleidoscopeBase3 );
	m_effectTextures.push_back( textureTunnel2 );
	m_effectTextures.push_back( textureTunnel3 );
	m_effectTextures.push_back( textureEffectParallaxKaleidoscopeTunnel );
	m_effectTextures.push_back( textureEffectParallaxKaleidoscope );
	m_effectTextures.push_back( rorschach );
	m_effectTextures.push_back( tunnelPlain );
	m_effectTextures.push_back( textureTunnelReverse );
	m_effectTextures.push_back( bubbles );*/


	//m_actEffectTexture = qrand() % m_effectTextures.size();
	
	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_actEffectTexture = qrand() % m_effectTextures.size();
		if( m_effectTextures[m_actEffectTexture]->useShader() )
			break;
	}

	m_actEffectTexture = 0; //rwrwtest


	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_nextEffectTexture = qrand() % m_effectTextures.size();
		if( m_nextEffectTexture != m_actEffectTexture && 
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() ) < 12 )
			&& m_effectTextures[m_nextEffectTexture]->useShader()
			)
			break;
	}

	
	if( m_nextEffectTexture == m_actEffectTexture )
	{
		m_nextEffectTexture += 1;
		if( m_nextEffectTexture == m_effectTextures.size() )
			m_nextEffectTexture = 0;
	}

	//m_effectTextures[m_actEffectTexture]->startInterpolators();



	//rwrwtest
	//m_actEffectTexture = qrand() % m_effectTextures.size();


    m_timeInterpolationEffectTexture = (float) (m_effectTextures[m_actEffectTexture]->getTimeSolo());



	EffectShader *combineDeformation =  new EffectShader( "..\\CombineDeformationFlow.frag", 20, 40, 30, 60 );//new EffectShader( "..\\CombinePlain.frag" );//new EffectShader( "..\\CombineWave.frag" );
	combineDeformation->addUniform( "copies", 3.0f, 10.0f );
	combineDeformation->addUniform( "displayGrid", .95 );
	combineDeformation->addUniform( "speed", 0.005f, 0.05f );
	combineDeformation->addUniform( "directionPositive", 0.5 );
	combineDeformation->addUniform( "leftRight", 0.5 );
	

	EffectShader *combineLichtenstein = new EffectShader( "..\\CombineLichtenstein.frag", 10, 60, 40, 120 );
	combineLichtenstein->addUniform( "size", 4.0f, 18.0f );


	EffectShader *combineSphere = new EffectShader( "..\\CombineSphere.frag", 30, 90, 20, 90 );
	combineSphere->addUniform( "radius", 0.5f, 1.0f );
	combineSphere->addUniform( "nrCopies", 1.0f, 8.0f );
	combineSphere->addUniform( "speed", 0.01f, 0.15f );
	combineSphere->addUniform( "rot", 0.5f );

	EffectShader *combineShroom = new EffectShader( "..\\CombineShroom.frag", 10, 30, 20, 60 );
	combineShroom->addUniform( "scale", 0.01f, 0.025f );
	combineShroom->addUniform( "speed", 0.05f, 0.9f );
	combineShroom->addUniform( "negativeU", 0.5f );
	combineShroom->addUniform( "negativeV", 0.5f );
	combineShroom->addUniform( "scaleFactor", 1.0f, 3.5f );

	
	EffectShader *combineWater = new EffectShader( "..\\CombineWater.frag", 10, 20, 20, 40 );

		
	EffectShader *combineMulti = new EffectShader( "..\\CombineMulti.frag", 40, 180, 40, 90 );
	combineMulti->addUniform( "copies", 3.0f, 12.0f );
	combineMulti->addUniform( "rot", 0.5 );

	
	EffectShader *combineMultiShort = new EffectShader( "..\\CombineMulti.frag", 0, 5, 40, 90 );
	combineMultiShort->addUniform( "copies", 3.0f, 12.0f );
	combineMultiShort->addUniform( "rot", 0.5 );

	EffectShader *combinePlain = new EffectShader( "..\\CombinePlain.frag", 60, 240, 60, 120 );//CombineEffectKaleidoscope()
	EffectShader *combinePlain2 = new EffectShader( "..\\CombinePlain.frag", 60, 240, 60, 120 );//CombineEffectKaleidoscope();
	EffectShader *combinePlain3 = new EffectShader( "..\\CombinePlain.frag", 60, 240, 60, 120 );//CombineEffectKaleidoscope();
	EffectShader *combineGrey = new EffectShader( "..\\CombineGrey.frag", 40, 240, 30, 120 );
	EffectShader *combineDarkRed = new EffectShader( "..\\CombineDarkRed.frag", 40, 240, 30, 120 );
	combineDarkRed->addUniform( "red", 0.5 );
	combineDarkRed->addUniform( "blue", 0.5 );

	
	EffectShader *combineRotate = new EffectShader( "..\\CombineRotate.frag", 30, 120, 20, 40 );
	combineRotate->addUniform( "speed", 0.01f, 0.02f );
	combineRotate->addUniform( "direction", 0.5 );

	
	EffectShader *combineOilPaintFlow = new EffectShader( "..\\CombineOilPaintFlow.frag", 20, 120, 30, 120 );
	EffectShader *combineOilPaint = new EffectShader( "..\\CombineOilPaint.frag", 20, 120, 30, 120 );

	//EffectShader *combineParallax = new EffectShader( "..\\CombineParallax.frag", 20, 120, 30, 120 );

	
	//EffectShader *combineWater2 = new EffectShader( "..\\CombineWater2.frag", 20, 120, 30, 120 );
	EffectShader *combineHexagon = new EffectShader( "..\\CombineHexagon.frag", 20, 90, 30, 80 );
	
	
	//combineParallax->setComplexity( 10 );
	combineOilPaint->setComplexity( 10 );
	combineOilPaintFlow->setComplexity( 10 );
	combineRotate->setComplexity(1);
	combineWater->setComplexity(1);
	combineMulti->setComplexity(1);
	combineMultiShort->setComplexity(1);
	combinePlain->setComplexity(1);
	combinePlain2->setComplexity(1);
	combinePlain3->setComplexity(1);
	combineDeformation->setComplexity(1);
	combineLichtenstein->setComplexity(1);
	combineSphere->setComplexity(1);
	combineShroom->setComplexity(1);
	combineGrey->setComplexity(1);
	combineDarkRed->setComplexity(1);

	
	combineHexagon->setProbability( 0.01 );
	combineWater->setProbability( 0.01 );
	combineShroom->setProbability( 0.01 );
	combineDeformation->setProbability( 0.005 );
	combineOilPaint->setProbability( 0.01 );
	combineOilPaintFlow->setProbability( 0.1 );
	combineGrey->setProbability( 0.3 );
	combineSphere->setProbability( 0.01 );
	combineLichtenstein->setProbability( 0.1 );
	combineDarkRed->setProbability( 0.3 );
	combineMulti->setProbability( 0.1 );
	//combineMultiShort -> 1.0
	//combinePlain -> 1.0
	//combinePlain2 -> 1.0
	//combinePlain3 -> 1.0

	m_effectCombines.push_back( combineHexagon );
	//m_effectCombines.push_back( combineParallax );
	//m_effectCombines.push_back( combineWater2 );
	m_effectCombines.push_back( combineOilPaint );
	m_effectCombines.push_back( combineOilPaintFlow );
	//m_effectCombines.push_back( combineRotate );
	m_effectCombines.push_back( combineDarkRed );
	m_effectCombines.push_back( combineWater );
	m_effectCombines.push_back( combineMulti );
	m_effectCombines.push_back( combineMultiShort );
    m_effectCombines.push_back( combinePlain );
	m_effectCombines.push_back( combineDeformation );
	m_effectCombines.push_back( combineLichtenstein );
	m_effectCombines.push_back( combineSphere );
	m_effectCombines.push_back( combineShroom );
	m_effectCombines.push_back( combineGrey );
    m_effectCombines.push_back( combinePlain2 );
    m_effectCombines.push_back( combinePlain3 );

	//m_actEffectCombine = qrand() % m_effectCombines.size();

	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_actEffectCombine = qrand() % m_effectCombines.size();
		if( m_effectCombines[m_actEffectCombine]->useShader() )
			break;
	}

	for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
	{
		m_nextEffectCombine = qrand() % m_effectCombines.size();
		if( m_nextEffectCombine != m_actEffectCombine && 
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() +
			m_effectCombines[m_actEffectCombine]->getComplexity() +
			m_effectCombines[m_nextEffectCombine]->getComplexity() ) < 20 )
			&& m_effectCombines[m_nextEffectCombine]->useShader()
			)
			break;
	}

	if( m_nextEffectCombine == m_actEffectCombine )
	{
		m_nextEffectCombine += 1;
		if( m_nextEffectCombine == m_effectCombines.size() )
			m_nextEffectCombine = 0;
	}


	//rwrwtest
	//m_actEffectCombine = 6;//5;//3;

    m_timeInterpolationEffectCombine = (float) (m_effectCombines[m_actEffectCombine]->getTimeSolo());


	//Start the timers
	m_time.start();
	m_timeTexture.start();
	m_timeEffectTexture.start();
	m_timeEffectCombine.start();

}

#endif


// Destructor
FilterShader::~FilterShader()
{
	cleanTextures();
	cleanShaderPrograms();
	delete m_mesh;
}

void FilterShader::cleanTextures()
{
	glDeleteFramebuffersEXT( 1, &m_fboEffectTexture1 );		// clean up framebuffer object
	glDeleteFramebuffersEXT( 1, &m_fboEffectTexture2 );		// clean up framebuffer object
	glDeleteFramebuffersEXT( 1, &m_fboEffectCombine1 );		// clean up framebuffer object
	glDeleteFramebuffersEXT( 1, &m_fboEffectCombine2 );		// clean up framebuffer object
	glDeleteTextures( 1, &m_actTex );         // clean up textures
	glDeleteTextures( 1, &m_nextTex );
	//glDeleteTextures( 1, &m_texID3 );
}

void FilterShader::cleanShaderPrograms()
{
	glDeleteProgram(m_sh_prog_id_combine);

	
	for( unsigned int i = 0; i < m_effectTextures.size(); i++ )
	{
		m_effectTextures[i]->cleanShaderPrograms();
	}

	
	for( unsigned int i = 0; i < m_effectCombines.size(); i++ )
	{
		m_effectCombines[i]->cleanShaderPrograms();
	}
}



void FilterShader::loadShader()
{
	//checkGLErrors("loadShader 0");
	//cleanShaderPrograms();
	//checkGLErrors("loadShader 1");
	initGLSL();	// init shader runtime
	checkGLErrors("loadShader 2");
}

bool FilterShader::loadObj(const char *filename)
{
	delete m_mesh;
	m_mesh = new Mesh(filename);
	if(!m_mesh->success()) {
		std::cerr << "Failed reading model\n";
		return false;
	}
	return true;
}

void FilterShader::reinit(int width, int height)
{
	fprintf(stderr,"\nreinit start\n");
	checkGLErrors("reinit() 0");
	//cleanTextures();

	// width/height arrive as the DISPLAY (window) resolution.  Render the pipeline
	// at s_renderScale × that; only the final present pass upscales to the display.
	m_displayW = width;
	m_displayH = height;
	m_width  = (int)(width  * s_renderScale + 0.5f);  if (m_width  < 16) m_width  = 16;
	m_height = (int)(height * s_renderScale + 0.5f);  if (m_height < 16) m_height = 16;

	m_nrTextureUploads = 0;
/*	const GLubyte *extstr = glGetString(GL_EXTENSIONS);
	m_npot_supported = (NULL != strstr(reinterpret_cast<const char *>(extstr),"GL_ARB_texture_non_power_of_two"));

	// check whether we can actually load textures of that size on the GPU
	glTexImage2D( GL_PROXY_TEXTURE_2D, 0, m_texInternalFormat,
		m_width, m_height, 0, m_texFormat, m_texType, NULL );
	GLint realwidth;
	glGetTexLevelParameteriv( GL_PROXY_TEXTURE_2D, 0, GL_TEXTURE_WIDTH, &realwidth );
	if ( realwidth == 0 )
	{
		fprintf( stderr, "Can't load textures of size %u x %u on the graphics card!\n", m_width, m_height );
		exit(1);
	}

	// check whether NPOT textures are supported (if any)
	if ( m_width != ( 1 << static_cast<int> ( ROUND( log(static_cast<float>(m_width))/log(2.0f) ) ) ) ||
		m_height != ( 1 << static_cast<int> ( ROUND( log(static_cast<float>(m_height))/log(2.0f) ) ) ) )
	{
		fprintf( stderr, "texture size is  %u x %u x RGBA\n", m_width, m_height );

		if ( m_npot_supported )
			fputs( "NPOT textures are OK.\n", stderr );
		else
		{
			fputs( "NPOT textures are NOT supported!\n", stderr );
			exit(1);
		}
	}*/

	
	for( unsigned int i = 0; i < m_effectTextures.size(); i++ )
	{
		m_effectTextures[i]->initUniforms( m_width, m_height );
	}

	
	for( unsigned int i = 0; i < m_effectCombines.size(); i++ )
	{
		m_effectCombines[i]->initUniforms( m_width, m_height );
	}

	checkGLErrors("reinit() 0");
	createTexture();					// create texture

	createFBOTexture( m_texIDFBOEffectTexture1 );
	createFBOTexture( m_texIDFBOEffectTexture2 );
	createFBOTexture( m_texIDFBOEffectCombine1 );
	createFBOTexture( m_texIDFBOEffectCombine2 );
	initFBO(  m_fboEffectTexture1, m_texIDFBOEffectTexture1 );
	initFBO(  m_fboEffectTexture2, m_texIDFBOEffectTexture2 );
	initFBO(  m_fboEffectCombine1, m_texIDFBOEffectCombine1 );
	initFBO(  m_fboEffectCombine2, m_texIDFBOEffectCombine2 );
	
	//	initFBO();
	// Photosensitivity-safety: final present FBO + brightness-limiting shader.
	setupSafety();

	fprintf(stderr,"reinit end\n");
}


// Lightweight resize – see header.  Only the off-screen FBO colour textures
// depend on the window size; everything else (image textures, shader programs,
// the FBOs themselves) is independent and is kept as-is.  setupFBOTexture()
// re-allocates the storage of an EXISTING texture ID via glTexImage2D, so the
// FBOs that already reference these IDs simply render at the new size.  No
// glGen*/glCreate* is issued, hence no leak and no image reload.
void FilterShader::resize(int width, int height)
{
	if( width <= 0 || height <= 0 )
		return;

	// width/height = display resolution; render at s_renderScale × that.
	m_displayW = width;
	m_displayH = height;
	m_width  = (int)(width  * s_renderScale + 0.5f);  if (m_width  < 16) m_width  = 16;
	m_height = (int)(height * s_renderScale + 0.5f);  if (m_height < 16) m_height = 16;

	// Effect shaders only need their reported resolution updated (no recompile).
	for( unsigned int i = 0; i < m_effectTextures.size(); i++ )
		m_effectTextures[i]->setSize( m_width, m_height );
	for( unsigned int i = 0; i < m_effectCombines.size(); i++ )
		m_effectCombines[i]->setSize( m_width, m_height );

	// Re-allocate the four off-screen colour buffers to the new size, reusing IDs.
	setupFBOTexture( m_texIDFBOEffectTexture1 );
	setupFBOTexture( m_texIDFBOEffectTexture2 );
	setupFBOTexture( m_texIDFBOEffectCombine1 );
	setupFBOTexture( m_texIDFBOEffectCombine2 );

	// Resize the final (present) texture too, keeping its mipmaps.
	if( m_texFinal != 0 )
		updateFinalTexture();

	// Resize the feedback/trail ping-pong textures.
	for( int i = 0; i < 2; ++i )
		if( m_texTrail[i] != 0 )
		{
			glBindTexture( GL_TEXTURE_2D, m_texTrail[i] );
			glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0,
			              m_texFormat, m_texType, NULL );
			glGenerateMipmapEXT( GL_TEXTURE_2D );
		}

	glBindTexture( GL_TEXTURE_2D, 0 );
	checkGLErrors("resize()");
}


// (Re)allocate the mipmapped final-frame texture at the current size.  Mipmaps
// give us a cheap whole-frame average luminance for the brightness limiter.
void FilterShader::updateFinalTexture()
{
	if( m_texFinal == 0 )
		glGenTextures( 1, &m_texFinal );
	glBindTexture( GL_TEXTURE_2D, m_texFinal );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0,
	              m_texFormat, m_texType, NULL );
	glGenerateMipmapEXT( GL_TEXTURE_2D );
	glBindTexture( GL_TEXTURE_2D, 0 );
}

// Create the final FBO + present shader.  If anything fails, m_safetyReady stays
// false and paint() falls back to drawing the combine result straight to screen.
void FilterShader::setupSafety()
{
	updateFinalTexture();

	if( m_fboFinal == 0 )
		glGenFramebuffersEXT( 1, &m_fboFinal );
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboFinal );
	glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
	                           GL_TEXTURE_2D, m_texFinal, 0 );
	bool fboOk = checkFramebufferStatus();
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );

	if( m_presentProgId == 0 )
	{
		m_presentProgId   = setShaders( "..\\standard.vert", "..\\Present.frag" );
		m_presentTexUni   = glGetUniformLocation( m_presentProgId, "tex" );
		m_presentResUni   = glGetUniformLocation( m_presentProgId, "resolution" );
		m_presentScaleUni = glGetUniformLocation( m_presentProgId, "scale" );
		m_presentCentroidUni = glGetUniformLocation( m_presentProgId, "audioCentroid" );
		m_presentValenceUni  = glGetUniformLocation( m_presentProgId, "audioValence" );
		m_presentLevelUni    = glGetUniformLocation( m_presentProgId, "audioLevel" );
		m_presentFluxUni     = glGetUniformLocation( m_presentProgId, "audioFlux" );
		m_presentHueUni      = glGetUniformLocation( m_presentProgId, "audioChromaHue" );
		m_presentBeatUni     = glGetUniformLocation( m_presentProgId, "audioBeat" );
		m_presentDownbeatUni = glGetUniformLocation( m_presentProgId, "audioDownbeat" );
		m_presentOnsetUni    = glGetUniformLocation( m_presentProgId, "audioOnset" );
	}

	m_safetyReady = fboOk && (m_presentProgId != 0) && (m_presentTexUni >= 0);

	// ---- Feedback / trails ping-pong buffers (mipmapped: present reads them) ----
	bool trailOk = true;
	for( int i = 0; i < 2; ++i )
	{
		if( m_texTrail[i] == 0 ) glGenTextures( 1, &m_texTrail[i] );
		glBindTexture( GL_TEXTURE_2D, m_texTrail[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0,
		              m_texFormat, m_texType, NULL );
		glGenerateMipmapEXT( GL_TEXTURE_2D );
		if( m_fboTrail[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboTrail[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboTrail[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texTrail[i], 0 );
		if( !checkFramebufferStatus() ) trailOk = false;
	}
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	if( m_trailProgId == 0 )
	{
		m_trailProgId   = setShaders( "..\\standard.vert", "..\\Feedback.frag" );
		m_trailCurUni   = glGetUniformLocation( m_trailProgId, "texCur" );
		m_trailPrevUni  = glGetUniformLocation( m_trailProgId, "texPrev" );
		m_trailResUni   = glGetUniformLocation( m_trailProgId, "resolution" );
		m_trailDecayUni = glGetUniformLocation( m_trailProgId, "decay" );
	}
	m_feedbackReady = m_safetyReady && trailOk && (m_trailProgId != 0)
	                && (m_trailCurUni >= 0) && (m_trailPrevUni >= 0);

	checkGLErrors("setupSafety()");

	// GPU reaction-diffusion simulation buffers + shader.
	setupReactionDiffusion();

	fprintf( stderr, "setupSafety: safetyReady=%d feedbackReady=%d (present pass = cones %s)\n",
	         (int)m_safetyReady, (int)m_feedbackReady,
	         m_safetyReady ? "ACTIVE" : "DISABLED -> NO CONES/MOOD GRADE" );
}

// Create the two RGBA16F ping-pong buffers and the Gray-Scott step shader.  The
// grid is a fixed, modest size (independent of the window) so it stays cheap even
// on a weak iGPU.  On any failure m_rdReady stays false and effects that sample
// the simulation fall back to the source image.
void FilterShader::setupReactionDiffusion()
{
	if( m_rdProgId == 0 )
	{
		m_rdProgId    = setShaders( "..\\standard.vert", "..\\ReactionDiffusionSim.frag" );
		m_rdPrevUni   = glGetUniformLocation( m_rdProgId, "texPrev" );
		m_rdResUni    = glGetUniformLocation( m_rdProgId, "resolution" );
		m_rdSeedUni   = glGetUniformLocation( m_rdProgId, "seedMode" );
		m_rdFeedUni   = glGetUniformLocation( m_rdProgId, "feed" );
		m_rdKillUni   = glGetUniformLocation( m_rdProgId, "kill" );
		m_rdInjectUni = glGetUniformLocation( m_rdProgId, "inject" );
	}

	bool rdOk = (m_rdProgId != 0) && (m_rdPrevUni >= 0);
	for( int i = 0; i < 2 && rdOk; ++i )
	{
		if( m_texRD[i] == 0 ) glGenTextures( 1, &m_texRD[i] );
		glBindTexture( GL_TEXTURE_2D, m_texRD[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kRDSize, kRDSize, 0,
		              GL_RGBA, GL_FLOAT, NULL );
		if( m_fboRD[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboRD[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboRD[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texRD[i], 0 );
		if( !checkFramebufferStatus() ) rdOk = false;
	}
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	m_rdReady  = rdOk;
	m_rdSeeded = false;   // first step writes the seed pattern
	checkGLErrors("setupReactionDiffusion()");
}

// Advance the Gray-Scott simulation by one step into the next ping-pong buffer.
void FilterShader::stepReactionDiffusion(const AudioFeatures &audio)
{
	if( !m_rdReady )
		return;

	const int cur  = m_rdIdx;
	const int prev = 1 - m_rdIdx;

	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboRD[cur] );
	glViewport( 0, 0, kRDSize, kRDSize );
	glUseProgram( m_rdProgId );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texRD[prev] );
	glUniform1i( m_rdPrevUni, 0 );
	if( m_rdResUni  >= 0 ) glUniform2f( m_rdResUni, (float)kRDSize, (float)kRDSize );
	if( m_rdSeedUni >= 0 ) glUniform1f( m_rdSeedUni, m_rdSeeded ? 0.f : 1.f );

	// Subtle audio modulation of the feed rate keeps the pattern evolving; the
	// kill rate is held steady so the simulation stays in its interesting regime.
	if( m_rdFeedUni >= 0 ) glUniform1f( m_rdFeedUni, 0.0545f + 0.004f * audio.spectralCentroid );
	if( m_rdKillUni >= 0 ) glUniform1f( m_rdKillUni, 0.062f );
	// Onsets / beats inject fresh reagent so the field blossoms with the music.
	float inject = (audio.onsetStrength > 0.2f || audio.beatDecay > 0.3f) ? 1.f : 0.f;
	if( m_rdInjectUni >= 0 ) glUniform1f( m_rdInjectUni, inject );

	drawWindow();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_rdSeeded = true;
	m_rdIdx    = prev;   // ping-pong swap; newest state is now m_texRD[1 - m_rdIdx]
}

// Mood-based selection bias — see header.
bool FilterShader::moodAccept(unsigned int complexity)
{
	float target = 1.f + m_lastArousal * 9.f;               // desired busyness 1..10
	float diff   = fabs(float(complexity) - target) / 9.f;  // 0..1
	float accept = 1.f - 0.6f * diff;                       // closer match → likelier
	return (float(qrand()) / float(RAND_MAX)) < accept;
}

void FilterShader::paint(const float *rotMatrix, float tx, float ty, float tz,
                         const AudioFeatures &audio)
{
	m_lastArousal = audio.arousal;   // for mood-biased effect selection

    // Update adaptive timing scale from audio analysis.
    // Smooth slowly so a sudden genre change doesn't cause a jarring jump.
    // The new scale only takes effect the next time a duration is randomised,
    // so existing running timers complete at their original length.
    // When the audio is NOT music (speech / video / silence), musicPresence
    // pulls the scale back to the neutral 1.0 so scene timing behaves normally.
    float effTimingScale = 1.0f + (audio.timingScale - 1.0f) * audio.musicPresence;
    m_timingScale = 0.999f * m_timingScale + 0.001f * effTimingScale;
    // Guard against zero to avoid division-by-zero below.
    if (m_timingScale < 0.05f) m_timingScale = 0.05f;

	// -------------------------
	// ----- render pass 1 -----
	// -------------------------

	/*glBindTexture( GL_TEXTURE_2D, 0 );
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fbo );
	//glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glViewport( 0, 0, m_width, m_height );
	glUseProgram( 0 );
	drawScene( rotMatrix, tx, ty, tz );
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_defaultFBO );
	checkFramebufferStatus();*/
	float timeSinceLastFrame = m_nanotimer.elapsed();
	//if( timeSinceLastFrame > 20.0 )
	//printf( "%f\n", timeSinceLastFrame );
	m_nanotimer.start();

	float timeSinceLastFrameSec = timeSinceLastFrame * 0.001;


    // -----------------------------------------------------------------------
    // Audio-reactive motion: integrate rates into continuous phases.
    // The previous mapping multiplied the absolute 'time' uniform by an
    // audio-varying speed and a flipping sign, so every audio change jumped the
    // whole accumulated phase at once → the seizure-grade flicker.  Here we
    // build a processed copy of the features: motion becomes smoothly integrated
    // phase offsets, and the brightness signals are slew-rate limited so beats
    // pulse instead of strobing.  All applyAudioFeatures() calls below use it.
    // -----------------------------------------------------------------------
    AudioFeatures audioFx = audio;
    {
        float dt = timeSinceLastFrameSec;
        if (dt < 0.f)  dt = 0.f;
        if (dt > 0.1f) dt = 0.1f;   // ignore long stalls (first frame, load hitches)

        // Global reactivity strength.  All audio-driven MOTION is scaled by this
        // single knob — raise it for a wilder show, lower it for calm.  (Motion is
        // integrated into phases, so larger values stay smooth and never flicker.)
        const float kReactivity = s_reactivity;   // live-tunable (hotkeys)

        // MASTER GATE: when the audio is not music (speech / video / silence) this
        // fades to 0, so all the audio-driven motion, pulses and mood shifts below
        // smoothly collapse to neutral and the visuals run in their calm,
        // timer-driven "non-audio" mode.  Music returning fades it back to 1.
        // Music gate: clear speech (~0.3 musicPresence) collapses to 0 reaction,
        // while real music (>=~0.6) gets FULL reaction.  Tuned to give genuine
        // music plenty of headroom (so beats/cones stay strong) yet still cut pure
        // speech.  smoothstep over [0.32 .. 0.60].
        float gate = (audio.musicPresence - 0.32f) / 0.28f;
        gate = (gate < 0.f) ? 0.f : (gate > 1.f ? 1.f : gate);
        gate = gate * gate * (3.f - 2.f * gate);          // smoothstep

        // Ease rotation direction between +1/-1 so reversals never snap.  Even
        // an instant flip would now only change the *rate*, not the phase, but
        // easing keeps the velocity change graceful too.
        float dirTarget = (audio.audioFlip >= 0.f) ? 1.f : -1.f;
        float dirStep   = dt * 1.5f;
        if (dirStep > 1.f) dirStep = 1.f;
        m_audioDir += (dirTarget - m_audioDir) * dirStep;

        // Ease the kaleidoscope symmetry toward its (beat-chosen) target so it steps
        // gradually through integers instead of snapping (rounded on upload).
        float sidesStep = dt * 3.0f;
        if (sidesStep > 1.f) sidesStep = 1.f;
        m_smoothedSides += (float(audio.beatSidesHint) - m_smoothedSides) * sidesStep;
        audioFx.smoothedSides = m_smoothedSides;

        // "motion" weights INSTANTANEOUS loudness over the slow arousal mood, so the
        // speed visibly rises and falls WITH the music rather than holding a constant
        // fast spin.  (Earlier this was arousal-dominated → a steady ~0.8 rad/s spin
        // that looked fast but unreactive.)
        float motion = 0.25f * audio.arousal + 0.75f * audio.overallLevel;

        // A gentle in-tempo "breathing" from the continuous beat phase.
        float beatBreath = 0.5f - 0.5f * cosf(audio.beatPhase * 6.2831853f);

        // Rotation angular velocity (rad/s).  The rotation SPEED must change only
        // gradually with the music's overall energy — never jerk on individual
        // beats (the rhythmic accent lives in the corner spotlights now).  So the
        // audio term is a SLOWLY slewed energy envelope (no per-beat spikes) with a
        // small gain, plus a tiny steady drift and a gentle in-tempo breathing.
        float rotEnergyTarget = 0.50f * motion + 0.35f * audio.spectralFlux;
        m_rotEnergy = slewToward(m_rotEnergy, rotEnergyTarget, 0.7f, dt);  // ~1.4 s to change
        float rotRate = m_audioDir * kReactivity * gate
                      * ( 0.06f * motion                       // tiny steady drift
                        + 1.20f * m_rotEnergy                  // smooth, clearly-varying audio speed
                        + 0.10f * motion * beatBreath );       // gentle in-tempo breathing
        m_audioRotPhase += dt * rotRate;

        // Tunnel forward advance: also transient-dominated (flux / harmonic change),
        // with only a whisper of steady loudness, so busy passages surge briefly.
        float advRate = kReactivity * gate
                      * ( 0.015f + 0.08f * audio.spectralFlux + 0.02f * motion
                                 + 0.10f * audio.harmonicChange );
        m_audioAdvance += dt * advRate;

        // Slew-limit brightness drivers (photosensitive-safety): a beat may rise
        // to full over ~150 ms, never in a single frame.  Gated by musicPresence.
        m_audioBeatSmooth  = slewToward(m_audioBeatSmooth,  audio.beatDecay,    6.0f, dt);
        m_audioLevelSmooth = slewToward(m_audioLevelSmooth, audio.overallLevel, 3.0f, dt);
        m_audioFluxSmooth  = slewToward(m_audioFluxSmooth,  audio.spectralFlux, 3.0f, dt);

        audioFx.audioRotPhase = m_audioRotPhase;
        audioFx.audioAdvance  = m_audioAdvance;
        audioFx.beatDecay     = m_audioBeatSmooth     * gate;
        audioFx.onsetStrength = audio.onsetStrength   * gate;
        audioFx.downbeat      = audio.downbeat        * gate;
        audioFx.overallLevel  = m_audioLevelSmooth    * gate;
        audioFx.spectralFlux  = m_audioFluxSmooth     * gate;
        audioFx.stereoWidth   = audio.stereoWidth     * gate;
        // Mood signals collapse to neutral (0.5 / 0) as music fades out.
        audioFx.valence         = 0.5f + (audio.valence         - 0.5f) * gate;
        audioFx.arousal         = 0.5f + (audio.arousal         - 0.5f) * gate;
        audioFx.spectralCentroid= 0.5f + (audio.spectralCentroid- 0.5f) * gate;
        audioFx.chromaHue       = audio.chromaHue * gate;
        audioFx.harmonicChange  = audio.harmonicChange * gate;
        audioFx.roughness       = audio.roughness      * gate;
        audioFx.sharpness       = audio.sharpness      * gate;
        audioFx.deltaPitch      = audio.deltaPitch     * gate;
    }

    // Musical novelty: a strong harmonic / section change (a drop, a key change)
    // forces an early cross-fade to the next effect — rate-limited, and only
    // while music is actually playing.
    m_noveltyCooldown -= timeSinceLastFrameSec;
    if( m_noveltyCooldown <= 0.f &&
        audio.harmonicChange * audio.musicPresence > 0.5f )
    {
        m_forceEffectChange = true;
        m_noveltyCooldown   = 8.0f;   // at most one musical cut every ~8 s
    }

    if( m_waitForImageToLoad )
    {
        if( !m_triggerImageload )
        {
            m_waitForImageToLoad = false;

			//NanoTimer timerLT;
			//timerLT.start();

            loadNewTexture( m_nextTex );

			//float timeTexture = timerLT.elapsed();
			//printf( "Time Texture: %f\n", timeTexture );
        }
    }

    
    unsigned int loadimage = 0;

	//No Interpolation, solo texture 1:
	if( m_stateTexture == 1 )
	{
		
		m_interpolationTexture = 1.0;

		//time is up => switch to modus blending
		float ts = float(m_timeTexture.elapsed()) * 0.001;
		if( ts > m_timeTextureSolo )
		{
			m_stateTexture = 0;
			m_timeTexture.start();

            m_timeTextureSolo = (float) (m_timeTextureSoloMin + (qrand() % (m_timeTextureSoloMax - m_timeTextureSoloMin))) / m_timingScale;
		}
	}
	else
	{
		float ts = float(m_timeTexture.elapsed()) * 0.001;
		
		m_interpolationTexture = 1.0-ts/m_timeTextureInterpolation;//0.5*(cos( ts/m_timeInterpolation * M_PI ) + 1.0);

		if( ts > m_timeTextureInterpolation )
		{
			m_stateTexture = 1;
			m_timeTexture.start();

			GLuint temp = m_actTex;
			m_actTex = m_nextTex;
            m_nextTex = temp;
			//loadNewTexture( temp );
            m_waitForImageToLoad = true;
            m_triggerImageload = true;

            loadimage = 1;

			m_interpolationTexture = 1.0;

            m_timeTextureInterpolation = (float) (m_timeTextureInterpolationMin + (qrand() % (m_timeTextureInterpolationMax - m_timeTextureInterpolationMin))) / m_timingScale;
		}
	}
    
/***********************************State Machine for Interpolation between two texture effects*****************************************/

    //State Machine for Interpolation between Tunnel and Plain
    //Full Plain
    if( m_stateInterpolationEffectTexture == 0 )
	{
        m_interpolationEffectTexture = 1.0;

		float ts = float(m_timeEffectTexture.elapsed()) * 0.001;

		// End the solo early on a manual ('n') or novelty-driven request, but
		// only after a brief minimum so cuts never come back-to-back.
		bool forced = m_forceEffectChange;
		if( ts > m_timeInterpolationEffectTexture || (forced && ts > 0.6f) )
		{
			m_forceEffectChange = false;

			m_stateInterpolationEffectTexture = 1;

			unsigned int timeAct = m_effectTextures[m_actEffectTexture]->getTimeInterpolation();
			unsigned int timeNext = m_effectTextures[m_nextEffectTexture]->getTimeInterpolation();

			// A manual ('n') cut uses a short, snappy cross-fade so it is clearly a
			// switch; a natural change uses the config's (long) interpolation time.
			m_timeInterpolationEffectTexture = forced ? 0.8f
			                  : (float) (std::min( timeAct, timeNext)) / m_timingScale;

			
			m_effectTextures[m_nextEffectTexture]->startInterpolators();

			m_timeEffectTexture.start();
		}

	}
    //Decreasing
	else
	{
		float ts = float(m_timeEffectTexture.elapsed()) * 0.001;
		
		m_interpolationEffectTexture = (1-ts/m_timeInterpolationEffectTexture);

		if( ts > m_timeInterpolationEffectTexture )
		{
			m_stateInterpolationEffectTexture = 0;

			m_effectTextures[m_actEffectTexture]->resetParameters();
			m_actEffectTexture = m_nextEffectTexture;
			fprintf( stderr, "TEX  -> %s\n", m_effectTextures[m_actEffectTexture]->fragmentName() );

			for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
			{
				m_nextEffectTexture = qrand() % m_effectTextures.size();
				if( m_nextEffectTexture != m_actEffectTexture &&
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() +
			m_effectCombines[m_actEffectCombine]->getComplexity() +
			m_effectCombines[m_nextEffectCombine]->getComplexity() ) < 20 )
			&& m_effectTextures[m_nextEffectTexture]->useShader()
			&& moodAccept( m_effectTextures[m_nextEffectTexture]->getComplexity() )
			)
					break;
			}

					
			if( m_nextEffectTexture == m_actEffectTexture )
			{
				m_nextEffectTexture += 1;
				if( m_nextEffectTexture == m_effectTextures.size() )
					m_nextEffectTexture = 0;
			}

			/*if( m_actEffectTexture == 0 )
				m_nextEffectTexture = 1;
			else
				m_nextEffectTexture = 0;*/


            m_interpolationEffectTexture = 1.0;
			
			m_timeInterpolationEffectTexture = (float) (m_effectTextures[m_actEffectTexture]->getTimeSolo()) / m_timingScale;


			m_timeEffectTexture.start();
		}
	}

	//printf( "%d\t%d\t%f\n", m_stateInterpolationEffectTexture, m_actEffectTexture, m_interpolationEffectTexture );
    
    //printf( "Rotation t n: %d %f %f\n", m_stateInterpolationTunnel, m_speedKaleidoscopeTunnelAct, m_speedTunnelAct );

	// -------------------------
	// ----- render pass 2 -----
	// -------------------------
	// ** TODO **
	
	//float t = float(m_time.elapsed()) * 0.001;
    
	m_globaltime += timeSinceLastFrameSec; //t//+= 0.01f;
	//m_lastTime = t;


	// Advance the on-GPU reaction-diffusion simulation one step, then expose its
	// living field on a dedicated global sampler unit (7) so any effect (e.g.
	// ReactionDiffusion.frag) can sample it via the "texSim" uniform.  (Renders at
	// the small RD grid; the viewport is restored to render-resolution just below.)
	// Only step it when an effect that actually samples texSim is on screen (the
	// active one, or - during a cross-fade - the incoming one): no point spending
	// GPU on the simulation while nothing displays it.
	bool rdNeeded = m_rdReady &&
	    ( m_effectTextures[m_actEffectTexture]->usesSim()
	   || ( m_stateInterpolationEffectTexture != 0
	        && m_effectTextures[m_nextEffectTexture]->usesSim() ) );
	if( rdNeeded )
	{
		stepReactionDiffusion( audio );
		glActiveTexture( GL_TEXTURE7 );
		glBindTexture( GL_TEXTURE_2D, m_texRD[1 - m_rdIdx] );   // newest state
	}


	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	glActiveTexture(GL_TEXTURE0);
	glBindTexture( GL_TEXTURE_2D, m_actTex );

	
	glActiveTexture(GL_TEXTURE1);
	glBindTexture( GL_TEXTURE_2D, m_nextTex );


	//Do the FBO Stuff
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboEffectTexture1 );

    //glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint, GL_TEXTURE_2D, m_texIDFBOEffectTexture1, 0);

	m_effectTextures[m_actEffectTexture]->enableShader();
	m_effectTextures[m_actEffectTexture]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
	m_effectTextures[m_actEffectTexture]->applyAudioFeatures( audioFx );
	m_effectTextures[m_actEffectTexture]->draw();


	checkGLErrors("createTextures() 1");

	//Now Use Final Rendering
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_defaultFBO );
	checkFramebufferStatus();

	//Do the FBO Stuff
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboEffectTexture2 );

	// Skip the "next" texture effect while NOT cross-fading: every combine weights
	// this output (tex1) by (1-interpolation), which is 0 at interpolation==1.0, so
	// it is invisible.  Saves a whole effect pass during the common solo periods.
	if( m_stateInterpolationEffectTexture != 0 )
	{
		m_effectTextures[m_nextEffectTexture]->enableShader();
		m_effectTextures[m_nextEffectTexture]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
		m_effectTextures[m_nextEffectTexture]->applyAudioFeatures( audioFx );
		m_effectTextures[m_nextEffectTexture]->draw();
	}

	
	//Now Use Post Processing
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_defaultFBO );
	checkFramebufferStatus();

	//printf( "%f %d\n", t-m_lastTime, loadimage );
   



	//Now Use Final Rendering
	// -------------------------
	// ----- render pass 3 -----
	// -------------------------
	// ** TODO **

/******************State Machine for the post processing*******************************/
	
/***********************************Plain and Full*****************************************/

    //State Machine for Interpolation between Tunnel and Plain
    //Full Plain
    if( m_stateInterpolationEffectCombine == 0 )
	{
        m_interpolationEffectCombine = 1.0;

		float ts = float(m_timeEffectCombine.elapsed()) * 0.001;
		bool forcedC = m_forceCombineChange;
		if( ts > m_timeInterpolationEffectCombine || (forcedC && ts > 0.6f) )
		{
			m_forceCombineChange = false;

			m_stateInterpolationEffectCombine = 1;

			unsigned int timeAct = m_effectCombines[m_actEffectCombine]->getTimeInterpolation();
			unsigned int timeNext = m_effectCombines[m_nextEffectCombine]->getTimeInterpolation();

			// Manual ('n') cut → short snappy cross-fade; natural change → config time.
			m_timeInterpolationEffectCombine = forcedC ? 0.8f
			                  : (float) (std::min( timeAct, timeNext)) / m_timingScale;

			m_effectCombines[m_nextEffectCombine]->startInterpolators();

			m_timeEffectCombine.start();
		}

	}
    //Decreasing
	else
	{
		float ts = float(m_timeEffectCombine.elapsed()) * 0.001;
		
		m_interpolationEffectCombine = (1-ts/m_timeInterpolationEffectCombine);

		if( ts > m_timeInterpolationEffectCombine )
		{
			m_stateInterpolationEffectCombine = 0;

			m_effectCombines[m_actEffectCombine]->resetParameters();
			m_actEffectCombine = m_nextEffectCombine;
			fprintf( stderr, "COMB -> %s\n", m_effectCombines[m_actEffectCombine]->fragmentName() );

			for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
			{
				m_nextEffectCombine = qrand() % m_effectCombines.size();
				if( m_nextEffectCombine != m_actEffectCombine &&
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() +
			m_effectCombines[m_actEffectCombine]->getComplexity() +
			m_effectCombines[m_nextEffectCombine]->getComplexity() ) < 20 )
			&& m_effectCombines[m_nextEffectCombine]->useShader()
			&& moodAccept( m_effectCombines[m_nextEffectCombine]->getComplexity() )
			 )
					break;
			}
					
			if( m_nextEffectCombine == m_actEffectCombine )
			{
				m_nextEffectCombine += 1;
				if( m_nextEffectCombine == m_effectCombines.size() )
					m_nextEffectCombine = 0;
			}

			//m_nextEffectCombine = 0;

			/*if( m_actEffectCombine == 0 )
				m_nextEffectCombine = 1;
			else
				m_nextEffectCombine = 0;*/


            m_interpolationEffectCombine = 1.0;

            m_timeInterpolationEffectCombine = (float) (m_effectCombines[m_actEffectCombine]->getTimeSolo()) / m_timingScale;//(float) (m_effectCombineMinTimeSolo[m_actEffectCombine] + (qrand() % (m_effectCombineMaxTimeSolo[m_actEffectCombine] - m_effectCombineMinTimeSolo[m_actEffectCombine])));
			
			m_timeEffectCombine.start();
		}
	}

	
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	glActiveTexture(GL_TEXTURE3);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectTexture1 );
	
	glActiveTexture(GL_TEXTURE4);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectTexture2 );


	//Do the FBO Stuff
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboEffectCombine1 );

    //glFramebufferCombine2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint, GL_Combine_2D, m_texIDFBOEffectCombine1, 0);

	m_effectCombines[m_actEffectCombine]->enableShader();
	m_effectCombines[m_actEffectCombine]->setUniforms( m_globaltime, m_interpolationEffectTexture, 3, 4 );
	m_effectCombines[m_actEffectCombine]->applyAudioFeatures( audioFx );
	m_effectCombines[m_actEffectCombine]->draw();


	checkGLErrors("createCombines() 1");


    /*glFramebufferCombine2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint, GL_Combine_2D, m_texIDFBOEffectCombine2, 0);

	m_effectCombines[m_nextEffectCombine]->enableShader();
	m_effectCombines[m_nextEffectCombine]->setUniforms( m_globaltime, m_interpolationCombine );
	m_effectCombines[m_nextEffectCombine]->draw();*/


	//Now Use Final Rendering
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_defaultFBO );
	checkFramebufferStatus();

	//Do the FBO Stuff
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboEffectCombine2 );

	// Skip the "next" combine while NOT cross-fading combines: the final present
	// pass (CombinePlain) weights this output by (1-interpolation)=0 at
	// interpolation==1.0, so it is invisible.  Saves the second combine pass.
	if( m_stateInterpolationEffectCombine != 0 )
	{
		m_effectCombines[m_nextEffectCombine]->enableShader();
		m_effectCombines[m_nextEffectCombine]->setUniforms( m_globaltime, m_interpolationEffectTexture, 3, 4 );
		m_effectCombines[m_nextEffectCombine]->applyAudioFeatures( audioFx );
		m_effectCombines[m_nextEffectCombine]->draw();
	}

	
	//Now Use Final Rendering — into the safety FBO if active, else to the screen.
	GLuint combineTarget = m_safetyReady ? m_fboFinal : m_defaultFBO;
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, combineTarget );
	checkFramebufferStatus();

	/*******************************************************************************/

	glUseProgram( m_sh_prog_id_combine );
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );


	//rwrw
	//glUniform1i( m_texPointCombineUni1, 3 );		// texture Unit 0, nicht mit texId verwechseln
	//glUniform1i( m_texPointCombineUni2, 4 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointCombineUni1, 5 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointCombineUni2, 6 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform2f( m_texSizeRcpCombineUni, (float) m_width, (float) m_height );
    glUniform1f( m_interpolationCombineUni, m_interpolationEffectCombine );
	glUniform1f( m_timeCombineUni, m_globaltime );



	//rwrw
	/*glActiveTexture(GL_TEXTURE3);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectTexture1 );
	
	glActiveTexture(GL_TEXTURE4);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectTexture2 );*/


	glActiveTexture(GL_TEXTURE5);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectCombine1 );
	
	glActiveTexture(GL_TEXTURE6);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectCombine2 );

	drawWindow();

	// -------------------------------------------------------------------------
	// Feedback / trails pass: blend the previous displayed frame back in so bright
	// moving structures leave glowing, fading trails.  Ping-pong of two buffers;
	// the result becomes the present source.  decay (→0 in non-music) controls the
	// trail length, longer in ambient passages.
	// -------------------------------------------------------------------------
	GLuint presentSource = m_texFinal;
	if( m_feedbackReady )
	{
		int cur  = m_trailIdx;
		int prev = 1 - m_trailIdx;
		float decay = s_trailAmount * (0.90f + 0.08f * audio.ambientFactor)
		            * audio.musicPresence;

		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboTrail[cur] );
		glViewport( 0, 0, m_width, m_height );
		glUseProgram( m_trailProgId );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, m_texFinal );
		glActiveTexture( GL_TEXTURE1 );
		glBindTexture( GL_TEXTURE_2D, m_texTrail[prev] );
		glUniform1i( m_trailCurUni,  0 );
		glUniform1i( m_trailPrevUni, 1 );
		if( m_trailResUni   >= 0 ) glUniform2f( m_trailResUni, (float)m_width, (float)m_height );
		if( m_trailDecayUni >= 0 ) glUniform1f( m_trailDecayUni, decay );
		drawWindow();

		presentSource = m_texTrail[cur];
		m_trailIdx    = prev;   // swap for next frame
	}

	// -------------------------------------------------------------------------
	// Photosensitivity-safety present pass.
	// The frame to display now lives in presentSource.  We read its whole-frame avg
	// luminance (via a coarse mip level) and choose a single brightness scale so
	// that the average can never RISE faster than a safe limit per second — this
	// reins in large full-screen flashes while leaving local pattern motion (a
	// uniform scale) completely untouched.  scale is clamped to <=1 so the pass
	// can only ever darken, never brighten.  On any failure we already rendered
	// straight to screen (m_safetyReady == false), so nothing is lost.
	// -------------------------------------------------------------------------
	if( m_safetyReady )
	{
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, presentSource );
		glGenerateMipmapEXT( GL_TEXTURE_2D );          // every frame (bloom samples a mip)

		// The whole-frame mean comes from a glGetTexImage readback, which forces a
		// GPU→CPU sync stall — costly on weak GPUs.  Do it only every 3rd frame and
		// reuse the brightness scale in between (dt is accumulated so the per-second
		// limit stays correct).  Photosensitivity is unaffected (slow limiter).
		m_safetyAccumDt += timeSinceLastFrameSec;
		float scale = m_lastSafetyScale;
		if( (++m_safetyFrame % 3) == 0 )
		{
			int maxDim = (m_width > m_height) ? m_width : m_height;
			int lvl = 0;
			for( int d = maxDim; d > 4; d >>= 1 ) lvl++;   // a small (<=4 px) mip level
			int lw = 1, lh = 1;
			glGetTexLevelParameteriv( GL_TEXTURE_2D, lvl, GL_TEXTURE_WIDTH,  &lw );
			glGetTexLevelParameteriv( GL_TEXTURE_2D, lvl, GL_TEXTURE_HEIGHT, &lh );
			if( lw < 1 ) lw = 1;
			if( lh < 1 ) lh = 1;
			int npx = lw * lh;
			if( npx > 64 ) npx = 64;
			float buf[ 4 * 64 ];
			glGetTexImage( GL_TEXTURE_2D, lvl, GL_RGBA, GL_FLOAT, buf );
			float mean = 0.f;
			for( int i = 0; i < npx; i++ )
				mean += 0.299f*buf[i*4+0] + 0.587f*buf[i*4+1] + 0.114f*buf[i*4+2];
			mean /= float(npx);

			if( m_prevMeanLum < 0.f ) m_prevMeanLum = mean;
			float maxStep = 2.0f * m_safetyAccumDt;          // <= 2.0 luma / second
			float hi = m_prevMeanLum + maxStep;
			float clamped = (mean > hi) ? hi : mean;         // only limit RISES
			scale = (mean > 1e-4f) ? (clamped / mean) : 1.f;
			if( scale > 1.f ) scale = 1.f;                   // never brighten
			m_prevMeanLum = (mean < m_prevMeanLum) ? mean : clamped;
			m_lastSafetyScale = scale;
			m_safetyAccumDt = 0.f;
		}

		// The present pass is the ONLY one at full display resolution — it upscales
		// the render-resolution result to the window.
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_defaultFBO );
		glViewport( 0, 0, m_displayW, m_displayH );
		glUseProgram( m_presentProgId );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, presentSource );
		glUniform1i( m_presentTexUni, 0 );
		if( m_presentResUni   >= 0 ) glUniform2f( m_presentResUni, (float)m_displayW, (float)m_displayH );
		if( m_presentScaleUni >= 0 ) glUniform1f( m_presentScaleUni, scale );
		// Global mood grade — gated values (neutral in non-music mode), scaled by the
		// live mood-strength knob (deviations from neutral × s_moodStrength).
		float ms = s_moodStrength;
		if( m_presentCentroidUni >= 0 ) glUniform1f( m_presentCentroidUni, 0.5f + (audioFx.spectralCentroid - 0.5f) * ms );
		if( m_presentValenceUni  >= 0 ) glUniform1f( m_presentValenceUni,  0.5f + (audioFx.valence          - 0.5f) * ms );
		if( m_presentLevelUni    >= 0 ) glUniform1f( m_presentLevelUni,    audioFx.overallLevel * ms );
		if( m_presentFluxUni     >= 0 ) glUniform1f( m_presentFluxUni,     audioFx.spectralFlux * ms );
		if( m_presentHueUni      >= 0 ) glUniform1f( m_presentHueUni,      audioFx.chromaHue    * ms );
		if( m_presentBeatUni     >= 0 ) glUniform1f( m_presentBeatUni,     audioFx.beatDecay );
		if( m_presentDownbeatUni >= 0 ) glUniform1f( m_presentDownbeatUni, audioFx.downbeat );
		if( m_presentOnsetUni    >= 0 ) glUniform1f( m_presentOnsetUni,    audioFx.onsetStrength );
		drawWindow();
	}

	checkGLErrors("paint() 2");
}

void FilterShader::drawScene(const float *rotMatrix, float tx, float ty, float tz)
{
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	
	glMatrixMode(GL_PROJECTION);
	glLoadIdentity();
	gluPerspective(60,m_width/static_cast<float>(m_height), 0.1, 50);
	//glFrustum(-1.0, 1.0, -1.0, 1.0, 10, 400);
	glMatrixMode(GL_MODELVIEW);
	glLoadIdentity();
	glTranslatef(tx, ty, tz);
	glMultMatrixf(rotMatrix); //

	if(0 != m_mesh)
	{
		float scale = (m_mesh->bmax - m_mesh->bmin).length()/3;
		glScalef(1/scale, 1/scale, 1/scale);
		Vector3D center = (m_mesh->bmax + m_mesh->bmin)/2;
		glTranslatef(-center[0], -center[1], -center[2]);
		m_mesh->draw();
	}
}

void FilterShader::drawWindow()
{
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );

	glMatrixMode(GL_PROJECTION);
	glLoadIdentity();
	gluOrtho2D(0,m_width,0,m_height);
	glMatrixMode(GL_MODELVIEW);
	glLoadIdentity();
	glPolygonMode( GL_FRONT, GL_FILL );

	glBegin(GL_QUADS);
	glTexCoord2f(0,0); glVertex2f(0,0);
	glTexCoord2f(1,0); glVertex2f(m_width,0);
	glTexCoord2f(1,1); glVertex2f(m_width,m_height);
	glTexCoord2f(0,1); glVertex2f(0,m_height);
	glEnd();
}


/**
 * Create framebuffer object, bind it to reroute rendering operations 
 * from the traditional framebuffer to the off-screen buffer
 */
void FilterShader::initFBO(GLuint &fboEffect, GLuint &texIDEffectTexture)
{
	// create FBO (off-screen framebuffer)
    glGenFramebuffersEXT( 1, &fboEffect ); 

    // bind offscreen framebuffer (that is, skip the window-specific render target)
    glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, fboEffect );

    // check if something went completely wrong
    checkGLErrors("initFBO()");
		// attach texture to FBO
    glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
							   GL_TEXTURE_2D, texIDEffectTexture, 0);
	checkGLErrors("initFBO()");

	// create depth buffer
	//glGenRenderbuffersEXT(1, &m_depthFbo);
	//glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_depthFbo);
	//glRenderbufferStorageEXT(GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT, m_width, m_height);
	// attach depthbuffer to FBO
	//glFramebufferRenderbufferEXT(GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT, GL_RENDERBUFFER_EXT, m_depthFbo);


	// check if that worked
    if ( !checkFramebufferStatus() )
	{
		fputs( "glFramebufferTexture2DEXT() FAILED!\n", stderr );
		exit(1);
	}
}


void FilterShader::loadNewTexture( GLuint &texID )
{
	NanoTimer timer;
	timer.start();

	//glDeleteTextures( 1, &texID );

	//float timeDelete = timer.elapsed();
	//timer.start();

	//glGenTextures( 1, &texID );

	//float timeGen = timer.elapsed();
	//timer.start();


    // set up texture
    setupTexture( texID, m_nextImage );

	float timeSetup = timer.elapsed();

    //printf( "%s\n", qPrintable((*m_imageListIterator)) );

	
	//printf( "Texture: %f\n", timeSetup );
	//printf( "Texture: Del: %f, Gen %f, Set %f\n", timeDelete, timeGen, timeSetup );
}


void FilterShader::createFBOTexture( GLuint &texID )
{
	checkGLErrors("createTextures() 0");

    glGenTextures( 1, &texID );

    // set up texture
    setupFBOTexture( texID );

	// set texenv mode from modulate (the default) to replace)
	glTexEnvi( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );

    // check if something went completely wrong
    checkGLErrors("createTextures() 1");
}


// Procedural texture used when the configured image directory is missing or empty,
// so the visualizer still produces colourful kaleidoscope content instead of
// crashing on an empty image list (former end()-deref / div-by-zero).
QImage FilterShader::fallbackImage()
{
	const int N = 256;
	QImage img( N, N, QImage::Format_ARGB32 );
	for( int y = 0; y < N; y++ )
	{
		const float v = y / float(N);
		for( int x = 0; x < N; x++ )
		{
			const float u = x / float(N);
			const int r = int( 127.5f * (1.0f + sinf( u * 12.0f )) );
			const int g = int( 127.5f * (1.0f + sinf( (u + v) * 9.0f )) );
			const int b = int( 127.5f * (1.0f + cosf( v * 15.0f )) );
			img.setPixel( x, y, qRgb( r, g, b ) );
		}
	}
	return img;
}

void FilterShader::createTexture()
{
	checkGLErrors("createTextures() 0");


    glGenTextures( 1, &m_actTex );
    glGenTextures( 1, &m_nextTex );
    //glGenTextures( 1, &m_texID3 );
    // set up texture

	// Robustness: no images configured -> use the procedural fallback for both.
	if( m_imageList.isEmpty() )
	{
		setupTexture( m_actTex,  prepareImage( fallbackImage() ) );
		setupTexture( m_nextTex, prepareImage( fallbackImage() ) );
		checkGLErrors("createTextures() 1");
		return;
	}

	//m_imageListIterator++;
    if(m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_actTex, prepareImage( QImage( (*m_imageListIterator) ) ) );
    printf( "%s\n", qPrintable((*m_imageListIterator)) );

	m_imageListIterator++;
    if(m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_nextTex, prepareImage( QImage( (*m_imageListIterator) ) ) );
    printf( "%s\n", qPrintable((*m_imageListIterator)) );

	/*m_imageListIterator++;
    if(m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_texID3, QImage( (*m_imageListIterator) ) );*/

	// set texenv mode from modulate (the default) to replace)
	//rwrw glTexEnvi( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );

    // check if something went completely wrong
    checkGLErrors("createTextures() 1");
}

void FilterShader::traverse( const QString& dirname, QStringList& imageList )
{
  QDir dir( dirname );
  dir.setFilter( QDir::Dirs | QDir::Files | QDir::NoSymLinks );

  const QFileInfoList fileinfolist = dir.entryInfoList();
  foreach( const QFileInfo& fi,fileinfolist ) {
    if( fi.baseName() == "." || fi.baseName() == ".."  || fi.baseName() == "" ) {
      continue;
    }
    if( fi.isDir() && fi.isReadable() ) {
      // This is the conditional for recursion
      traverse( fi.absoluteFilePath(), imageList );
    }
    else {
		/*if( fi.QImageReader::canRead(  ) )*/
		if( fi.suffix() == "png" || fi.suffix() == "jpg" )
		{
			 
			//do something;
			imageList.push_back( fi.filePath() );
		}
		
      // This is where you might call your encrypting function
      //qDebug() << "Encrypting file: " << fi.absoluteFilePath();
      //encrypt( fi.absoluteFilePath() );
    }
  }
}


void FilterShader::setupFBOTexture( const GLuint texID )
{
	
	// make active and bind
	glBindTexture( GL_TEXTURE_2D, texID );

	// turn off filtering and wrap modes!
	//glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	//glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
	//glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP);
	//glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP);

	// turn off filtering and wrap modes!
	//glTexParameteri( GL_TEXTURE_2D, GL_GENERATE_MIPMAP, GL_TRUE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	//glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_MIRRORED_REPEAT );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_MIRRORED_REPEAT );
	

	// define texture with floating point format
	glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0, m_texFormat, m_texType, NULL );
}



void FilterShader::setupTexture( const GLuint texID, const QImage &image )
{
    //NanoTimer timer;
	//timer.start();

// make active and bind

	glBindTexture( GL_TEXTURE_2D, texID );
	// turn off filtering and wrap modes!
	//glTexParameteri( GL_TEXTURE_2D, GL_GENERATE_MIPMAP, GL_TRUE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
	//glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_MIRRORED_REPEAT );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_MIRRORED_REPEAT );
	

	
	// rescale to power of 2
	// -> this is necessary due to hardware limits!!
	// -> some drivers report GL2.0 but do not support NPOT textures.

	

/*
	GLint w,h, maxSize = 64;
	glGetIntegerv( GL_MAX_TEXTURE_SIZE, &maxSize );
	const char* extensions = (const char*)glGetString( GL_EXTENSIONS );
	//if( NULL == strstr( extensions, "GL_ARB_texture_non_power_of_two" ) )
	{
		for( w = 1 ; w < image.width()  ; w *= 2 ) ;
		for( h = 1 ; h < image.height() ; h *= 2 ) ;
	}
	/*else
	{
		w = image.width();
		h = image.height();
	}*/
/*	w = qMin( w, maxSize );
	h = qMin( h, maxSize );

	// convert image into a useful format
	QImage fixedImage = image.
		convertToFormat( QImage::Format_ARGB32 ).
		rgbSwapped().
		scaled( w,h );*/



	// upload image data
	if( m_nrTextureUploads < 2 )
	{
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, 
			image.width(), image.height(), 0, 	
			GL_RGBA, GL_UNSIGNED_BYTE, image.bits() );
		m_nrTextureUploads++;
	}
	else
	{
		glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, 
			image.width(), image.height(),  
			GL_RGBA, GL_UNSIGNED_BYTE, image.bits() );
	}


	//float convertingtime = timer.elapsed();
	//timer.start();

	glGenerateMipmapEXT( GL_TEXTURE_2D );

	//float uploadtime = timer.elapsed();
	//printf( "Time to texture: Uploading %f  Mipmap: %f\n", convertingtime, uploadtime );//rwrwdebug

}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void FilterShader::initGLSL()
{	
	// load and compile shader
	m_sh_prog_id_combine = setShaders( "standard.vert", "..\\CombinePlain.frag" );
	// Get location of the texture samplers and point vector for future use
	m_texPointCombineUni1 = glGetUniformLocation( m_sh_prog_id_combine, "tex0" );
	m_texPointCombineUni2 = glGetUniformLocation( m_sh_prog_id_combine, "tex1" );
	m_texSizeRcpCombineUni = glGetUniformLocation( m_sh_prog_id_combine, "resolution" );
	m_timeCombineUni = glGetUniformLocation( m_sh_prog_id_combine, "time" );
    m_interpolationCombineUni = glGetUniformLocation( m_sh_prog_id_combine, "interpolation" );

	
    glUseProgram( m_sh_prog_id_combine );

	//rwrw m_screenHeightUni = glGetUniformLocation( ;

	// ** TODO **
}


/**
 * Checks for OpenGL errors.
 * Extremely useful debugging function: When developing, 
 * make sure to call this after almost every GL call.
 */
void FilterShader::checkGLErrors( const char *label )
{
	return;//rwrwtest profiling

    GLenum errCode = glGetError();
    if ( errCode == GL_NO_ERROR )
		return;

	fputs( "OpenGL ERROR: ", stderr);
	fputs( (char*)gluErrorString(errCode), stderr);
	fputs( " (label: ", stderr);
	fputs( label, stderr);
	fputs( ")\n", stderr);
}

/**
 * Checks framebuffer status.
 * Copied directly out of the spec, modified to deliver a return value.
 */
bool FilterShader::checkFramebufferStatus(void)
{
	return true; //rwrwtest profiling

    GLenum status;
    status = (GLenum) glCheckFramebufferStatusEXT(GL_FRAMEBUFFER_EXT);
    switch(status) {
        case GL_FRAMEBUFFER_COMPLETE_EXT:
            return true;
        case GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT_EXT:
			printf("Framebuffer incomplete, incomplete attachment\n");
            return false;
        case GL_FRAMEBUFFER_UNSUPPORTED_EXT:
			printf("Unsupported framebuffer format\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT_EXT:
			printf("Framebuffer incomplete, missing attachment\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS_EXT:
			printf("Framebuffer incomplete, attached images must have same dimensions\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_FORMATS_EXT:
			printf("Framebuffer incomplete, attached images must have same format\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER_EXT:
			printf("Framebuffer incomplete, missing draw buffer\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_READ_BUFFER_EXT:
			printf("Framebuffer incomplete, missing read buffer\n");
            return false;
    }
	return false;
}


void FilterShader::addTextureShader( EffectShader * shader )
{
	m_effectTextures.push_back( shader );
}


void FilterShader::addCombineShader( EffectShader * shader )
{
	m_effectCombines.push_back( shader );
}


ImageLoader::ImageLoader( FilterShader *shader )
{
    m_shader = shader;
}
 
void ImageLoader::run()
{
    while( true )
    {
        if( m_shader->m_triggerImageload == true )
        {
            //NanoTimer timer;
			//timer.start();

			// Robustness: empty image list -> serve the procedural fallback
			// instead of dividing by zero / dereferencing end().
			if( m_shader->m_imageList.isEmpty() )
			{
				m_shader->m_nextImage = prepareImage( FilterShader::fallbackImage() );
				m_shader->m_triggerImageload = false;
				continue;
			}

			unsigned int start = qrand() % (m_shader->m_imageList.size() );
			for( unsigned int i = 0; i < start; i++ )
			{
		        m_shader->m_imageListIterator++;

				if(m_shader->m_imageListIterator == m_shader->m_imageList.end() )
					m_shader->m_imageListIterator = m_shader->m_imageList.begin();
			}

            m_shader->m_nextImage = prepareImage( QImage( (*m_shader->m_imageListIterator)  ) );
			printf("%s\n", qPrintable((*m_shader->m_imageListIterator)));
            m_shader->m_triggerImageload = false;

			//float loadingtime = timer.elapsed();
			//printf( "Time to load: %f\n", loadingtime );//rwrwdebug
        }
		else
			msleep( 50 );
    }
    
}
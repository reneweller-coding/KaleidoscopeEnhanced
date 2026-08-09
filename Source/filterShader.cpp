#include <float.h>
#include <math.h>

#include "shader_setup.h"
#include "filterShader.h"
#include "SpoutOut.h"
#include "SpoutIn.h"
#include "Scene3DShader.h"
#include "Utils.h"

#include <QtGui/QImageReader>
#include <QtGui/QPainter>
#include <QtGui/QFontMetrics>
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
float FilterShader::s_lightShow   = 0.0f;   // corner lamps / light-show OFF by default
bool  FilterShader::s_spoutEnabled = false; // Spout sender (CLI -o)
float FilterShader::s_latencyLead  = 0.05f; // display-phase lead vs. heard audio
int   FilterShader::s_stereoMode  = 0;      // stereoscopic output (CLI -3 / 'z')
float FilterShader::s_stereoDepth = 1.0f;   // disparity strength
bool  FilterShader::s_blackout = false;     // VJ blackout ('b')
bool  FilterShader::s_freeze   = false;     // VJ freeze ('e')
bool  FilterShader::s_pinned   = false;     // VJ pin ('u')
QHash<QString, float> FilterShader::s_taste;  // taste learning (skip/favourite)
bool    FilterShader::s_spoutInEnabled = false;  // Spout input (CLI -i)
QString FilterShader::s_spoutInSender;

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
	s_latencyLead  = clampParam( s.value( "latencyLead", s_latencyLead ).toFloat(), 0.f, 0.25f );
	s_stereoMode   = s.value( "stereoMode", s_stereoMode ).toInt() & 3;
	s_stereoDepth  = clampParam( s.value( "stereoDepth", s_stereoDepth ).toFloat(), 0.f, 2.f );
	setRenderScale( s.value( "renderScale", s_renderScale ).toFloat() );  // clamps internally

	// Taste learning: PER-PRESET per-shader selection-weight factors (keys
	// "<Preset>/<file>"), decayed toward 1.0 a little on every start so old
	// skips/favourites slowly lose their grip.
	s.beginGroup( "taste" );
	for( const QString &k : s.allKeys() )        // recursive: Preset/File.frag
	{
		float v = clampParam( s.value( k, 1.f ).toFloat(), 0.3f, 2.5f );
		v = 1.f + ( v - 1.f ) * 0.97f;
		if( fabsf( v - 1.f ) > 0.01f )
			s_taste[k] = v;
	}
	s.endGroup();
}

// Basename of a fragment path ("..\\Scene\\Voyager.frag" -> "Voyager.frag").
static QString tasteBase( const char *fragPath )
{
	QString f = QString::fromLocal8Bit( fragPath ? fragPath : "?" );
	int cut = std::max( f.lastIndexOf( QChar('\\') ), f.lastIndexOf( QChar('/') ) );
	return f.mid( cut + 1 );
}

float FilterShader::tasteFor( const char *fragPath ) const
{
	auto it = s_taste.constFind( m_presetName + "/" + tasteBase( fragPath ) );
	return ( it == s_taste.constEnd() ) ? 1.f : it.value();
}

void FilterShader::bumpTaste( const char *fragPath, float mul )
{
	QString key = m_presetName + "/" + tasteBase( fragPath );
	float v = clampParam( ( s_taste.value( key, 1.f ) ) * mul, 0.3f, 2.5f );
	s_taste[key] = v;
	// Persist immediately (rare events; losing them to a crash would defeat
	// the learning).
	QSettings s( settingsFilePath(), QSettings::IniFormat );
	s.setValue( "taste/" + key, v );
	s.sync();
	fprintf( stderr, "Taste: %s -> %.2f\n", key.toLocal8Bit().constData(), v );
}

void FilterShader::saveSettings()
{
	QSettings s( settingsFilePath(), QSettings::IniFormat );
	s.setValue( "reactivity",  s_reactivity   );
	s.setValue( "trails",      s_trailAmount  );
	s.setValue( "mood",        s_moodStrength );
	s.setValue( "latencyLead", s_latencyLead  );
	s.setValue( "stereoMode",  s_stereoMode   );
	s.setValue( "stereoDepth", s_stereoDepth  );
	s.setValue( "renderScale", s_renderScale  );
	s.sync();
	fprintf( stderr, "Saved settings: react=%.2f trails=%.2f mood=%.2f lead=%.0fms scale=%.2f\n",
	         s_reactivity, s_trailAmount, s_moodStrength, s_latencyLead * 1000.f, s_renderScale );
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
// GL object ids MUST start at 0 ("not created yet"): creation code reuses an
// existing id and only calls glGen* when the id is still 0.  The old dummy
// values (1/2) made those guards skip creation -> invalid FBOs -> black frames.
, m_fboEffectTexture1(0)
, m_fboEffectTexture2(0)
, m_fboEffectCombine1(0)
, m_fboEffectCombine2(0)
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
, m_actTex(0)
, m_nextTex(0)
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

	// A malformed configuration (wrong attribute names, missing type="normal")
	// used to yield ZERO valid entries here — and every qrand() % size() below
	// then crashed with a silent integer division by zero (0xC0000094).  Fall
	// back to a plain pass-through with a clear message instead.
	if( m_effectTextures.empty() )
	{
		fprintf( stderr, "WARNING: configuration has no valid <TextureShader> "
		                 "entries (check attribute names + type) - using a "
		                 "plain fallback.\n" );
		EffectShader *fb = new EffectShader( "..\\Combine\\CombinePlain.frag", 30, 60, 20, 40 );
		fb->setProbability( 1.f );
		fb->setComplexity( 1 );
		m_effectTextures.push_back( fb );
	}
	if( m_effectCombines.empty() )
	{
		fprintf( stderr, "WARNING: configuration has no valid <CombineShader> "
		                 "entries (they need the SAME attribute names as "
		                 "TextureShader + type=\"normal\") - using CombinePlain.\n" );
		EffectShader *fb = new EffectShader( "..\\Combine\\CombinePlain.frag", 30, 60, 20, 40 );
		fb->setProbability( 1.f );
		fb->setComplexity( 1 );
		m_effectCombines.push_back( fb );
	}

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
	// NOTE: the global Spout facades are deliberately NOT released here —
	// stop() runs on every preset switch, which made the Spout sender vanish
	// from OBS/Resolume at each switch (and deleted the receiver texture
	// without a current GL context).  GLwidget's destructor releases them
	// once at shutdown.

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
// GL object ids MUST start at 0 (see the note in the default constructor).
, m_fboEffectTexture1(0)
, m_fboEffectTexture2(0)
, m_fboEffectCombine1(0)
, m_fboEffectCombine2(0)
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
, m_actTex(0)
, m_nextTex(0)
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


	
	EffectShader *tunnelPlain = new EffectShader( "..\\Scene\\TunnelPlain.frag", 20, 120, 30, 120 );
	tunnelPlain->addUniform( "speed", 0.001f, 0.05f );
	tunnelPlain->addUniform( "sides", 3.0f, 14.0f );
	tunnelPlain->addUniform( "power", 1.0f, 4.0f );



	EffectShader *bubbles = new EffectShader( "..\\Scene\\Bubble.frag", 20, 120, 30, 120 );
	bubbles->addUniform( "speed", 1.0f, 2.5f );
	bubbles->addUniform( "speedColor", 0.5f, 1.5f );
	bubbles->addUniform( "negative", 0.1f );
	bubbles->addUniform( "vigneting", 0.5f );

	TextureEffectKaleidoscopeBase *textureTunnel = new TextureEffectKaleidoscopeBase( "..\\Scene\\Tunnel.frag", 120, 300, 40, 90 );
	textureTunnel->addUniform( "rotate", 0.7 );
	textureTunnel->addUniform( "speedTunnel", 0.001f, 0.06 );


	TextureEffectKaleidoscopeBase *textureTunnelReverse = new TextureEffectKaleidoscopeBase( "..\\Scene\\TunnelReverse.frag", 20, 120, 20, 40 );
	textureTunnel->addUniform( "rotate", 0.7 );
	textureTunnel->addUniform( "speedTunnel", 0.001f, 0.03f );
	textureTunnel->addUniform( "speedTunnelReverse", 0.0001f, 0.01f );

	
	TextureEffectKaleidoscopeBase *textureTunnelAccel = new TextureEffectKaleidoscopeBase( "..\\Scene\\TunnelAcceleration.frag", 10, 20, 10, 20 );
	//TextureEffectKaleidoscopeBase *textureTunnelAccel = new TextureEffectKaleidoscopeBase( "..\\Scene\\TunnelAcceleration.frag", 40, 180, 10, 40 );
	textureTunnelAccel->addUniform( "rotate", 0.7 );
	textureTunnelAccel->addUniform( "speedTunnel", 0.001f, 0.03f );
	textureTunnelAccel->addUniformInterpolator( "speedTunnelAccel", 0.0, 0.0005f, 0.01f, 0.09f );
	
	
	TextureEffectKaleidoscopeBase *textureTunnelAccel2 = new TextureEffectKaleidoscopeBase( "..\\Scene\\TunnelAcceleration.frag", 10, 20, 10, 20 );
	//TextureEffectKaleidoscopeBase *textureTunnelAccel2 = new TextureEffectKaleidoscopeBase( "..\\Scene\\TunnelAcceleration.frag", 40, 180, 10, 40 );
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

	TextureEffectKaleidoscopeBase *textureTunnel2 = new TextureEffectKaleidoscopeBase( "..\\Scene\\Tunnel.frag", 120, 300, 40, 90 );
	textureTunnel2->addUniform( "rotate", 0.7 );
	textureTunnel2->addUniform( "speedTunnel", 0.001f, 0.06 );

	TextureEffectKaleidoscopeBase *textureTunnel3 = new TextureEffectKaleidoscopeBase( "..\\Scene\\Tunnel.frag", 120, 300, 40, 90 );
	textureTunnel3->addUniform( "rotate", 0.7 );
	textureTunnel3->addUniform( "speedTunnel", 0.001f, 0.06 );

	///////////////////////////////////////////////////////////////////////////////////



	
	EffectShader *rorschach = new EffectShader( "..\\Scene\\Rorschach.frag", 20, 120, 30, 120 );
	rorschach->addUniform( "positive", 0.5 );
	rorschach->addUniform( "posX", 0.1f, 0.9f );
	rorschach->addUniform( "posY", 0.1f, 0.9f );
	rorschach->addUniform( "posZ", 0.1f, 0.9f );
	rorschach->addUniform( "divisor", .1f, 0.001f );
	//rorschach->addUniform( "fiOffset", .001f, 2.0f );
	rorschach->addUniform( "fiOffset", .001f, 10.0f );



	
	TextureEffectKaleidoscopeBase *textureEffectParallaxKaleidoscope = new TextureEffectKaleidoscopeBase( "..\\Scene\\TextureEffectParallaxKaleidoscope.frag", 60, 240, 20, 60 );
	textureEffectParallaxKaleidoscope->addUniform( "rotate", 0.2 );
	textureEffectParallaxKaleidoscope->addUniform( "speedMovement", 3.0f, 6.0f ); //5.0
	textureEffectParallaxKaleidoscope->addUniform( "extend", 2000.0f, 8000.0f ); //4000
	textureEffectParallaxKaleidoscope->addUniform( "direction", 0.5 );

	
	TextureEffectKaleidoscopeBase *textureEffectParallaxKaleidoscopeTunnel = new TextureEffectKaleidoscopeBase( "..\\Scene\\TextureEffectParallaxKaleidoscopeTunnel.frag", 60, 240, 20, 60 );
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



	EffectShader *combineDeformation =  new EffectShader( "..\\Combine\\CombineDeformationFlow.frag", 20, 40, 30, 60 );//new EffectShader( "..\\Combine\\CombinePlain.frag" );//new EffectShader( "..\\Combine\\CombineWave.frag" );
	combineDeformation->addUniform( "copies", 3.0f, 10.0f );
	combineDeformation->addUniform( "displayGrid", .95 );
	combineDeformation->addUniform( "speed", 0.005f, 0.05f );
	combineDeformation->addUniform( "directionPositive", 0.5 );
	combineDeformation->addUniform( "leftRight", 0.5 );
	

	EffectShader *combineLichtenstein = new EffectShader( "..\\Combine\\CombineLichtenstein.frag", 10, 60, 40, 120 );
	combineLichtenstein->addUniform( "size", 4.0f, 18.0f );


	EffectShader *combineSphere = new EffectShader( "..\\Combine\\CombineSphere.frag", 30, 90, 20, 90 );
	combineSphere->addUniform( "radius", 0.5f, 1.0f );
	combineSphere->addUniform( "nrCopies", 1.0f, 8.0f );
	combineSphere->addUniform( "speed", 0.01f, 0.15f );
	combineSphere->addUniform( "rot", 0.5f );

	EffectShader *combineShroom = new EffectShader( "..\\Combine\\CombineShroom.frag", 10, 30, 20, 60 );
	combineShroom->addUniform( "scale", 0.01f, 0.025f );
	combineShroom->addUniform( "speed", 0.05f, 0.9f );
	combineShroom->addUniform( "negativeU", 0.5f );
	combineShroom->addUniform( "negativeV", 0.5f );
	combineShroom->addUniform( "scaleFactor", 1.0f, 3.5f );

	
	EffectShader *combineWater = new EffectShader( "..\\Combine\\CombineWater.frag", 10, 20, 20, 40 );

		
	EffectShader *combineMulti = new EffectShader( "..\\Combine\\CombineMulti.frag", 40, 180, 40, 90 );
	combineMulti->addUniform( "copies", 3.0f, 12.0f );
	combineMulti->addUniform( "rot", 0.5 );

	
	EffectShader *combineMultiShort = new EffectShader( "..\\Combine\\CombineMulti.frag", 0, 5, 40, 90 );
	combineMultiShort->addUniform( "copies", 3.0f, 12.0f );
	combineMultiShort->addUniform( "rot", 0.5 );

	EffectShader *combinePlain = new EffectShader( "..\\Combine\\CombinePlain.frag", 60, 240, 60, 120 );//CombineEffectKaleidoscope()
	EffectShader *combinePlain2 = new EffectShader( "..\\Combine\\CombinePlain.frag", 60, 240, 60, 120 );//CombineEffectKaleidoscope();
	EffectShader *combinePlain3 = new EffectShader( "..\\Combine\\CombinePlain.frag", 60, 240, 60, 120 );//CombineEffectKaleidoscope();
	EffectShader *combineGrey = new EffectShader( "..\\Combine\\CombineGrey.frag", 40, 240, 30, 120 );
	EffectShader *combineDarkRed = new EffectShader( "..\\Combine\\CombineDarkRed.frag", 40, 240, 30, 120 );
	combineDarkRed->addUniform( "red", 0.5 );
	combineDarkRed->addUniform( "blue", 0.5 );

	
	EffectShader *combineRotate = new EffectShader( "..\\Combine\\CombineRotate.frag", 30, 120, 20, 40 );
	combineRotate->addUniform( "speed", 0.01f, 0.02f );
	combineRotate->addUniform( "direction", 0.5 );

	
	EffectShader *combineOilPaintFlow = new EffectShader( "..\\Combine\\CombineOilPaintFlow.frag", 20, 120, 30, 120 );
	EffectShader *combineOilPaint = new EffectShader( "..\\Combine\\CombineOilPaint.frag", 20, 120, 30, 120 );

	//EffectShader *combineParallax = new EffectShader( "..\\Combine\\CombineParallax.frag", 20, 120, 30, 120 );

	
	//EffectShader *combineWater2 = new EffectShader( "..\\Combine\\CombineWater2.frag", 20, 120, 30, 120 );
	EffectShader *combineHexagon = new EffectShader( "..\\Combine\\CombineHexagon.frag", 20, 90, 30, 80 );
	
	
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
		m_effectTextures[i]->prepare( m_width, m_height );   // lazy compile
	}

	
	for( unsigned int i = 0; i < m_effectCombines.size(); i++ )
	{
		m_effectCombines[i]->prepare( m_width, m_height );   // lazy compile
	}

	checkGLErrors("reinit() 0");
	createTexture();					// create texture

	createFBOTexture( m_texIDFBOEffectTexture1 );
	createFBOTexture( m_texIDFBOEffectTexture2 );
	createFBOTexture( m_texIDFBOEffectCombine1 );
	createFBOTexture( m_texIDFBOEffectCombine2 );
	initFBO(  m_fboEffectTexture1, m_texIDFBOEffectTexture1, &m_depthRbEffect1 );
	initFBO(  m_fboEffectTexture2, m_texIDFBOEffectTexture2, &m_depthRbEffect2 );
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

	// The 3D-scene DEPTH renderbuffers must track the colour size, or the
	// effect FBOs go INCOMPLETE_DIMENSIONS after any resize.
	if( m_depthRbEffect1 )
	{
		glBindRenderbufferEXT( GL_RENDERBUFFER_EXT, m_depthRbEffect1 );
		glRenderbufferStorageEXT( GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT,
		                          m_width, m_height );
	}
	if( m_depthRbEffect2 )
	{
		glBindRenderbufferEXT( GL_RENDERBUFFER_EXT, m_depthRbEffect2 );
		glRenderbufferStorageEXT( GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT,
		                          m_width, m_height );
	}
	glBindRenderbufferEXT( GL_RENDERBUFFER_EXT, 0 );

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

	// Resize the bloom buffers (quarter render-res).
	m_bloomW = m_width  / 4;  if( m_bloomW < 8 ) m_bloomW = 8;
	m_bloomH = m_height / 4;  if( m_bloomH < 8 ) m_bloomH = 8;
	for( int i = 0; i < 2; ++i )
		if( m_texBloom[i] != 0 )
		{
			glBindTexture( GL_TEXTURE_2D, m_texBloom[i] );
			glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_bloomW, m_bloomH, 0,
			              m_texFormat, m_texType, NULL );
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
		m_presentProgId   = setShaders( "..\\standard.vert", "..\\Blend\\Present.frag" );
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
		m_presentTimeUni     = glGetUniformLocation( m_presentProgId, "time" );
		m_presentChaseUni    = glGetUniformLocation( m_presentProgId, "audioChase" );
		m_presentLampsUni    = glGetUniformLocation( m_presentProgId, "lightShow" );
		m_presentSwellUni    = glGetUniformLocation( m_presentProgId, "audioSwell" );
		m_presentBarPhaseUni = glGetUniformLocation( m_presentProgId, "audioBarPhase" );
		m_presentBloomTexUni = glGetUniformLocation( m_presentProgId, "bloomTex" );
		m_presentUseBloomUni = glGetUniformLocation( m_presentProgId, "useBloom" );
		m_presentCamZoomUni  = glGetUniformLocation( m_presentProgId, "camZoom" );
		m_presentCamRotUni   = glGetUniformLocation( m_presentProgId, "camRot" );
		m_presentCamOffUni   = glGetUniformLocation( m_presentProgId, "camOff" );
		m_presentTitleTexUni    = glGetUniformLocation( m_presentProgId, "titleTex" );
		m_presentTitlePhaseUni  = glGetUniformLocation( m_presentProgId, "titlePhase" );
		m_presentTitleAspectUni = glGetUniformLocation( m_presentProgId, "titleAspect" );
		m_presentTitleStyleUni  = glGetUniformLocation( m_presentProgId, "titleStyle" );
		m_presentTitleSeedUni   = glGetUniformLocation( m_presentProgId, "titleSeed" );
		m_presentStereoModeUni  = glGetUniformLocation( m_presentProgId, "stereoMode" );
		m_presentStereoDepthUni = glGetUniformLocation( m_presentProgId, "stereoDepth" );
		m_presentStereoSrcUni   = glGetUniformLocation( m_presentProgId, "stereoSource" );
	}

	m_safetyReady = fboOk && (m_presentProgId != 0) && (m_presentTexUni >= 0);

	// ---- Two-pass Gaussian bloom: quarter-res ping-pong + blur shader ----
	// (A real separable blur instead of the old single-mip tap.)  On failure
	// m_bloomReady stays false and Present.frag falls back to the mip path.
	m_bloomW = m_width  / 4;  if( m_bloomW < 8 ) m_bloomW = 8;
	m_bloomH = m_height / 4;  if( m_bloomH < 8 ) m_bloomH = 8;
	bool bloomOk = true;
	for( int i = 0; i < 2; ++i )
	{
		if( m_texBloom[i] == 0 ) glGenTextures( 1, &m_texBloom[i] );
		glBindTexture( GL_TEXTURE_2D, m_texBloom[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_bloomW, m_bloomH, 0,
		              m_texFormat, m_texType, NULL );
		if( m_fboBloom[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboBloom[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboBloom[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texBloom[i], 0 );
		bloomOk = bloomOk && checkFramebufferStatus();
	}
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );
	if( m_bloomProgId == 0 )
	{
		m_bloomProgId    = setShaders( "..\\standard.vert", "..\\Blend\\BloomBlur.frag" );
		m_bloomTexUni    = glGetUniformLocation( m_bloomProgId, "tex" );
		m_bloomResUni    = glGetUniformLocation( m_bloomProgId, "resolution" );
		m_bloomDirUni    = glGetUniformLocation( m_bloomProgId, "dir" );
		m_bloomThreshUni = glGetUniformLocation( m_bloomProgId, "threshold" );
	}
	m_bloomReady = bloomOk && (m_bloomProgId != 0) && (m_bloomTexUni >= 0);

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
		m_trailProgId   = setShaders( "..\\standard.vert", "..\\Blend\\Feedback.frag" );
		m_trailCurUni   = glGetUniformLocation( m_trailProgId, "texCur" );
		m_trailPrevUni  = glGetUniformLocation( m_trailProgId, "texPrev" );
		m_trailResUni   = glGetUniformLocation( m_trailProgId, "resolution" );
		m_trailDecayUni = glGetUniformLocation( m_trailProgId, "decay" );
		m_trailZoomUni  = glGetUniformLocation( m_trailProgId, "warpZoom" );
		m_trailRotUni   = glGetUniformLocation( m_trailProgId, "warpRot" );
		m_trailHueUni   = glGetUniformLocation( m_trailProgId, "hueDrift" );
		m_trailDepthUni = glGetUniformLocation( m_trailProgId, "depth3D" );
		m_trailRipAmpUni  = glGetUniformLocation( m_trailProgId, "rippleAmp" );
		m_trailRipPhUni   = glGetUniformLocation( m_trailProgId, "ripplePhase" );
		m_trailSwirlUni   = glGetUniformLocation( m_trailProgId, "swirlAmp" );
		m_trailFlowAmpUni = glGetUniformLocation( m_trailProgId, "flowAmp" );
		m_trailFlowPhUni  = glGetUniformLocation( m_trailProgId, "flowPhase" );
	}
	if( m_stereoMixProgId == 0 )
	{
		// Plain per-pixel cross-mix for eye-packed true-stereo frames (the
		// styled combines would warp content across the eye boundary).
		m_stereoMixProgId  = setShaders( "..\\standard.vert", "..\\Blend\\StereoMix.frag" );
		m_stereoMixTexAUni = glGetUniformLocation( m_stereoMixProgId, "texA" );
		m_stereoMixTexBUni = glGetUniformLocation( m_stereoMixProgId, "texB" );
		m_stereoMixResUni  = glGetUniformLocation( m_stereoMixProgId, "resolution" );
		m_stereoMixWUni    = glGetUniformLocation( m_stereoMixProgId, "interpolation" );
	}
	m_feedbackReady = m_safetyReady && trailOk && (m_trailProgId != 0)
	                && (m_trailCurUni >= 0) && (m_trailPrevUni >= 0);

	checkGLErrors("setupSafety()");

	// GPU reaction-diffusion simulation buffers + shader.
	setupReactionDiffusion();

	// GPU fluid (curl-noise dye advection) buffers + shader.
	setupFluid();

	// GPU volumetric fire/smoke (tiled-atlas pseudo-3D) buffers + shader.
	setupSmoke3D();

	// Physarum slime-mould simulation (agents + trail map).
	setupPhysarum();
}

// Create the two RGBA16F ping-pong buffers and the Gray-Scott step shader.  The
// grid is a fixed, modest size (independent of the window) so it stays cheap even
// on a weak iGPU.  On any failure m_rdReady stays false and effects that sample
// the simulation fall back to the source image.
void FilterShader::setupReactionDiffusion()
{
	if( m_rdProgId == 0 )
	{
		m_rdProgId    = setShaders( "..\\standard.vert", "..\\Blend\\ReactionDiffusionSim.frag" );
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

// Create the fluid dye ping-pong buffers and the advection shader.  Same
// fail-safe pattern as the RD sim: on any failure m_fluidReady stays false and
// Fluid.frag degrades to its image fallback.
void FilterShader::setupFluid()
{
	if( m_fluidProgId == 0 )
	{
		m_fluidProgId     = setShaders( "..\\standard.vert", "..\\Blend\\FluidSim.frag" );
		m_fluidPrevUni    = glGetUniformLocation( m_fluidProgId, "texPrev" );
		m_fluidTex0Uni    = glGetUniformLocation( m_fluidProgId, "tex0" );
		m_fluidTex1Uni    = glGetUniformLocation( m_fluidProgId, "tex1" );
		m_fluidInterpUni  = glGetUniformLocation( m_fluidProgId, "interpolation" );
		m_fluidResUni     = glGetUniformLocation( m_fluidProgId, "resolution" );
		m_fluidSeedUni    = glGetUniformLocation( m_fluidProgId, "seedMode" );
		m_fluidPhaseUni   = glGetUniformLocation( m_fluidProgId, "flowPhase" );
		m_fluidImpulseUni = glGetUniformLocation( m_fluidProgId, "impulse" );
		m_fluidInjectUni  = glGetUniformLocation( m_fluidProgId, "injectAmt" );
	}

	bool ok = (m_fluidProgId != 0) && (m_fluidPrevUni >= 0);
	for( int i = 0; i < 2 && ok; ++i )
	{
		if( m_texFluid[i] == 0 ) glGenTextures( 1, &m_texFluid[i] );
		glBindTexture( GL_TEXTURE_2D, m_texFluid[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kFluidSize, kFluidSize, 0,
		              GL_RGBA, GL_FLOAT, NULL );
		if( m_fboFluid[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboFluid[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboFluid[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texFluid[i], 0 );
		if( !checkFramebufferStatus() ) ok = false;
	}
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	m_fluidReady  = ok;
	m_fluidSeeded = false;
	checkGLErrors("setupFluid()");
}

// Advance the dye advection by one step into the next ping-pong buffer.
void FilterShader::stepFluid(const AudioFeatures &audio)
{
	if( !m_fluidReady )
		return;

	const int cur  = m_fluidIdx;
	const int prev = 1 - m_fluidIdx;

	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboFluid[cur] );
	glViewport( 0, 0, kFluidSize, kFluidSize );
	glUseProgram( m_fluidProgId );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texFluid[prev] );
	glActiveTexture( GL_TEXTURE1 );
	glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_actTex );
	glActiveTexture( GL_TEXTURE2 );
	glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_nextTex );
	glUniform1i( m_fluidPrevUni, 0 );
	if( m_fluidTex0Uni   >= 0 ) glUniform1i( m_fluidTex0Uni, 1 );
	if( m_fluidTex1Uni   >= 0 ) glUniform1i( m_fluidTex1Uni, 2 );
	if( m_fluidInterpUni >= 0 ) glUniform1f( m_fluidInterpUni, m_interpolationTexture );
	if( m_fluidResUni    >= 0 ) glUniform2f( m_fluidResUni, (float)kFluidSize, (float)kFluidSize );
	if( m_fluidSeedUni   >= 0 ) glUniform1f( m_fluidSeedUni, m_fluidSeeded ? 0.f : 1.f );
	// Flow field evolution rides the integrated phase (jump-free); the
	// slew-limited bass powers the swirl, onsets inject extra dye.
	if( m_fluidPhaseUni   >= 0 ) glUniform1f( m_fluidPhaseUni,
	                                          m_globaltime * 0.05f + m_audioAdvance * 0.20f );
	if( m_fluidImpulseUni >= 0 ) glUniform1f( m_fluidImpulseUni,
	                                          audio.bassLevel * 0.7f + audio.beatDecay * 0.3f );
	if( m_fluidInjectUni  >= 0 ) glUniform1f( m_fluidInjectUni,
	                                          0.012f + 0.020f * audio.onsetStrength );

	drawWindow();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_fluidSeeded = true;
	m_fluidIdx    = prev;   // newest state is now m_texFluid[1 - m_fluidIdx]
}

// Create the smoke/fire ping-pong buffers and the sim shader.  Same fail-safe
// pattern as RD/Fluid: on any failure m_smoke3DReady stays false and
// VolumetricFire.frag degrades to an empty (black) field.
void FilterShader::setupSmoke3D()
{
	if( m_smoke3DProgId == 0 )
	{
		m_smoke3DProgId       = setShaders( "..\\standard.vert", "..\\Blend\\Smoke3DSim.frag" );
		m_smoke3DPrevUni      = glGetUniformLocation( m_smoke3DProgId, "texPrev" );
		m_smoke3DResUni       = glGetUniformLocation( m_smoke3DProgId, "resolution" );
		m_smoke3DSeedUni      = glGetUniformLocation( m_smoke3DProgId, "seedMode" );
		m_smoke3DSubUni       = glGetUniformLocation( m_smoke3DProgId, "subStep" );
		m_smoke3DTimeUni      = glGetUniformLocation( m_smoke3DProgId, "time" );
		m_smoke3DTurbUni      = glGetUniformLocation( m_smoke3DProgId, "turbulence" );
		m_smoke3DInjectUni    = glGetUniformLocation( m_smoke3DProgId, "injectAmt" );
		m_smoke3DEmitPhaseUni = glGetUniformLocation( m_smoke3DProgId, "emitterPhase" );
	}

	bool ok = (m_smoke3DProgId != 0) && (m_smoke3DPrevUni >= 0);
	for( int i = 0; i < 2 && ok; ++i )
	{
		if( m_texSmoke3D[i] == 0 ) glGenTextures( 1, &m_texSmoke3D[i] );
		glBindTexture( GL_TEXTURE_2D, m_texSmoke3D[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kSmoke3DW, kSmoke3DH, 0,
		              GL_RGBA, GL_FLOAT, NULL );
		if( m_fboSmoke3D[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboSmoke3D[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboSmoke3D[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texSmoke3D[i], 0 );
		if( !checkFramebufferStatus() ) ok = false;
	}
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	m_smoke3DReady  = ok;
	m_smoke3DSeeded = false;
	checkGLErrors("setupSmoke3D()");
}

// One sub-step (horizontal turbulence+injection, or vertical buoyancy) into the
// next ping-pong buffer.  Calling this twice per frame (see stepSmoke3D) with
// the two different subStep values advances both halves of the PDE.
void FilterShader::stepSmoke3DPass(const AudioFeatures &audio, float subStep)
{
	const int cur  = m_smoke3DIdx;
	const int prev = 1 - m_smoke3DIdx;

	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboSmoke3D[cur] );
	glViewport( 0, 0, kSmoke3DW, kSmoke3DH );
	glUseProgram( m_smoke3DProgId );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texSmoke3D[prev] );
	glUniform1i( m_smoke3DPrevUni, 0 );
	if( m_smoke3DResUni  >= 0 ) glUniform2f( m_smoke3DResUni, (float)kSmoke3DW, (float)kSmoke3DH );
	if( m_smoke3DSeedUni >= 0 ) glUniform1f( m_smoke3DSeedUni, m_smoke3DSeeded ? 0.f : 1.f );
	if( m_smoke3DSubUni  >= 0 ) glUniform1f( m_smoke3DSubUni, subStep );
	if( m_smoke3DTimeUni >= 0 ) glUniform1f( m_smoke3DTimeUni, m_globaltime );
	// Treble/onset energy drives per-cell turbulence; kick/bass/drop drives how
	// hard fresh fuel is injected at the base cells.
	if( m_smoke3DTurbUni >= 0 ) glUniform1f( m_smoke3DTurbUni,
	                                         0.5f + 1.3f * audio.highLevel + 0.8f * audio.onsetStrength );
	if( m_smoke3DInjectUni >= 0 ) glUniform1f( m_smoke3DInjectUni,
	                                           0.15f + 0.35f * audio.bassLevel
	                                                 + 0.45f * audio.onsetKick
	                                                 + 0.35f * audio.dropPulse );
	// Wandering emitter positions ride the integrated advance phase (jump-free).
	if( m_smoke3DEmitPhaseUni >= 0 ) glUniform1f( m_smoke3DEmitPhaseUni, m_audioAdvance * 0.5f );

	drawWindow();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_smoke3DSeeded = true;
	m_smoke3DIdx    = prev;
}

// Advance the fire/smoke volume by one full frame: a horizontal pass followed
// by a vertical pass, each its own ping-pong swap (mirrors the RD sim's
// multi-substep-per-frame pattern so structure develops quickly).
void FilterShader::stepSmoke3D(const AudioFeatures &audio)
{
	if( !m_smoke3DReady )
		return;

	stepSmoke3DPass( audio, 0.f );   // horizontal: turbulence + injection + decay
	stepSmoke3DPass( audio, 1.f );   // vertical: buoyant rise + cross-cell softening
}

// Create the Physarum buffers + the three programs.  Same fail-safe pattern
// as RD/Fluid/Smoke3D: any failure leaves m_physReady false and the display
// effect degrades to a dark field.
void FilterShader::setupPhysarum()
{
	if( m_physAgentProgId == 0 )
	{
		m_physAgentProgId   = setShaders( "..\\standard.vert", "..\\Blend\\PhysarumAgents.frag" );
		m_physAgentTexUni   = glGetUniformLocation( m_physAgentProgId, "texAgents" );
		m_physAgentTrailUni = glGetUniformLocation( m_physAgentProgId, "texTrail" );
		m_physAgentResUni   = glGetUniformLocation( m_physAgentProgId, "resolution" );
		m_physAgentSeedUni  = glGetUniformLocation( m_physAgentProgId, "seedMode" );
		m_physAgentTimeUni  = glGetUniformLocation( m_physAgentProgId, "time" );
		m_physAgentSpeedUni = glGetUniformLocation( m_physAgentProgId, "speed" );
		m_physAgentSensAUni = glGetUniformLocation( m_physAgentProgId, "sensAngle" );
		m_physAgentSensDUni = glGetUniformLocation( m_physAgentProgId, "sensDist" );
		m_physAgentTurnUni  = glGetUniformLocation( m_physAgentProgId, "turnRate" );
		m_physAgentScatUni  = glGetUniformLocation( m_physAgentProgId, "scatter" );
	}
	if( m_physDepositProgId == 0 )
	{
		// The deposit pass needs a REAL vertex shader (VTF) — setShadersVF.
		m_physDepositProgId = setShadersVF( "..\\Blend\\PhysarumDeposit.vert",
		                                    "..\\Blend\\PhysarumDeposit.frag" );
		m_physDepAgentsUni  = glGetUniformLocation( m_physDepositProgId, "texAgents" );
		m_physDepAmtUni     = glGetUniformLocation( m_physDepositProgId, "depositAmt" );
		m_physDepAttr       = glGetAttribLocation(  m_physDepositProgId, "aTexel" );
	}
	if( m_physDiffuseProgId == 0 )
	{
		m_physDiffuseProgId = setShaders( "..\\standard.vert", "..\\Blend\\PhysarumDiffuse.frag" );
		m_physDifTrailUni   = glGetUniformLocation( m_physDiffuseProgId, "texTrail" );
		m_physDifResUni     = glGetUniformLocation( m_physDiffuseProgId, "resolution" );
		m_physDifDecayUni   = glGetUniformLocation( m_physDiffuseProgId, "decay" );
	}

	bool ok = m_physAgentProgId != 0 && m_physDepositProgId != 0
	       && m_physDiffuseProgId != 0 && m_physAgentTexUni >= 0
	       && m_physDepAttr >= 0;

	for( int i = 0; i < 2 && ok; ++i )
	{
		if( m_texPhysAgents[i] == 0 ) glGenTextures( 1, &m_texPhysAgents[i] );
		glBindTexture( GL_TEXTURE_2D, m_texPhysAgents[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kPhysAgentsSide, kPhysAgentsSide,
		              0, GL_RGBA, GL_FLOAT, NULL );
		if( m_fboPhysAgents[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboPhysAgents[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboPhysAgents[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texPhysAgents[i], 0 );
		if( !checkFramebufferStatus() ) ok = false;

		if( m_texPhysTrail[i] == 0 ) glGenTextures( 1, &m_texPhysTrail[i] );
		glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kPhysTrailSize, kPhysTrailSize,
		              0, GL_RGBA, GL_FLOAT, NULL );
		if( m_fboPhysTrail[i] == 0 ) glGenFramebuffersEXT( 1, &m_fboPhysTrail[i] );
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboPhysTrail[i] );
		glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texPhysTrail[i], 0 );
		if( !checkFramebufferStatus() ) ok = false;
		if( ok )
		{
			glClearColor( 0.f, 0.f, 0.f, 0.f );
			glClear( GL_COLOR_BUFFER_BIT );
		}
	}

	// One point per agent; the only attribute is the agent's texel coord.
	if( ok && m_physVBO == 0 )
	{
		std::vector<float> v;
		v.reserve( size_t(kPhysAgentsSide) * kPhysAgentsSide * 2 );
		for( int y = 0; y < kPhysAgentsSide; ++y )
			for( int x = 0; x < kPhysAgentsSide; ++x )
			{
				v.push_back( (x + 0.5f) / float(kPhysAgentsSide) );
				v.push_back( (y + 0.5f) / float(kPhysAgentsSide) );
			}
		glGenBuffers( 1, &m_physVBO );
		glBindBuffer( GL_ARRAY_BUFFER, m_physVBO );
		glBufferData( GL_ARRAY_BUFFER, GLsizeiptr(v.size() * sizeof(float)),
		              v.data(), GL_STATIC_DRAW );
		glBindBuffer( GL_ARRAY_BUFFER, 0 );
	}

	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );
	m_physReady  = ok;
	m_physSeeded = false;
	checkGLErrors("setupPhysarum()");
}

// One full Physarum frame: agents sense/turn/move (ping-pong), deposit their
// pheromone points, then the trail map diffuses + evaporates (ping-pong).
void FilterShader::stepPhysarum(const AudioFeatures &audio)
{
	if( !m_physReady )
		return;

	const int aCur  = m_physAgentIdx, aPrev = 1 - m_physAgentIdx;
	const int tCur  = m_physTrailIdx, tPrev = 1 - m_physTrailIdx;

	// ---- 1) Agent update ----
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboPhysAgents[aCur] );
	glViewport( 0, 0, kPhysAgentsSide, kPhysAgentsSide );
	glUseProgram( m_physAgentProgId );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysAgents[aPrev] );
	glActiveTexture( GL_TEXTURE1 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[tPrev] );
	glUniform1i( m_physAgentTexUni, 0 );
	if( m_physAgentTrailUni >= 0 ) glUniform1i( m_physAgentTrailUni, 1 );
	if( m_physAgentResUni   >= 0 ) glUniform2f( m_physAgentResUni,
	                                            (float)kPhysAgentsSide, (float)kPhysAgentsSide );
	if( m_physAgentSeedUni  >= 0 ) glUniform1f( m_physAgentSeedUni, m_physSeeded ? 0.f : 1.f );
	if( m_physAgentTimeUni  >= 0 ) glUniform1f( m_physAgentTimeUni, m_globaltime );
	// Audio character: bright material makes tight directed veins, loud
	// passages speed the swarm up, hard kicks scatter part of it.
	if( m_physAgentSpeedUni >= 0 ) glUniform1f( m_physAgentSpeedUni,
	                                            0.0016f + 0.0022f * audio.overallLevel
	                                                    + 0.0018f * audio.onsetKick );
	if( m_physAgentSensAUni >= 0 ) glUniform1f( m_physAgentSensAUni,
	                                            0.75f - 0.35f * audio.spectralCentroid );
	if( m_physAgentSensDUni >= 0 ) glUniform1f( m_physAgentSensDUni, 0.014f );
	if( m_physAgentTurnUni  >= 0 ) glUniform1f( m_physAgentTurnUni,
	                                            0.30f + 0.25f * audio.onsetStrength );
	if( m_physAgentScatUni  >= 0 ) glUniform1f( m_physAgentScatUni,
	                                            ( audio.onsetKick > 0.75f ) ? 0.10f : 0.f );
	drawWindow();

	// ---- 2) Deposit: 65k points into the CURRENT trail (additive) ----
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboPhysTrail[tPrev] );
	glViewport( 0, 0, kPhysTrailSize, kPhysTrailSize );
	glUseProgram( m_physDepositProgId );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysAgents[aCur] );
	if( m_physDepAgentsUni >= 0 ) glUniform1i( m_physDepAgentsUni, 0 );
	if( m_physDepAmtUni    >= 0 ) glUniform1f( m_physDepAmtUni,
	                                           0.06f + 0.05f * audio.onsetStrength );
	glEnable( GL_BLEND );
	glBlendFunc( GL_ONE, GL_ONE );
	glBindBuffer( GL_ARRAY_BUFFER, m_physVBO );
	glEnableVertexAttribArray( GLuint(m_physDepAttr) );
	glVertexAttribPointer( GLuint(m_physDepAttr), 2, GL_FLOAT, GL_FALSE,
	                       2 * sizeof(float), (const void *) 0 );
	glDrawArrays( GL_POINTS, 0, kPhysAgentsSide * kPhysAgentsSide );
	glDisableVertexAttribArray( GLuint(m_physDepAttr) );
	glBindBuffer( GL_ARRAY_BUFFER, 0 );
	glDisable( GL_BLEND );

	// ---- 3) Diffuse + evaporate into the other trail buffer ----
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboPhysTrail[tCur] );
	glUseProgram( m_physDiffuseProgId );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[tPrev] );
	if( m_physDifTrailUni >= 0 ) glUniform1i( m_physDifTrailUni, 0 );
	if( m_physDifResUni   >= 0 ) glUniform2f( m_physDifResUni,
	                                          (float)kPhysTrailSize, (float)kPhysTrailSize );
	if( m_physDifDecayUni >= 0 ) glUniform1f( m_physDifDecayUni,
	                                          0.94f + 0.02f * audio.ambientFactor );
	drawWindow();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_physSeeded   = true;
	m_physAgentIdx = aPrev;
	m_physTrailIdx = tPrev;
}

// Accumulate the self-similarity matrix: every kSSMStride seconds push one
// feature vector (12 chroma bins + 8 coarse spectral-shape dims, unit-
// normalised) into the ring and fill its row+column with sharpened cosine
// similarity.  CPU-only and cheap (256 20-dim dots ~3x per second), so it
// runs EVERY frame regardless of what is on screen — the history must exist
// BEFORE the SelfSimilarity effect appears, not start from black.
void FilterShader::stepSSM(const AudioFeatures &a, float dt)
{
	m_ssmAccum += dt;
	if( m_ssmAccum < kSSMStride )
		return;
	m_ssmAccum = fmodf( m_ssmAccum, kSSMStride );

	float v[kSSMDims];
	for( int i = 0; i < 12; ++i )
		v[i] = a.chroma[i];
	// Coarse spectral shape: 32 bands averaged down to 8 (weighted a touch
	// below the chroma so HARMONY dominates the structure comparison).
	for( int i = 0; i < 8; ++i )
	{
		float s = 0.f;
		for( int k = 0; k < 4; ++k )
			s += a.spectrum[i * 4 + k];
		v[12 + i] = s * 0.125f;
	}
	float n2 = 0.f;
	for( int i = 0; i < kSSMDims; ++i ) n2 += v[i] * v[i];
	if( n2 < 1e-8f )
		return;                        // silence: keep the last written entry
	float inv = 1.f / sqrtf( n2 );
	for( int i = 0; i < kSSMDims; ++i ) v[i] *= inv;

	const int h = m_ssmHead;
	memcpy( m_ssmVecs[h], v, sizeof(v) );
	for( int j = 0; j < kSSMSize; ++j )
	{
		float d = 0.f;
		for( int i = 0; i < kSSMDims; ++i )
			d += v[i] * m_ssmVecs[j][i];
		d = ( d < 0.f ) ? 0.f : d;
		d = d * d * d;                 // sharpen: only real similarity stays bright
		unsigned char byte = (unsigned char)( d * 255.f + 0.5f );
		m_ssmData[h * kSSMSize + j] = byte;   // row
		m_ssmData[j * kSSMSize + h] = byte;   // column (symmetric)
	}
	m_ssmHead  = ( h + 1 ) % kSSMSize;
	if( m_ssmCount < kSSMSize ) ++m_ssmCount;
	m_ssmDirty = true;
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

	// Wander Pearson's Gray-Scott parameter space with the music (the
	// research-paper mapping): the spectral centroid slides the KILL rate so
	// bright material morphs the tissue toward worm-like meanders and dark
	// material toward coral/spot patterns, while bass transients pulse the
	// FEED rate — sudden extra feed reads as cell division (mitosis bursts).
	// Both inputs are already smoothed/decaying envelopes; the ranges stay
	// clamped inside the stable valley around the old fixed point
	// (F=0.0545, k=0.062) so the simulation can neither die out nor explode.
	float rdKill = 0.0660f - 0.0070f * audio.spectralCentroid;
	float rdFeed = 0.0500f + 0.0120f * audio.swell
	             + 0.0160f * audio.beatDecay;
	rdKill = std::min( std::max( rdKill, 0.058f ), 0.066f );
	rdFeed = std::min( std::max( rdFeed, 0.035f ), 0.070f );
	if( m_rdFeedUni >= 0 ) glUniform1f( m_rdFeedUni, rdFeed );
	if( m_rdKillUni >= 0 ) glUniform1f( m_rdKillUni, rdKill );
	// Onsets / beats inject fresh reagent so the field blossoms with the music.
	float inject = (audio.onsetStrength > 0.2f || audio.beatDecay > 0.3f) ? 1.f : 0.f;
	if( m_rdInjectUni >= 0 ) glUniform1f( m_rdInjectUni, inject );

	drawWindow();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_rdSeeded = true;
	m_rdIdx    = prev;   // ping-pong swap; newest state is now m_texRD[1 - m_rdIdx]
}

// Mood-based selection bias — see header.  Two components:
//   1. Busyness: shader complexity should roughly match the arousal.
//   2. Mood TAGS (config attribute mood="dark,bright,calm,aggressive"): a
//      tagged shader is preferred when the music's mood agrees (dark valence →
//      dark shaders, high arousal → aggressive, ambient → calm) and penalised
//      when it clearly disagrees.  Untagged shaders stay neutral, so sparsely
//      tagged configs keep working.  The result stays probabilistic — a bias,
//      not a hard filter, so variety survives.
// Track-title reveal: render "title / artist" into a transparent image; the
// GL upload happens at the next paint() (context current there).  A soft dark
// halo keeps the text readable over any content.
void FilterShader::showTitle( const QString &title, const QString &artist )
{
	const int W = 1024, H = 256;
	QImage img( W, H, QImage::Format_ARGB32 );
	img.fill( Qt::transparent );
	QPainter p( &img );
	p.setRenderHint( QPainter::Antialiasing );
	p.setRenderHint( QPainter::TextAntialiasing );

	QFont ft( "Segoe UI", 52, QFont::Bold );
	QFont fa( "Segoe UI", 26 );
	QString t = QFontMetrics( ft ).elidedText( title,  Qt::ElideRight, W - 80 );
	QString a = QFontMetrics( fa ).elidedText( artist, Qt::ElideRight, W - 80 );

	const QRect rT( 40, 24, W - 80, 132 );
	const QRect rA( 40, 156, W - 80, 68 );
	p.setFont( ft );
	p.setPen( QColor( 0, 0, 0, 150 ) );
	for( int dy = -2; dy <= 2; ++dy )
		for( int dx = -2; dx <= 2; ++dx )
			if( dx != 0 || dy != 0 )
				p.drawText( rT.translated( dx, dy ), Qt::AlignHCenter | Qt::AlignVCenter, t );
	p.setPen( QColor( 255, 255, 255, 235 ) );
	p.drawText( rT, Qt::AlignHCenter | Qt::AlignVCenter, t );
	if( !a.isEmpty() )
	{
		p.setFont( fa );
		p.setPen( QColor( 0, 0, 0, 140 ) );
		for( int dy = -1; dy <= 1; ++dy )
			for( int dx = -1; dx <= 1; ++dx )
				if( dx != 0 || dy != 0 )
					p.drawText( rA.translated( dx, dy ), Qt::AlignHCenter | Qt::AlignVCenter, a );
		p.setPen( QColor( 205, 218, 238, 225 ) );
		p.drawText( rA, Qt::AlignHCenter | Qt::AlignVCenter, a );
	}
	p.end();
	m_titlePending = img;
}

// Manual "next" (key 'n', MIDI pad, web remote): skipping an effect that has
// only just come on screen reads as a dislike — remember it (soft, decaying).
void FilterShader::requestSceneChange()
{
	// Tell the user WHY nothing will happen instead of silently ignoring
	// the key (a pinned/frozen show swallowing 'n' looks like a bug).
	if( s_pinned )
	{
		fprintf( stderr, "n: ignored - PIN is active (press 'u' to unpin)\n" );
		return;
	}
	if( s_freeze )
	{
		fprintf( stderr, "n: ignored - FREEZE is active (press 'e' to unfreeze)\n" );
		return;
	}
	if( m_actEffectTexture < m_effectTextures.size() &&
	    m_timeEffectTexture.elapsed() < 10000 )
		bumpTaste( m_effectTextures[m_actEffectTexture]->fragmentName(), 0.8f );
	m_forceEffectChange  = true;
	m_forceCombineChange = true;
}

// Key 'f': the user LIKES what is on screen — persistent selection bonus.
void FilterShader::favoriteCurrentEffect()
{
	if( m_actEffectTexture < m_effectTextures.size() )
		bumpTaste( m_effectTextures[m_actEffectTexture]->fragmentName(), 1.25f );
}

bool FilterShader::moodAccept(EffectShader *s)
{
	float target = 1.f + m_lastArousal * 9.f;               // desired busyness 1..10
	float diff   = fabs(float(s->getComplexity()) - target) / 9.f;
	float accept = 1.f - 0.6f * diff;                       // closer match → likelier

	// Learned taste (skip-malus / favourite-bonus, persistent).
	accept *= tasteFor( s->fragmentName() );

	unsigned int f = s->moodFlags();
	if (f)
	{
		float bonus = 0.f;
		if (f & EffectShader::MOOD_BRIGHT)
			bonus += (m_lastValence - 0.5f) * 0.8f;
		if (f & EffectShader::MOOD_DARK)
			bonus += (0.5f - m_lastValence) * 0.8f;
		if (f & EffectShader::MOOD_AGGRESSIVE)
			bonus += (m_lastArousal - 0.5f) * 0.8f + (0.3f - m_lastAmbient) * 0.4f;
		if (f & EffectShader::MOOD_CALM)
			bonus += (0.5f - m_lastArousal) * 0.6f + (m_lastAmbient - 0.3f) * 0.6f;
		accept += bonus;
	}
	// Floor keeps every shader reachable (never a hard exclusion); a disliked
	// shader gets a lower floor, but never zero.
	float floorv = 0.15f * std::min( tasteFor( s->fragmentName() ), 1.f );
	if (floorv < 0.05f) floorv = 0.05f;
	if (accept < floorv) accept = floorv;
	return (float(qrand()) / float(RAND_MAX)) < accept;
}

void FilterShader::paint(const float *rotMatrix, float tx, float ty, float tz,
                         const AudioFeatures &audio)
{
	m_lastArousal = audio.arousal;   // for mood-biased effect selection
	m_lastValence = audio.valence;
	m_lastAmbient = audio.ambientFactor;
	// Snapshot for the ImageLoader's mood-matched image choice (its thread).
	m_moodValence = audio.valence;
	m_moodArousal = audio.arousal;
	m_moodAmbient = audio.ambientFactor;

	// Lazy-compile warm-up: build ONE not-yet-compiled program per frame.
	// Start-up is instant (prepare() records only the size) and every shader
	// is ready long before random selection could pick it; the on-demand
	// compile in enableShader() remains as the safety net.
	{
		bool warmed = false;
		for( EffectShader *s : m_effectTextures )
			if( !s->isCompiled() ) { s->ensureCompiled(); warmed = true; break; }
		if( !warmed )
			for( EffectShader *s : m_effectCombines )
				if( !s->isCompiled() ) { s->ensureCompiled(); break; }
	}

	// Live input (-i): receive the Spout sender's frame; while a sender runs
	// its texture replaces BOTH image slots below (crossfades collapse to a
	// no-op on the image, every effect folds the LIVE picture).  No sender ->
	// m_liveTex stays 0 and the photos work as usual.
	if( s_spoutInEnabled )
	{
		spoutInInit( s_spoutInSender.toLocal8Bit().constData() );   // idempotent
		unsigned int lw = 0, lh = 0;
		m_liveTex = spoutInReceive( &lw, &lh );
	}

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
	// Wall-clock frame time, immune to the freeze below (the blackout fade
	// must keep moving even over a frozen picture).
	const float dtWall = timeSinceLastFrameSec;

	// FPS-driven detail budget for the heavy cube scenes: below ~45 fps every
	// 2nd cube is dropped (uniform `cubeBudget`, hysteresis so it never
	// oscillates); above ~57 fps full detail returns.
	if( dtWall > 1e-4f && dtWall < 0.5f )
	{
		float fps = 1.f / dtWall;
		m_cubeFpsEma += 0.05f * ( fps - m_cubeFpsEma );
		if( m_cubeFpsEma < 45.f && Scene3DShader::s_cubeBudget > 0.75f )
			Scene3DShader::s_cubeBudget = 0.5f;
		else if( m_cubeFpsEma > 57.f && Scene3DShader::s_cubeBudget < 0.75f )
			Scene3DShader::s_cubeBudget = 1.f;
	}

	// VJ FREEZE ('e'): hold the picture.  Frame time 0 stops every phase
	// integration and envelope slew; re-arming the activation clocks each
	// frozen frame keeps scheduled switches from falling "due" behind the
	// frozen image (they simply start their solo fresh on unfreeze).
	if( s_freeze )
	{
		timeSinceLastFrameSec = 0.f;
		m_timeEffectTexture.restart();
		m_timeEffectCombine.restart();
		m_timeTexture.restart();
	}
	// VJ PIN ('u'): keep the current effect/combine — re-arm only their
	// clocks (images keep rotating); forced cuts are suppressed below.
	else if( s_pinned )
	{
		m_timeEffectTexture.restart();
		m_timeEffectCombine.restart();
	}

	// DJ-STOP dramaturgy: while the music holds its breath the PICTURE holds
	// too — motion freezes within ~0.1 s (95 % dt cut, slewed so it eases in
	// rather than snapping) and releases just as fast on the slam-back, which
	// additionally hits the camera below (breakSlam -> dropPulse).
	m_breakSmooth = slewToward( m_breakSmooth, audio.breakHold, 9.f, dtWall );
	timeSinceLastFrameSec *= 1.f - 0.95f * m_breakSmooth;

	// Track-title reveal: upload a freshly rendered title (GL context is
	// current here) and advance the reveal clock on the WALL time (the
	// reveal keeps playing over a frozen/stopped picture).
	if( !m_titlePending.isNull() )
	{
		QImage gl = m_titlePending.convertToFormat( QImage::Format_RGBA8888 );
		if( m_titleTex == 0 ) glGenTextures( 1, &m_titleTex );
		glBindTexture( GL_TEXTURE_2D, m_titleTex );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, gl.width(), gl.height(), 0,
		              GL_RGBA, GL_UNSIGNED_BYTE, gl.constBits() );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glBindTexture( GL_TEXTURE_2D, 0 );
		m_titleAspect  = float(gl.width()) / float(gl.height());
		m_titlePending = QImage();
		m_titleAge     = 0.f;

		// Roll a reveal STYLE that fits the music playing right now.  Each
		// mood category has its own pool of matching styles (calm → soft
		// dissolves and drifts, aggressive → glitch/slam/stutter, bright →
		// light sweeps and sparkle, dark → smoke/shadow), and the pick
		// within the pool is random so repeats stay varied.
		// KALEIDO_TITLE_STYLE=<n> forces one style (tuning aid).
		{
			static const int calmPool[]   = { 0, 1, 2, 4, 5, 9, 17, 20, 23 };
			static const int aggroPool[]  = { 7, 10, 11, 12, 13, 14, 21, 22 };
			static const int brightPool[] = { 3, 6, 8, 15, 18, 19 };
			static const int darkPool[]   = { 0, 2, 5, 16, 17, 20 };
			const int *pool; int n;
			if( audio.ambientFactor > 0.55f || audio.arousal < 0.35f )
				{ pool = calmPool;   n = 9; }
			else if( audio.arousal > 0.62f && audio.valence < 0.58f )
				{ pool = aggroPool;  n = 8; }
			else if( audio.valence > 0.55f )
				{ pool = brightPool; n = 6; }
			else
				{ pool = darkPool;   n = 6; }
			m_titleStyle = pool[ qrand() % n ];
			QByteArray forced = qgetenv( "KALEIDO_TITLE_STYLE" );
			if( !forced.isEmpty() )
				m_titleStyle = forced.toInt();
			m_titleSeed = float(qrand()) / float(RAND_MAX);
			fprintf( stderr, "Title reveal: style %d\n", m_titleStyle );
		}
	}
	else
		m_titleAge += dtWall;


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
        float gateRaw = (audio.musicPresence - 0.32f) / 0.28f;
        gateRaw = (gateRaw < 0.f) ? 0.f : (gateRaw > 1.f ? 1.f : gateRaw);
        gateRaw = gateRaw * gateRaw * (3.f - 2.f * gateRaw);   // smoothstep
        // The gate multiplies EVERY audio signal below, so even slow wobbles of
        // the music/speech classifier around its threshold used to pump the whole
        // show up and down.  Slew it so global reactivity fades over >~0.8 s.
        m_gateSmooth = slewToward(m_gateSmooth, gateRaw, 1.2f, dt);
        const float gate = m_gateSmooth;

        // Continuous beat phase (PLL).  The analyzer's beatPhase RESYNCS (snaps)
        // on every detected beat — early/late detections jumped the phase, and
        // several shaders animate with sin(2*pi*beatPhase) (lava bob, oil zoom,
        // cube pulse, the rotation's beat-breath), so each resync was a visible
        // jerk.  Run our own phase at the estimated tempo and PULL it gently
        // toward the analyzer's phase (wrap-aware): continuous by construction,
        // and in silence (gate 0) it glides to a halt instead of pulsing on.
        {
            float bpm  = 40.f + 160.f * audio.estimatedBPM;
            float rate = (audio.estimatedBPM > 0.004f) ? (bpm / 60.f) : 0.f;
            float err  = audio.beatPhase - m_beatPhasePLL;
            err -= floorf(err + 0.5f);                        // wrap to [-0.5, 0.5)
            float corr = 2.0f * dt; if (corr > 0.3f) corr = 0.3f;
            m_beatPhasePLL += (dt * rate + err * corr) * gate;
            m_beatPhasePLL -= floorf(m_beatPhasePLL);         // keep in [0, 1)
        }

        // Bar tracking: the bar position advances on each PLL wrap and re-syncs
        // to the analyzer's accent-detected downbeat.  downbeatTick marks the
        // exact frame a downbeat lands, so scene changes can be quantised onto
        // the musical "1"; barPhase (0..1 over 4 beats) goes to the shaders for
        // slow, in-tempo per-bar movement.
        if (m_beatPhasePLL < m_prevPllPhase - 0.5f)            // phase wrapped
            m_barBeatHost = (m_barBeatHost + 1) & 3;
        m_prevPllPhase = m_beatPhasePLL;
        m_downbeatTick = (audio.downbeat > 0.9f && m_prevRawDownbeat <= 0.9f);
        if (m_downbeatTick)
            m_barBeatHost = 0;
        m_prevRawDownbeat = audio.downbeat;

        // Swell: a slow loudness-build envelope (fast average minus slow average)
        // — rises while the music builds, falls in fade-outs.  THE ambient-motion
        // signal: level is too fast and arousal too sluggish to show a drone
        // swelling.  Drives bloom/brightness breathing + a gentle forward surge.
        {
            float aF = 1.f - expf(-dt / 1.5f);
            float aS = 1.f - expf(-dt / 8.0f);
            m_swellFast += aF * (audio.overallLevel - m_swellFast);
            m_swellSlow += aS * (audio.overallLevel - m_swellSlow);
        }
        float swell = (m_swellFast - m_swellSlow) * 4.f;
        swell = (swell < 0.f) ? 0.f : (swell > 1.f ? 1.f : swell);

        // SONG-END dramaturgy: a fade-out is the 6 s loudness average sinking
        // well below the 20 s one while music is still (barely) present.  The
        // envelope rises slowly (never fires on a mere break) and releases
        // fast when the level comes back.
        {
            float a6  = 1.f - expf(-dt / 6.f);
            float a20 = 1.f - expf(-dt / 20.f);
            m_fadeSlow6  += a6  * (audio.overallLevel - m_fadeSlow6);
            m_fadeSlow20 += a20 * (audio.overallLevel - m_fadeSlow20);
            float ev = 0.f;
            if( m_fadeSlow20 > 0.08f && audio.musicPresence > 0.25f )
                ev = clampParam( (m_fadeSlow20 * 0.70f - m_fadeSlow6)
                                 / (m_fadeSlow20 * 0.45f + 1e-4f), 0.f, 1.f );
            float rate = ( ev > m_fadeOutEnv ) ? 0.35f : 1.8f;
            m_fadeOutEnv = slewToward( m_fadeOutEnv, ev, rate, dt );
        }
        audioFx.fadeOut = m_fadeOutEnv;

        // MELODY ring: dominantPitch sampled every 80 ms (~7.7 s window).
        m_melodyAccum += dt;
        if( m_melodyAccum >= 0.08f )
        {
            m_melodyAccum = fmodf( m_melodyAccum, 0.08f );
            m_melody[m_melodyHead] = audio.dominantPitch;
            m_melodyHead = ( m_melodyHead + 1 ) % 96;
        }
        for( int i = 0; i < 96; ++i ) audioFx.melody[i] = m_melody[i];
        audioFx.melodyHead = float(m_melodyHead) / 96.f;

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

        // A gentle in-tempo "breathing" from the continuous (PLL) beat phase.
        float beatBreath = 0.5f - 0.5f * cosf(m_beatPhasePLL * 6.2831853f);

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
                                 + 0.10f * audio.harmonicChange
                                 + 0.03f * swell );   // ambient builds surge gently
        m_audioAdvance += dt * advRate;

        // Peak-hold + exponential-release envelopes for the transient pulses.
        // The analyzer's raw pulses decay at audio-block rate (gone in ~60 ms):
        // the rise-limited smoothing below could never reach the peak before the
        // target collapsed, which flattened every beat to a barely-visible blip.
        // Holding the peak and releasing exponentially gives the slew a stable
        // target — beats now rise to their FULL strength and breathe out.
        m_beatEnv     = fmaxf(m_beatEnv     * expf(-dt / 0.30f), audio.beatDecay);
        m_onsetEnv    = fmaxf(m_onsetEnv    * expf(-dt / 0.22f), audio.onsetStrength);
        m_downbeatEnv = fmaxf(m_downbeatEnv * expf(-dt / 0.45f), audio.downbeat);
        // Instrument-separated onsets: same peak-hold treatment, with releases
        // matched to the instrument (kick booms, hats snap).
        m_kickEnv  = fmaxf(m_kickEnv  * expf(-dt / 0.24f), audio.onsetKick);
        m_snareEnv = fmaxf(m_snareEnv * expf(-dt / 0.20f), audio.onsetSnare);
        m_hatEnv   = fmaxf(m_hatEnv   * expf(-dt / 0.14f), audio.onsetHat);

        // Tempo-locked pulse: when the rhythm is confidently periodic, blend a
        // pulse derived from the CONTINUOUS beat phase into the beat target — the
        // visible pulse then sits exactly on the tempo grid and keeps pulsing
        // through the occasional missed kick (detection gaps no longer stutter
        // the rhythm).  Its rise (~1/4 beat) is inherently slower than the slew
        // limit, so photosensitivity safety is unaffected.
        float conf = (audio.rhythmStrength - 0.40f) / 0.40f;
        conf = (conf < 0.f) ? 0.f : (conf > 1.f ? 1.f : conf);
        // Latency compensation: lead the DISPLAY phase by s_latencyLead seconds
        // (loopback capture + analysis + render + scanout lag behind the heard
        // audio) so the tempo pulse and all phase-driven movement land ON the
        // beat the listener hears, not slightly after it.
        float bpmLead   = 40.f + 160.f * audio.estimatedBPM;
        float rateLead  = (audio.estimatedBPM > 0.004f) ? (bpmLead / 60.f) : 0.f;
        float phaseLead = m_beatPhasePLL + s_latencyLead * rateLead;
        phaseLead -= floorf(phaseLead);
        float tri  = 1.f - 2.f * fminf(phaseLead, 1.f - phaseLead);
        float phasePulse = tri * tri * tri;          // narrow pulse peaked ON the grid
        float beatTarget = fmaxf(m_beatEnv, 0.8f * conf * phasePulse);

        // Slew-limit the visible values (photosensitive-safety: a rise to full
        // takes >= ~150 ms, never a single frame).  The envelopes' exponential
        // release is slower than the fall slew, so the decay stays smooth.
        m_audioBeatSmooth  = slewToward(m_audioBeatSmooth,  beatTarget,    6.0f, dt);
        m_onsetSmooth      = slewToward(m_onsetSmooth,      m_onsetEnv,    7.0f, dt);
        m_downbeatSmooth   = slewToward(m_downbeatSmooth,   m_downbeatEnv, 5.0f, dt);
        m_kickSmooth       = slewToward(m_kickSmooth,       m_kickEnv,     7.0f, dt);
        m_snareSmooth      = slewToward(m_snareSmooth,      m_snareEnv,    7.0f, dt);
        m_hatSmooth        = slewToward(m_hatSmooth,        m_hatEnv,      8.0f, dt);
        m_audioLevelSmooth = slewToward(m_audioLevelSmooth, audio.overallLevel, 3.0f, dt);
        m_audioFluxSmooth  = slewToward(m_audioFluxSmooth,  audio.spectralFlux, 3.0f, dt);

        // Colour-chase phase: advance a quarter-turn on each fresh onset (music-
        // gated), so the corner cones light up in sequence (a chase / Lauflicht).
        float onsetGated = audio.onsetStrength * gate;
        if( onsetGated > 0.30f && m_prevChaseOnset <= 0.15f )
            m_chasePhase = fmodf( m_chasePhase + 0.25f, 1.0f );
        m_prevChaseOnset = onsetGated;

        audioFx.audioRotPhase = m_audioRotPhase;
        audioFx.audioAdvance  = m_audioAdvance;
        audioFx.beatDecay     = m_audioBeatSmooth     * gate;
        audioFx.onsetStrength = m_onsetSmooth         * gate;
        audioFx.downbeat      = m_downbeatSmooth      * gate;
        audioFx.onsetKick     = m_kickSmooth          * gate;
        audioFx.onsetSnare    = m_snareSmooth         * gate;
        audioFx.onsetHat      = m_hatSmooth           * gate;
        audioFx.transStyle    = m_transStyleTex;
        audioFx.beatPhase     = phaseLead;            // continuous (PLL + latency lead)
        audioFx.swell         = swell * gate;
        // Bar phase with the same lead, kept continuous across the beat wrap
        // by leading the raw bar position (not the wrapped phase).
        {
            float barPos = float(m_barBeatHost) + m_beatPhasePLL + s_latencyLead * rateLead;
            audioFx.barPhase = (barPos - floorf(barPos * 0.25f) * 4.f) * 0.25f;
        }
        audioFx.overallLevel  = m_audioLevelSmooth    * gate;
        audioFx.spectralFlux  = m_audioFluxSmooth     * gate;
        audioFx.stereoWidth   = audio.stereoWidth     * gate;
        audioFx.buildUp       = audio.buildUp         * gate;
        // Day/night cycle: a slow wall-clock sawtooth, independent of the
        // music gate (the sky keeps turning even through silence/speech).
        audioFx.dayPhase      = fmodf( m_globaltime / 280.f, 1.f );
        // Self-similarity ring bookkeeping for the SelfSimilarity effect.
        audioFx.ssmHead       = float(m_ssmHead)  / float(kSSMSize);
        audioFx.ssmFill       = float(m_ssmCount) / float(kSSMSize);
        // The DJ-stop slam-back rides the same "hit" channel as a drop
        // (camera punch + shake + the shaders' audioDrop uniform).
        audioFx.dropPulse     = std::max( audio.dropPulse, audio.breakSlam ) * gate;

        // ---- Virtual camera (global "Regie" layer, applied in the present
        // pass): micro drift keeps every effect subtly "filmed"; the downbeat
        // punches in and releases; the bar rolls the frame gently; a build-up
        // slowly tightens the shot; kicks add a tiny shake and a DROP hits
        // hard.  All terms are either slew-limited envelopes or fixed-
        // frequency oscillations — no phase remapping, no flicker.
        {
            if( m_downbeatTick )
                m_camPunch = std::max( m_camPunch, 0.20f + 0.25f * m_downbeatSmooth );
            m_camPunch *= expf( -dt / 0.35f );
            float punch = m_camPunch + 1.1f * audioFx.dropPulse;
            float zoom  = 1.f + 0.045f * audioFx.buildUp * audioFx.buildUp
                              + 0.055f * punch;
            float sway  = 0.010f * sinf( 6.2831853f * audioFx.barPhase )
                        * audio.rhythmStrength * gate;
            float shakeAmp = 0.0035f * m_kickSmooth * gate
                           + 0.010f  * audioFx.dropPulse;
            float ox = 0.0030f * sinf( m_globaltime * 0.23f )
                     + shakeAmp * sinf( m_globaltime * 39.7f );
            float oy = 0.0030f * cosf( m_globaltime * 0.17f )
                     + shakeAmp * cosf( m_globaltime * 31.3f );
            // The zoom must always pay for the offset + rotation so no edge
            // ever samples outside the frame.
            float need = fabsf(ox) + fabsf(oy) + 0.62f * fabsf(sway);
            zoom = std::max( zoom, 1.f + 2.4f * need );
            m_camZoom = zoom; m_camRot = sway;
            m_camOffX = ox;   m_camOffY = oy;
        }
        // Mood signals collapse to neutral (0.5 / 0) as music fades out.
        audioFx.valence         = 0.5f + (audio.valence         - 0.5f) * gate;
        audioFx.arousal         = 0.5f + (audio.arousal         - 0.5f) * gate;
        audioFx.spectralCentroid= 0.5f + (audio.spectralCentroid- 0.5f) * gate;
        // Key colour: slew the chroma hue AROUND the colour circle (shortest
        // way, max ~20 deg/s) so key changes glide instead of jumping the
        // global palette from one frame to the next.
        {
            float d = audio.chromaHue - m_chromaHueSlew;
            d -= floorf(d + 0.5f);                        // wrap to [-0.5, 0.5)
            float maxStep = 0.055f * dt;
            if (d >  maxStep) d =  maxStep;
            if (d < -maxStep) d = -maxStep;
            m_chromaHueSlew += d;
            m_chromaHueSlew -= floorf(m_chromaHueSlew);   // keep in [0, 1)
        }
        audioFx.chromaHue       = m_chromaHueSlew * gate;
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

    // SECTION change (Strophe -> Refrain -> Bridge): the analyzer's spectral-
    // shape novelty detector increments audio.sectionCount once per section.
    // A single +1 step forces an early cut with the SHORT (0.8 s) cross-fade,
    // still quantised onto the next downbeat by the pending machinery below,
    // so the new shader lands on the musical "1" of the new section.  Every
    // second section also swaps the combine pass for a bigger scenery change.
    // (Any other difference — e.g. this FilterShader was just (re)started
    // while the analyzer kept counting — only re-syncs, without a cut.)
    // SONG-STRUCTURE MEMORY: audio.sectionId identifies the section — a
    // RETURNING section (chorus #2 = chorus #1) replays the shader, combine
    // and exact parameter values it had the first time; a NEW section rolls
    // fresh and its look is stored under the id after the switch completes.
    if( audio.sectionCount == m_lastSectionCount + 1 )
    {
        int  id = audio.sectionId;
        auto it = m_sectionEffect.find( id );
        bool known = (id >= 0) && it != m_sectionEffect.end()
                     && it->second < m_effectTextures.size();
        if( known && it->second == m_actEffectTexture )
        {
            // The right shader is already on screen — just refresh its look.
            m_effectTextures[m_actEffectTexture]->restoreParameters( m_sectionParams[id] );
        }
        else
        {
            if( known )
            {
                m_nextEffectTexture     = it->second;   // replay that section's shader
                m_pendingSectionRestore = id;           //   ... with its exact params
                auto ic = m_sectionCombine.find( id );
                if( ic != m_sectionCombine.end()
                    && ic->second < m_effectCombines.size()
                    && ic->second != m_actEffectCombine )
                {
                    m_nextEffectCombine  = ic->second;
                    m_forceCombineChange = true;
                }
            }
            else
            {
                m_pendingSectionStore = id;             // remember the new look
                if( (audio.sectionCount & 1) == 0 )
                    m_forceCombineChange = true;        // bigger scenery change
            }
            m_forceEffectChange = true;
        }
        m_noveltyCooldown = 8.0f;     // hold off the harmonic hook right after
    }
    m_lastSectionCount = audio.sectionCount;

    // DROP (bass slams back after a build-up + breakdown): the analyzer bumps
    // audio.dropCount at the hit.  React with an immediate scene cut — the
    // pending machinery still quantises it, but a drop IS a downbeat-scale
    // accent, so it lands right where the ear expects the change.  The
    // camera layer additionally hits/shakes on audio.dropPulse.
    if( audio.dropCount == m_lastDropCount + 1 )
    {
        m_forceEffectChange = true;
        m_noveltyCooldown   = 8.0f;
    }
    m_lastDropCount = audio.dropCount;

    // VJ PIN ('u'): suppress every forced cut while the current look is held.
    if( s_pinned )
    {
        m_forceEffectChange  = false;
        m_forceCombineChange = false;
        // A pending section store/restore must not attach to some LATER,
        // unrelated switch after unpinning — drop it.
        m_pendingSectionStore   = -1;
        m_pendingSectionRestore = -1;
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

		//time is up => switch to modus blending.  Like the shader changes, the
		// IMAGE cross-fade start is quantised onto the next downbeat (with the
		// same timeout / no-music escape), so picture changes land on the "1".
		float ts = float(m_timeTexture.elapsed()) * 0.001;
		if( ts > m_timeTextureSolo )
			m_pendingImgChange = true;
		if( m_pendingImgChange )
		{
			m_pendingImgAge += timeSinceLastFrameSec;
			if( m_downbeatTick || m_pendingImgAge > 2.5f || m_gateSmooth < 0.25f )
			{
				m_pendingImgChange = false;
				m_pendingImgAge    = 0.f;
				m_stateTexture = 0;
				m_timeTexture.start();

				m_timeTextureSolo = (float) ((m_timeTextureSoloMax > m_timeTextureSoloMin)
					? m_timeTextureSoloMin + (qrand() % (m_timeTextureSoloMax - m_timeTextureSoloMin))
					: m_timeTextureSoloMin) / m_timingScale;   // min==max would be % 0
			}
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

            m_timeTextureInterpolation = (float) ((m_timeTextureInterpolationMax > m_timeTextureInterpolationMin)
                ? m_timeTextureInterpolationMin + (qrand() % (m_timeTextureInterpolationMax - m_timeTextureInterpolationMin))
                : m_timeTextureInterpolationMin) / m_timingScale;   // min==max would be % 0
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
			m_forceEffectChange   = false;
			m_pendingEffectChange = true;
			m_pendingEffectForced = m_pendingEffectForced || forced;
		}

		// Beat-quantised: a due change is held PENDING until the next downbeat
		// lands, so cuts fall on the musical "1".  A timeout keeps weak/undetected
		// beats from stalling the show, and without music we cut immediately.
		// A MANUAL ('n') cut skips the quantisation entirely — the user pressed
		// a button and expects the switch NOW, not on the next bar.
		if( m_pendingEffectChange )
		{
			m_pendingEffectAge += timeSinceLastFrameSec;
			if( m_pendingEffectForced || m_downbeatTick
			    || m_pendingEffectAge > 2.5f || m_gateSmooth < 0.25f )
			{
				bool forcedGo         = m_pendingEffectForced;
				m_pendingEffectChange = false;
				m_pendingEffectForced = false;
				m_pendingEffectAge    = 0.f;

				m_stateInterpolationEffectTexture = 1;

				// Roll a transition style: 26 styles (see CombinePlain.frag),
				// the classic linear mix stays the most common (~19%).
				{
					int r = qrand() % 31;
					m_transStyleTex = (r <= 5) ? 0 : (r - 5);
				}

				unsigned int timeAct = m_effectTextures[m_actEffectTexture]->getTimeInterpolation();
				unsigned int timeNext = m_effectTextures[m_nextEffectTexture]->getTimeInterpolation();

				// A manual ('n') cut uses a short, snappy cross-fade so it is clearly a
				// switch; a natural change uses the config's (long) interpolation time —
				// EXCEPT with a confident rhythm, where it becomes exactly 4 BEATS so
				// the transition breathes in the song's tempo (never longer than the
				// config asked for).
				{
					float cfgT = (float) (std::min( timeAct, timeNext)) / m_timingScale;
					if( !forcedGo && audio.rhythmStrength > 0.55f
					    && audio.estimatedBPM > 0.004f )
					{
						float fourBeats = 4.f * 60.f / (40.f + 160.f * audio.estimatedBPM);
						cfgT = fminf(fmaxf(fourBeats, 1.2f), cfgT);
					}
					// ARTICULATION: staccato material (sharp attacks) gets
					// snappier cross-fades, legato keeps the full dissolve —
					// the performance's phrasing shapes the editing style.
					cfgT *= 1.f - 0.35f * audio.logAttackTime;
					m_timeInterpolationEffectTexture = forcedGo ? 0.8f : cfgT;
				}

				m_effectTextures[m_nextEffectTexture]->startInterpolators();

				m_timeEffectTexture.start();
			}
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

			// Song-structure memory: a recognised section replays the exact
			// parameter values it had last time; a new section's fresh look
			// is remembered under its id (combine captured mid-swap if one is
			// running, so the stored pair matches what ends up on screen).
			if( m_pendingSectionRestore >= 0 )
			{
				auto ip = m_sectionParams.find( m_pendingSectionRestore );
				if( ip != m_sectionParams.end() )
					m_effectTextures[m_actEffectTexture]->restoreParameters( ip->second );
				m_pendingSectionRestore = -1;
			}
			if( m_pendingSectionStore >= 0 )
			{
				m_sectionEffect[m_pendingSectionStore]  = m_actEffectTexture;
				m_sectionCombine[m_pendingSectionStore] =
					(m_stateInterpolationEffectCombine != 0) ? m_nextEffectCombine
					                                         : m_actEffectCombine;
				m_sectionParams[m_pendingSectionStore]  =
					m_effectTextures[m_actEffectTexture]->snapshotParameters();
				m_pendingSectionStore = -1;
			}

			for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
			{
				m_nextEffectTexture = qrand() % m_effectTextures.size();
				if( m_nextEffectTexture != m_actEffectTexture &&
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() +
			m_effectCombines[m_actEffectCombine]->getComplexity() +
			m_effectCombines[m_nextEffectCombine]->getComplexity() ) < 20 )
			&& m_effectTextures[m_nextEffectTexture]->useShader()
			&& moodAccept( m_effectTextures[m_nextEffectTexture] )
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
		// Several PDE sub-steps per frame so the pattern develops quickly and
		// fills the whole field with lively, evolving structure (instead of a few
		// slow-moving injected spots).
		for( int s = 0; s < 6; ++s )
			stepReactionDiffusion( audio );
		glActiveTexture( GL_TEXTURE7 );
		glBindTexture( GL_TEXTURE_2D, m_texRD[1 - m_rdIdx] );   // newest state
	}

	// GPU fluid (curl-noise dye advection), same gating: only step while an
	// effect that samples "texFluid" is on screen; bound to global unit 8.
	bool fluidNeeded = m_fluidReady &&
	    ( m_effectTextures[m_actEffectTexture]->usesFluid()
	   || ( m_stateInterpolationEffectTexture != 0
	        && m_effectTextures[m_nextEffectTexture]->usesFluid() ) );
	if( fluidNeeded )
	{
		stepFluid( audio );
		glActiveTexture( GL_TEXTURE8 );
		glBindTexture( GL_TEXTURE_2D, m_texFluid[1 - m_fluidIdx] );
	}

	// GPU volumetric fire/smoke, same gating: only step while an effect that
	// samples "texSmoke3D" is on screen; bound to global unit 9.
	bool smoke3DNeeded = m_smoke3DReady &&
	    ( m_effectTextures[m_actEffectTexture]->usesSmoke3D()
	   || ( m_stateInterpolationEffectTexture != 0
	        && m_effectTextures[m_nextEffectTexture]->usesSmoke3D() ) );
	if( smoke3DNeeded )
	{
		stepSmoke3D( audio );
		glActiveTexture( GL_TEXTURE9 );
		glBindTexture( GL_TEXTURE_2D, m_texSmoke3D[1 - m_smoke3DIdx] );
	}

	// Physarum slime mould, same gating: only step while an effect that
	// samples "texPhysarum" is on screen; newest trail map on unit 11.
	bool physNeeded = m_physReady &&
	    ( m_effectTextures[m_actEffectTexture]->usesPhysarum()
	   || ( m_stateInterpolationEffectTexture != 0
	        && m_effectTextures[m_nextEffectTexture]->usesPhysarum() ) );
	if( physNeeded )
	{
		stepPhysarum( audio );
		stepPhysarum( audio );          // 2 sub-steps: the net develops faster
		glActiveTexture( GL_TEXTURE11 );
		glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[1 - m_physTrailIdx] );
	}

	// Self-similarity matrix: the HISTORY accumulates always (CPU-cheap, and
	// the structure must already exist when the effect appears); the texture
	// upload + bind (unit 10) only happens while an effect samples "texSSM".
	stepSSM( audio, timeSinceLastFrameSec );
	bool ssmNeeded =
	    ( m_effectTextures[m_actEffectTexture]->usesSSM()
	   || ( m_stateInterpolationEffectTexture != 0
	        && m_effectTextures[m_nextEffectTexture]->usesSSM() ) );
	if( ssmNeeded )
	{
		if( m_texSSM == 0 )
		{
			glGenTextures( 1, &m_texSSM );
			glBindTexture( GL_TEXTURE_2D, m_texSSM );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
			glTexImage2D( GL_TEXTURE_2D, 0, GL_LUMINANCE, kSSMSize, kSSMSize, 0,
			              GL_LUMINANCE, GL_UNSIGNED_BYTE, NULL );
		}
		glActiveTexture( GL_TEXTURE10 );
		glBindTexture( GL_TEXTURE_2D, m_texSSM );
		if( m_ssmDirty )
		{
			glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );
			glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, kSSMSize, kSSMSize,
			                 GL_LUMINANCE, GL_UNSIGNED_BYTE, m_ssmData );
			glPixelStorei( GL_UNPACK_ALIGNMENT, 4 );
			m_ssmDirty = false;
		}
	}


	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	glActiveTexture(GL_TEXTURE0);
	glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_actTex );


	glActiveTexture(GL_TEXTURE1);
	glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_nextTex );


	// TRUE STEREO: a solo 3D scene in SBS/TB renders once per eye below — and
	// since a 3D<->3D texture cross-fade can be blended per-pixel, the PACKED
	// state now also covers that: both scenes render per-eye and a plain mix
	// replaces the styled combine (no warp may cross the eye boundary).
	// While packed content is up, no combine cross-fade may start.
	{
		const bool stereoOn = ( s_stereoMode == 1 || s_stereoMode == 2 );
		const bool act3D    = m_effectTextures[m_actEffectTexture]->is3D();
		const bool texSolo  = ( m_stateInterpolationEffectTexture == 0 );
		const bool next3D   = m_effectTextures[m_nextEffectTexture]->is3D();
		m_trueStereoHold   = stereoOn && act3D && ( texSolo || next3D );
		m_trueStereoPacked = m_trueStereoHold
		                   && m_stateInterpolationEffectCombine == 0;
		m_trueStereoNow    = m_trueStereoPacked && texSolo;
	}

	// Per-eye scene render into the SBS/TB halves of the bound FBO
	// (scissored, so each eye's clear stays inside its half).  Eye
	// separation scales with the stereo-depth knob (keys c/m).
	auto renderSceneStereo = [&]( EffectShader *fx )
	{
		Scene3DShader *s3 = static_cast<Scene3DShader *>( fx );
		glEnable( GL_SCISSOR_TEST );
		for( int e = 0; e < 2; ++e )               // e 0 = left eye, 1 = right
		{
			if( s_stereoMode == 1 )                // SBS: left half = left eye
			{
				int hw = m_width / 2;
				glViewport( e * hw, 0, hw, m_height );
				glScissor ( e * hw, 0, hw, m_height );
			}
			else                                   // TB: top half = left eye
			{
				int hh = m_height / 2;
				glViewport( 0, e ? 0 : hh, m_width, hh );
				glScissor ( 0, e ? 0 : hh, m_width, hh );
			}
			s3->setEyeOffset( ( e ? 1.f : -1.f ) * 0.5f * s_stereoDepth );
			s3->draw();
		}
		s3->setEyeOffset( 0.f );
		glDisable( GL_SCISSOR_TEST );
		glViewport( 0, 0, m_width, m_height );
	};

	//Do the FBO Stuff
	glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboEffectTexture1 );

    //glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint, GL_TEXTURE_2D, m_texIDFBOEffectTexture1, 0);

	m_effectTextures[m_actEffectTexture]->enableShader();
	m_effectTextures[m_actEffectTexture]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
	m_effectTextures[m_actEffectTexture]->applyAudioFeatures( audioFx );
	if( m_trueStereoPacked )
		renderSceneStereo( m_effectTextures[m_actEffectTexture] );
	else
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
		if( m_trueStereoPacked )     // 3D<->3D fade: the incoming scene is
			renderSceneStereo( m_effectTextures[m_nextEffectTexture] );  // eye-packed too
		else
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
		// The true-stereo hold freezes combine switching: an eye-packed 3D
		// frame must not enter a combine cross-fade (the pending change fires
		// as soon as the hold lifts).
		if( !m_trueStereoHold
		    && (ts > m_timeInterpolationEffectCombine || (forcedC && ts > 0.6f)) )
		{
			m_forceCombineChange   = false;
			m_pendingCombineChange = true;
			m_pendingCombineForced = m_pendingCombineForced || forcedC;
		}

		// Beat-quantised, like the texture-effect change above (manual cuts
		// fire immediately here too).
		if( m_pendingCombineChange && !m_trueStereoHold )
		{
			m_pendingCombineAge += timeSinceLastFrameSec;
			if( m_pendingCombineForced || m_downbeatTick
			    || m_pendingCombineAge > 2.5f || m_gateSmooth < 0.25f )
			{
				bool forcedGo          = m_pendingCombineForced;
				m_pendingCombineChange = false;
				m_pendingCombineForced = false;
				m_pendingCombineAge    = 0.f;

				m_stateInterpolationEffectCombine = 1;

				// Roll a transition style for the combine blend as well.
				{
					int r = qrand() % 31;
					m_transStyleComb = (r <= 5) ? 0 : (r - 5);
				}

				unsigned int timeAct = m_effectCombines[m_actEffectCombine]->getTimeInterpolation();
				unsigned int timeNext = m_effectCombines[m_nextEffectCombine]->getTimeInterpolation();

				// Manual ('n') cut → short snappy cross-fade; natural change → config
				// time, or exactly 4 beats when the rhythm is confident (see the
				// texture-effect site above).
				{
					float cfgT = (float) (std::min( timeAct, timeNext)) / m_timingScale;
					if( !forcedGo && audio.rhythmStrength > 0.55f
					    && audio.estimatedBPM > 0.004f )
					{
						float fourBeats = 4.f * 60.f / (40.f + 160.f * audio.estimatedBPM);
						cfgT = fminf(fmaxf(fourBeats, 1.2f), cfgT);
					}
					// ARTICULATION: same phrasing rule as the texture site.
					cfgT *= 1.f - 0.35f * audio.logAttackTime;
					m_timeInterpolationEffectCombine = forcedGo ? 0.8f : cfgT;
				}

				m_effectCombines[m_nextEffectCombine]->startInterpolators();

				m_timeEffectCombine.start();
			}
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

			for( unsigned int i = 0; i < m_maxIterationsEffectSearch; i++ )
			{
				m_nextEffectCombine = qrand() % m_effectCombines.size();
				if( m_nextEffectCombine != m_actEffectCombine &&
			(( m_effectTextures[m_actEffectTexture]->getComplexity() +
			m_effectTextures[m_nextEffectTexture]->getComplexity() +
			m_effectCombines[m_actEffectCombine]->getComplexity() +
			m_effectCombines[m_nextEffectCombine]->getComplexity() ) < 20 )
			&& m_effectCombines[m_nextEffectCombine]->useShader()
			&& moodAccept( m_effectCombines[m_nextEffectCombine] )
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

	if( m_trueStereoNow )
	{
		// True stereo: the eye-packed 3D frame passes through UNTOUCHED (any
		// combine warp would fold content across the eye boundary).
		blitTexture( m_texIDFBOEffectTexture1 );
	}
	else if( m_trueStereoPacked && m_stereoMixProgId != 0 )
	{
		// Packed 3D<->3D cross-fade: plain per-pixel mix of the two
		// eye-packed frames — same endpoint weighting as every combine
		// style, but guaranteed warp-free.
		glUseProgram( m_stereoMixProgId );
		if( m_stereoMixTexAUni >= 0 ) glUniform1i( m_stereoMixTexAUni, 3 );
		if( m_stereoMixTexBUni >= 0 ) glUniform1i( m_stereoMixTexBUni, 4 );
		if( m_stereoMixResUni  >= 0 ) glUniform2f( m_stereoMixResUni,
		                                           (float)m_width, (float)m_height );
		if( m_stereoMixWUni    >= 0 ) glUniform1f( m_stereoMixWUni,
		                                           m_interpolationEffectTexture );
		drawWindow();
	}
	else
	{
		m_effectCombines[m_actEffectCombine]->enableShader();
		m_effectCombines[m_actEffectCombine]->setUniforms( m_globaltime, m_interpolationEffectTexture, 3, 4 );
		m_effectCombines[m_actEffectCombine]->applyAudioFeatures( audioFx );
		m_effectCombines[m_actEffectCombine]->draw();
	}


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

	// Styled combine-combine transition (0 = classic linear mix).
	{
		GLint locTS = glGetUniformLocation( m_sh_prog_id_combine, "transStyle" );
		if( locTS >= 0 ) glUniform1i( locTS, m_transStyleComb );
	}


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
		// Build-up tension: trails tighten as the music climbs toward the drop
		// (crisper, more nervous picture), then the drop's release lets them
		// bloom back to full length.
		decay *= 1.f - 0.45f * audioFx.buildUp * (1.f - audioFx.dropPulse);
		// ARTICULATION (the performance-cues mapping): staccato material
		// (sharp attacks, logAttackTime -> 1) crisps the picture with shorter
		// trails; legato swells keep the full flowing length.  The feature is
		// slow-moving, so this reads as an interpretation trait, not a pulse.
		decay *= 1.f - 0.30f * audio.logAttackTime;
		// SONG-END outro: as the track fades out the trails BLOOM — the last
		// notes linger visibly before the picture settles.
		decay = std::min( decay * (1.f + 0.40f * audioFx.fadeOut), 0.96f );

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
		// Echo-warp: the beat pumps the outward zoom, the rotation direction
		// swings slowly (sin of slow time -> smooth reversals, no snapping)
		// and echoes drift gently in hue.  All rates scaled by frame time.
		{
			float dtf  = timeSinceLastFrameSec;
			float zoom = 1.0f + (0.05f + 0.22f * m_audioBeatSmooth
			                     + 0.08f * audio.ambientFactor) * dtf;
			float rotA = 0.15f * sinf( m_globaltime * 0.02f ) * dtf;
			float hueD = 0.10f * dtf;
			// True stereo: the echo-warp would drag content across the eye
			// boundary of the packed frame — keep only the plain decay.
			if( m_trueStereoPacked ) { zoom = 1.f; rotA = 0.f; hueD = 0.f; }
			if( m_trailZoomUni >= 0 ) glUniform1f( m_trailZoomUni, zoom );
			if( m_trailRotUni  >= 0 ) glUniform1f( m_trailRotUni,  rotA );
			if( m_trailHueUni  >= 0 ) glUniform1f( m_trailHueUni,  hueD );
			// Depth-aware trails while a 3D scene is on screen (slewed so
			// cross-fades from/to 2D effects ease the behaviour in and out).
			{
				bool sceneUp = m_effectTextures[m_actEffectTexture]->is3D()
				            || ( m_stateInterpolationEffectTexture != 0
				                 && m_effectTextures[m_nextEffectTexture]->is3D() );
				m_trailDepth3D = slewToward( m_trailDepth3D,
				                             sceneUp ? 1.f : 0.f, 2.5f, dtWall );
				if( m_trailDepthUni >= 0 )
					glUniform1f( m_trailDepthUni, m_trailDepth3D );
			}
			// MilkDrop-style spatial warp field: the liquid feedback look.
			// Ripple rides the beat, the swirl direction swings very slowly,
			// the flow field breathes with the music; all phases are
			// integrated (no flicker), all amplitudes are per-frame (x dt).
			{
				m_warpRipplePhase += dtf * ( 2.0f + 5.0f * m_audioBeatSmooth );
				m_warpFlowPhase   += dtf * 0.55f;
				// Displacement VELOCITIES (uv/s resp. rad/s), applied per
				// frame; they accumulate through the feedback loop.
				float rip  = ( 0.05f * m_audioBeatSmooth
				             + 0.10f * audioFx.dropPulse ) * dtf;
				float swl  = 0.25f * sinf( m_globaltime * 0.013f )
				           * ( 0.4f + 0.6f * audio.ambientFactor ) * dtf;
				float flw  = ( 0.02f + 0.05f * audio.ambientFactor
				             + 0.04f * audioFx.swell ) * dtf;
				// Scale with the trails knob (no trails -> no warp) and gate
				// out of the packed true-stereo frames entirely.
				float g = s_trailAmount * audio.musicPresence;
				if( m_trueStereoPacked ) g = 0.f;
				if( m_trailRipAmpUni  >= 0 ) glUniform1f( m_trailRipAmpUni,  rip * g );
				if( m_trailRipPhUni   >= 0 ) glUniform1f( m_trailRipPhUni,   m_warpRipplePhase );
				if( m_trailSwirlUni   >= 0 ) glUniform1f( m_trailSwirlUni,   swl * g );
				if( m_trailFlowAmpUni >= 0 ) glUniform1f( m_trailFlowAmpUni, flw * g );
				if( m_trailFlowPhUni  >= 0 ) glUniform1f( m_trailFlowPhUni,  m_warpFlowPhase );
			}
		}
		drawWindow();

		presentSource = m_texTrail[cur];
		m_trailIdx    = prev;   // swap for next frame
	}

	// Spout output (-o): publish the displayed frame for OBS / Resolume etc.
	// (Needs the GL context, which is current here; texture-share via DX interop.)
	if( s_spoutEnabled )
	{
		if( !m_spoutStarted )
			m_spoutStarted = spoutOutInit( "Kaleidoscope" );
		spoutOutSend( presentSource, m_width, m_height );
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

		// ---- Two-pass Gaussian bloom (quarter res) ----
		// Pass 1 extracts the brights from the fresh frame + blurs horizontally
		// while downsampling; pass 2 blurs vertically.  Present adds the result.
		if( m_bloomReady )
		{
			glUseProgram( m_bloomProgId );
			glActiveTexture( GL_TEXTURE0 );

			glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboBloom[0] );
			glViewport( 0, 0, m_bloomW, m_bloomH );
			glBindTexture( GL_TEXTURE_2D, presentSource );
			glUniform1i( m_bloomTexUni, 0 );
			if( m_bloomResUni    >= 0 ) glUniform2f( m_bloomResUni, (float)m_bloomW, (float)m_bloomH );
			if( m_bloomDirUni    >= 0 ) glUniform2f( m_bloomDirUni, 1.f, 0.f );
			if( m_bloomThreshUni >= 0 ) glUniform1f( m_bloomThreshUni, 0.70f );
			drawWindow();

			glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_fboBloom[1] );
			glBindTexture( GL_TEXTURE_2D, m_texBloom[0] );
			if( m_bloomDirUni    >= 0 ) glUniform2f( m_bloomDirUni, 0.f, 1.f );
			if( m_bloomThreshUni >= 0 ) glUniform1f( m_bloomThreshUni, 0.f );
			drawWindow();
		}

		// The present pass is the ONLY one at full display resolution — it upscales
		// the render-resolution result to the window.
		glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, m_defaultFBO );
		glViewport( 0, 0, m_displayW, m_displayH );
		glUseProgram( m_presentProgId );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, presentSource );
		glUniform1i( m_presentTexUni, 0 );
		if( m_bloomReady && m_presentBloomTexUni >= 0 )
		{
			glActiveTexture( GL_TEXTURE1 );
			glBindTexture( GL_TEXTURE_2D, m_texBloom[1] );
			glUniform1i( m_presentBloomTexUni, 1 );
			glActiveTexture( GL_TEXTURE0 );
		}
		if( m_presentUseBloomUni >= 0 ) glUniform1f( m_presentUseBloomUni, m_bloomReady ? 1.f : 0.f );
		if( m_presentSwellUni    >= 0 ) glUniform1f( m_presentSwellUni,    audioFx.swell );
		if( m_presentBarPhaseUni >= 0 ) glUniform1f( m_presentBarPhaseUni, audioFx.barPhase );
		if( m_presentCamZoomUni  >= 0 ) glUniform1f( m_presentCamZoomUni,  m_camZoom );
		if( m_presentCamRotUni   >= 0 ) glUniform1f( m_presentCamRotUni,   m_camRot );
		if( m_presentCamOffUni   >= 0 ) glUniform2f( m_presentCamOffUni,   m_camOffX, m_camOffY );
		if( m_presentStereoModeUni  >= 0 ) glUniform1i( m_presentStereoModeUni,  s_stereoMode );
		if( m_presentStereoDepthUni >= 0 ) glUniform1f( m_presentStereoDepthUni, s_stereoDepth );
		if( m_presentStereoSrcUni   >= 0 ) glUniform1i( m_presentStereoSrcUni,   m_trueStereoPacked ? 1 : 0 );
		// Track-title reveal (phase 0..1 while active; 2 = off).
		if( m_presentTitlePhaseUni >= 0 )
		{
			const float kTitleDur = 8.f;
			float ph = ( m_titleTex != 0 && m_titleAge < kTitleDur )
			         ? ( m_titleAge / kTitleDur ) : 2.f;
			glUniform1f( m_presentTitlePhaseUni, ph );
			if( ph < 1.f && m_presentTitleTexUni >= 0 )
			{
				glActiveTexture( GL_TEXTURE2 );
				glBindTexture( GL_TEXTURE_2D, m_titleTex );
				glUniform1i( m_presentTitleTexUni, 2 );
				glActiveTexture( GL_TEXTURE0 );
				if( m_presentTitleAspectUni >= 0 )
					glUniform1f( m_presentTitleAspectUni, m_titleAspect );
				if( m_presentTitleStyleUni >= 0 )
					glUniform1i( m_presentTitleStyleUni, m_titleStyle );
				if( m_presentTitleSeedUni >= 0 )
					glUniform1f( m_presentTitleSeedUni, m_titleSeed );
			}
		}
		if( m_presentResUni   >= 0 ) glUniform2f( m_presentResUni, (float)m_displayW, (float)m_displayH );
		// VJ blackout ('b'): a slewed multiplier on the present brightness
		// scale — window, Spout output and recordings all fade together.
		{
			float blackTarget = s_blackout ? 1.f : 0.f;
			float step = dtWall * 3.0f;               // ~0.35 s fade
			if( step > 1.f ) step = 1.f;
			m_blackSmooth += ( blackTarget - m_blackSmooth ) * step;
		}
		// The DJ-stop also dims the held picture slightly (sells the "gasp");
		// a detected FADE-OUT dims a touch too (the room lights come down
		// with the song).
		if( m_presentScaleUni >= 0 )
			glUniform1f( m_presentScaleUni,
			             scale * (1.f - m_blackSmooth) * (1.f - 0.25f * m_breakSmooth)
			                   * (1.f - 0.20f * m_fadeOutEnv) );
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
		// CAS sharpening compensates the upsample when renderScale < 1.
		{
			GLint locSharp = glGetUniformLocation( m_presentProgId, "sharpen" );
			GLint locTexel = glGetUniformLocation( m_presentProgId, "srcTexel" );
			float amt = (s_renderScale < 0.999f)
			          ? clampParam( (1.f - s_renderScale) * 0.9f, 0.f, 0.45f ) : 0.f;
			if( locSharp >= 0 ) glUniform1f( locSharp, amt );
			if( locTexel >= 0 ) glUniform2f( locTexel, 1.f / float(m_width),
			                                            1.f / float(m_height) );
		}
		if( m_presentTimeUni     >= 0 ) glUniform1f( m_presentTimeUni,     m_globaltime );
		if( m_presentChaseUni    >= 0 ) glUniform1f( m_presentChaseUni,    m_chasePhase );
		if( m_presentLampsUni    >= 0 ) glUniform1f( m_presentLampsUni,    s_lightShow );
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
// Fixed-function copy of a texture into the currently bound FBO.  Used by the
// true-stereo path: the eye-packed 3D frame replaces the combine output 1:1.
void FilterShader::blitTexture( GLuint tex )
{
	glUseProgram( 0 );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, tex );
	glEnable( GL_TEXTURE_2D );
	glMatrixMode( GL_PROJECTION );
	glLoadIdentity();
	gluOrtho2D( 0, m_width, 0, m_height );
	glMatrixMode( GL_MODELVIEW );
	glLoadIdentity();
	glColor3f( 1.f, 1.f, 1.f );
	glBegin( GL_QUADS );
	glTexCoord2f( 0, 0 ); glVertex2f( 0.f, 0.f );
	glTexCoord2f( 1, 0 ); glVertex2f( (float)m_width, 0.f );
	glTexCoord2f( 1, 1 ); glVertex2f( (float)m_width, (float)m_height );
	glTexCoord2f( 0, 1 ); glVertex2f( 0.f, (float)m_height );
	glEnd();
	glDisable( GL_TEXTURE_2D );
}

void FilterShader::initFBO(GLuint &fboEffect, GLuint &texIDEffectTexture, GLuint *depthRb)
{
	// create FBO (off-screen framebuffer) — reuse the id if it already exists
	// (re-entering this path must re-attach, not leak a fresh FBO)
    if( fboEffect == 0 )
        glGenFramebuffersEXT( 1, &fboEffect );

    // bind offscreen framebuffer (that is, skip the window-specific render target)
    glBindFramebufferEXT( GL_FRAMEBUFFER_EXT, fboEffect );

    // check if something went completely wrong
    checkGLErrors("initFBO()");
		// attach texture to FBO
    glFramebufferTexture2DEXT( GL_FRAMEBUFFER_EXT, m_attachmentpoint,
							   GL_TEXTURE_2D, texIDEffectTexture, 0);
	checkGLErrors("initFBO()");

	// Optional depth renderbuffer (the 3D scene effects need depth testing;
	// the plain fullscreen-quad effects ignore it).  (Re)created at the
	// current size on every (re)init, so window resizes stay correct.
	if( depthRb )
	{
		if( *depthRb == 0 )
			glGenRenderbuffersEXT( 1, depthRb );
		glBindRenderbufferEXT( GL_RENDERBUFFER_EXT, *depthRb );
		glRenderbufferStorageEXT( GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT,
		                          m_width, m_height );
		glFramebufferRenderbufferEXT( GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT,
		                              GL_RENDERBUFFER_EXT, *depthRb );
		glBindRenderbufferEXT( GL_RENDERBUFFER_EXT, 0 );
	}

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

    if( texID == 0 )                 // reuse on re-entry (no leak)
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

    if( m_actTex  == 0 ) glGenTextures( 1, &m_actTex );   // reuse on re-entry
    if( m_nextTex == 0 ) glGenTextures( 1, &m_nextTex );
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
	m_sh_prog_id_combine = setShaders( "standard.vert", "..\\Combine\\CombinePlain.frag" );
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


// Hot-reload (dev aid): recompile every program using the given fragment file.
void FilterShader::reloadFragment( const QString &bareName )
{
	auto matches = [&bareName]( EffectShader *s ) {
		QString f = QString::fromLocal8Bit( s->fragmentName() );
		f.replace( '\\', '/' );
		int i = f.lastIndexOf( '/' );
		return ((i >= 0) ? f.mid( i + 1 ) : f)
		       .compare( bareName, Qt::CaseInsensitive ) == 0;
	};
	int n = 0;
	for( EffectShader *s : m_effectTextures )
		if( matches( s ) ) { s->reloadShader(); ++n; }
	for( EffectShader *s : m_effectCombines )
		if( matches( s ) ) { s->reloadShader(); ++n; }
	if( n )
		fprintf( stderr, "HOT-RELOAD: %s (%d program%s)\n",
		         qPrintable( bareName ), n, (n == 1) ? "" : "s" );
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

// Tiny-thumbnail stats for the mood-matched image choice: mean brightness and
// mean colourfulness (saturation x value), from a fast 32x32 scaled decode.
QPair<float,float> ImageLoader::imageStats( const QString &path )
{
	QImageReader r( path );
	r.setScaledSize( QSize( 32, 32 ) );
	QImage im = r.read();
	if( im.isNull() )
		return qMakePair( 0.5f, 0.5f );
	double b = 0.0, c = 0.0;
	int n = 0;
	for( int y = 0; y < im.height(); y += 2 )
		for( int x = 0; x < im.width(); x += 2 )
		{
			QColor col = im.pixelColor( x, y );
			b += col.valueF();
			c += col.saturationF() * col.valueF();
			++n;
		}
	if( n == 0 ) return qMakePair( 0.5f, 0.5f );
	return qMakePair( float(b / n), float(c / n) );
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

			// MOOD-MATCHED image choice: probe a few random candidates and take
			// the one whose brightness/colourfulness best fits the live mood
			// (dark valence -> darker photos, energetic music -> more colourful,
			// ambient pulls slightly darker).  Stats come from a tiny fast-
			// scaled decode (JPEG DCT downscale) and are cached per path.
			const int n = m_shader->m_imageList.size();
			float tb = 0.25f + 0.50f * m_shader->m_moodValence.load();
			tb *= 1.f - 0.25f * m_shader->m_moodAmbient.load();
			float ts = 0.20f + 0.50f * m_shader->m_moodArousal.load();

			int   bestIdx   = qrand() % n;
			float bestScore = -1e9f;
			for( int k = 0; k < 5; ++k )
			{
				int idx = qrand() % n;
				const QString &path = m_shader->m_imageList[idx];
				QPair<float,float> st;
				auto found = m_stats.find( path );
				if( found != m_stats.end() )
					st = found.value();
				else
				{
					st = imageStats( path );
					m_stats.insert( path, st );
				}
				float score = -( fabsf(st.first - tb) + 0.7f * fabsf(st.second - ts) );
				if( score > bestScore ) { bestScore = score; bestIdx = idx; }
			}
			m_shader->m_imageListIterator = m_shader->m_imageList.begin() + bestIdx;

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
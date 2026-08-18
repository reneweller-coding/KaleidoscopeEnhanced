#include <float.h>
#include <math.h>
#include <algorithm>

#include "shader_setup.h"
#include "filterShader.h"
#include "SpoutOut.h"
#include "SpoutIn.h"
#include "VideoIn.h"
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
QString FilterShader::s_videoPath;                // native video input (CLI -v)

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
, m_attachmentpoint(GL_COLOR_ATTACHMENT0)
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
//, m_effectTextureMinTimeInterpolation( 10 )
//, m_effectTextureMaxTimeInterpolation( 20 )
//, m_effectCombineMinTimeInterpolation( 12 )
//, m_effectCombineMaxTimeInterpolation( 27 )
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

	// Initiale Effekt-/Combine-Wahl + Szenen-Uhren: SceneScheduler.
	m_scheduler.attach( &m_effectTextures, &m_effectCombines );
	m_scheduler.setTasteCallback( [this]( const char *f ){ return tasteFor( f ); } );
	m_scheduler.reset();

	//Start the timers
	m_time.start();
	m_timeTexture.start();

	
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
		out += "TEX   " + base(m_effectTextures[m_scheduler.actTexture()]->fragmentName());
		if (m_scheduler.texState() != 0)
			out += QString("   → %1  (%2%)")
			       .arg(base(m_effectTextures[m_scheduler.nextTexture()]->fragmentName()))
			       .arg(int((1.0f - m_scheduler.texInterp()) * 100.0f + 0.5f));
	}
	out += "\n";
	if (!m_effectCombines.empty())
	{
		out += "COMB  " + base(m_effectCombines[m_scheduler.actCombine()]->fragmentName());
		if (m_scheduler.combState() != 0)
			out += QString("   → %1  (%2%)")
			       .arg(base(m_effectCombines[m_scheduler.nextCombine()]->fragmentName()))
			       .arg(int((1.0f - m_scheduler.combInterp()) * 100.0f + 0.5f));
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














// Destructor
FilterShader::~FilterShader()
{
	cleanTextures();
	cleanShaderPrograms();
	delete m_mesh;
}

void FilterShader::cleanTextures()
{
	glDeleteFramebuffers( 1, &m_fboEffectTexture1 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboEffectTexture2 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboEffectCombine1 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboEffectCombine2 );		// clean up framebuffer object
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
	initFBO(  m_fboEffectTexture1, m_texIDFBOEffectTexture1, &m_depthTexEffect1 );
	initFBO(  m_fboEffectTexture2, m_texIDFBOEffectTexture2, &m_depthTexEffect2 );
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

	// The 3D-scene DEPTH textures must track the colour size, or the effect
	// FBOs go INCOMPLETE_DIMENSIONS after any resize.
	for( GLuint dt : { m_depthTexEffect1, m_depthTexEffect2 } )
	{
		if( !dt ) continue;
		glBindTexture( GL_TEXTURE_2D, dt );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, m_width, m_height,
		              0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );
	}
	glBindTexture( GL_TEXTURE_2D, 0 );

	// Final-(Present)- und Bloom-Texturen zieht der PresentPass nach.
	m_present.resize( m_width, m_height, m_texInternalFormat, m_texFormat, m_texType );

	// Resize the feedback/trail ping-pong textures.
	for( int i = 0; i < 2; ++i )
		if( m_texTrail[i] != 0 )
		{
			glBindTexture( GL_TEXTURE_2D, m_texTrail[i] );
			glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0,
			              m_texFormat, m_texType, NULL );
			glGenerateMipmap( GL_TEXTURE_2D );
		}


	glBindTexture( GL_TEXTURE_2D, 0 );
	checkGLErrors("resize()");
}



// Create the final FBO + present shader.  If anything fails, m_safetyReady stays
// false and paint() falls back to drawing the combine result straight to screen.
void FilterShader::setupSafety()
{
	// Finaler FBO, Present-Programm und Bloom: alles im PresentPass.
	m_present.setup( m_width, m_height, m_texInternalFormat, m_texFormat, m_texType );

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
		glGenerateMipmap( GL_TEXTURE_2D );
		if( m_fboTrail[i] == 0 ) glGenFramebuffers( 1, &m_fboTrail[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboTrail[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint,
		                           GL_TEXTURE_2D, m_texTrail[i], 0 );
		if( !checkFramebufferStatus() ) trailOk = false;
	}
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );
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
	m_feedbackReady = m_present.ready() && trailOk && (m_trailProgId != 0)
	                && (m_trailCurUni >= 0) && (m_trailPrevUni >= 0);

	checkGLErrors("setupSafety()");

	// GPU-/Host-Simulationen (RD, Fluid, Smoke3D, Physarum) - siehe GpuSims.
	m_sims.setupAll();
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
	// 2x Auflösung ggü. dem ursprünglichen 1024x256 (gleiches Seitenverhältnis
	// 4:1, alle Maße/Schriftgrade proportional mitskaliert): mehrere Einflug-
	// Stile vergrößern die Textur beim Reveal bis auf das ~3.5-fache (z.B.
	// "zoom-through"), und der gemeinsame Ausklang aller Stile ("wächst sanft
	// dem Betrachter entgegen") vergrößert zusätzlich bis 1.55x - bei der alten
	// Auflösung wurde dabei das Texel-Raster sichtbar (verpixelter Text, je
	// nach Stil unterschiedlich stark, wegen des gemeinsamen Ausklangs aber
	// IMMER auch am Ende jedes Reveals). Kostet nichts an Laufzeit: wird nur
	// einmal pro Trackwechsel gerendert.
	const float S = 2.0f;
	const int W = int(1024 * S), H = int(256 * S);
	QImage img( W, H, QImage::Format_ARGB32 );
	img.fill( Qt::transparent );
	QPainter p( &img );
	p.setRenderHint( QPainter::Antialiasing );
	p.setRenderHint( QPainter::TextAntialiasing );

	QFont ft( "Segoe UI", int(52 * S), QFont::Bold );
	QFont fa( "Segoe UI", int(26 * S) );
	QString t = QFontMetrics( ft ).elidedText( title,  Qt::ElideRight, W - int(80 * S) );
	QString a = QFontMetrics( fa ).elidedText( artist, Qt::ElideRight, W - int(80 * S) );

	const QRect rT( int(40 * S), int(24 * S), W - int(80 * S), int(132 * S) );
	const QRect rA( int(40 * S), int(156 * S), W - int(80 * S), int(68 * S) );
	p.setFont( ft );
	p.setPen( QColor( 0, 0, 0, 150 ) );
	for( int dy = -2; dy <= 2; ++dy )
		for( int dx = -2; dx <= 2; ++dx )
			if( dx != 0 || dy != 0 )
				p.drawText( rT.translated( int(dx * S), int(dy * S) ),
				            Qt::AlignHCenter | Qt::AlignVCenter, t );
	p.setPen( QColor( 255, 255, 255, 235 ) );
	p.drawText( rT, Qt::AlignHCenter | Qt::AlignVCenter, t );
	if( !a.isEmpty() )
	{
		p.setFont( fa );
		p.setPen( QColor( 0, 0, 0, 140 ) );
		for( int dy = -1; dy <= 1; ++dy )
			for( int dx = -1; dx <= 1; ++dx )
				if( dx != 0 || dy != 0 )
					p.drawText( rA.translated( int(dx * S), int(dy * S) ),
					            Qt::AlignHCenter | Qt::AlignVCenter, a );
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
	if( m_scheduler.actTexture() < m_effectTextures.size() &&
	    m_scheduler.actElapsedSec() < 10.f )
		bumpTaste( m_effectTextures[m_scheduler.actTexture()]->fragmentName(), 0.8f );
	m_scheduler.requestChange( true );
}

// Validation aid: compile EVERYTHING now (lazy compilation would otherwise
// only exercise shaders that actually come on screen).
void FilterShader::compileAllShaders()
{
	for( EffectShader *s : m_effectTextures )
	{
		fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
		s->ensureCompiled();
	}
	for( EffectShader *s : m_effectCombines )
	{
		fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
		s->ensureCompiled();
	}
	fprintf( stderr, "COMPILEALL done (%d textures, %d combines)\n",
	         (int)m_effectTextures.size(), (int)m_effectCombines.size() );
}

// Remote scene browser: list the preset's texture shaders (file basenames).
QStringList FilterShader::sceneNames() const
{
	QStringList out;
	for( EffectShader *s : m_effectTextures )
	{
		QString n = QString::fromLocal8Bit( s->fragmentName() );
		int cut = std::max( n.lastIndexOf( QChar('\\') ), n.lastIndexOf( QChar('/') ) );
		n = n.mid( cut + 1 );
		if( n.endsWith( ".frag" ) ) n.chop( 5 );
		out << n;
	}
	return out;
}

// Remote scene browser: jump DIRECTLY to scene idx (same instant path as a
// manual 'n' cut, but with a chosen target instead of a random roll).
void FilterShader::forceScene( int idx )
{
	if( idx < 0 || idx >= (int)m_effectTextures.size() )
		return;
	if( s_pinned || s_freeze )
		return;                       // same handbrakes as requestSceneChange
	m_scheduler.forceScene( idx );
}

// Key 'f': the user LIKES what is on screen — persistent selection bonus.
void FilterShader::favoriteCurrentEffect()
{
	if( m_scheduler.actTexture() < m_effectTextures.size() )
		bumpTaste( m_effectTextures[m_scheduler.actTexture()]->fragmentName(), 1.25f );
}


// Dev-Haken KALEIDO_FORCE_DROP (Injektion in paint()): file-static, weil der
// Zaehler an ZWEI Verbrauchsstellen in paint() addiert wird.
static int   s_fakeDrops   = 0;
static float s_fakePulse   = 0.f;
static float s_forceDropAt = -2.f;

void FilterShader::paint(const float *rotMatrix, float tx, float ty, float tz,
                         const AudioFeatures &audio)
{
	m_scheduler.setMood( audio.arousal, audio.valence, audio.ambientFactor );
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
	else if( !s_videoPath.isEmpty() )
	{
		// Same slot, same consequences: while a frame is available it replaces
		// both photo slots, so cross-fades collapse on the image and every
		// effect folds the moving picture instead of a still.
		videoInInit( s_videoPath.toLocal8Bit().constData() );        // idempotent
		unsigned int lw = 0, lh = 0;
		m_liveTex = videoInFrame( &lw, &lh );
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
	glBindFramebuffer( GL_FRAMEBUFFER, m_fbo );
	//glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	glViewport( 0, 0, m_width, m_height );
	glUseProgram( 0 );
	drawScene( rotMatrix, tx, ty, tz );
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
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
		m_scheduler.rearmEffectClocks();
		m_timeTexture.restart();
	}
	// VJ PIN ('u'): keep the current effect/combine — re-arm only their
	// clocks (images keep rotating); forced cuts are suppressed below.
	else if( s_pinned )
		m_scheduler.rearmEffectClocks();

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
		m_present.setTitleImage( gl.constBits(), gl.width(), gl.height() );
		m_titlePending = QImage();

		// Roll a reveal STYLE that fits the music playing right now.  Each
		// mood category has its own pool of matching styles (calm -> soft
		// dissolves and drifts, aggressive -> glitch/slam/stutter, bright ->
		// light sweeps and sparkle, dark -> smoke/shadow), and the pick
		// within the pool is random so repeats stay varied.
		// KALEIDO_TITLE_STYLE=<n> forces one style (tuning aid).
		{
			static const int calmPool[]   = { 0, 1, 2, 4, 5, 9, 17, 20, 23, 24, 26 };
			static const int aggroPool[]  = { 7, 10, 11, 12, 13, 14, 21, 22, 25, 27, 29 };
			static const int brightPool[] = { 3, 6, 8, 15, 18, 19, 24, 25, 28, 29 };
			static const int darkPool[]   = { 0, 2, 5, 16, 17, 20, 26, 27, 28 };
			const int *pool; int n;
			if( audio.ambientFactor > 0.55f || audio.arousal < 0.35f )
				{ pool = calmPool;   n = 11; }
			else if( audio.arousal > 0.62f && audio.valence < 0.58f )
				{ pool = aggroPool;  n = 11; }
			else if( audio.valence > 0.55f )
				{ pool = brightPool; n = 10; }
			else
				{ pool = darkPool;   n = 9; }
			int style = pool[ qrand() % n ];
			QByteArray forced = qgetenv( "KALEIDO_TITLE_STYLE" );
			if( !forced.isEmpty() )
				style = forced.toInt();
			m_present.setTitleStyle( style, float(qrand()) / float(RAND_MAX) );
			fprintf( stderr, "Title reveal: style %d\n", style );
		}
	}
	else
		m_present.advanceTitle( dtWall );


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

        // VISUAL spectrum smoothing (anti-jitter): the analyzer's spectrum is
        // tuned for DETECTION and still flutters frame-to-frame — driving
        // GEOMETRY with it makes towers/surfaces tremble nervously (the
        // "zittern" feedback).  Meter ballistics fix it: near-instant attack
        // keeps the punch, a slow release lets bars fall gracefully.
        for (int i = 0; i < AudioFeatures::kSpectrumBands; ++i)
        {
            float v = audio.spectrum[i];
            if (v >= m_specVis[i])
                m_specVis[i] += (v - m_specVis[i]) * std::min(1.f, dt * 22.f);
            else
                m_specVis[i] += (v - m_specVis[i]) * std::min(1.f, dt * 3.2f);
            audioFx.spectrum[i] = m_specVis[i];
        }

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
        audioFx.transStyle    = m_scheduler.transStyleTex();
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
        audioFx.ssmHead       = m_sims.ssmHeadNorm();
        audioFx.ssmFill       = m_sims.ssmFillNorm();
        // Scrolling-spectrogram ring bookkeeping (kontinuierlicher Kopf mit
        // Sub-Zeilen-Anteil - Details in GpuSims::spectroHeadNorm).
        audioFx.spectroHead   = m_sims.spectroHeadNorm();
        audioFx.spectroFill   = m_sims.spectroFillNorm();
        // The DJ-stop slam-back rides the same "hit" channel as a drop
        // (camera punch + shake + the shaders' audioDrop uniform).
        audioFx.dropPulse     = std::max( audio.dropPulse, audio.breakSlam ) * gate;

        // Dev-Haken KALEIDO_FORCE_DROP=<sek>: injiziert einmalig einen
        // synthetischen Drop (Zaehler + Puls) zur angegebenen globalen Zeit -
        // macht die ganze Drop-Kette (Schnitt/Shatter, Rewind-Race, Streaks)
        // deterministisch probbar, ohne den Detektor treffen zu muessen.
        if( s_forceDropAt < -1.f )
        {
            const char *fd = getenv( "KALEIDO_FORCE_DROP" );
            s_forceDropAt = fd ? (float)atof( fd ) : -1.f;
        }
        if( s_forceDropAt >= 0.f && m_globaltime >= s_forceDropAt )
        {
            ++s_fakeDrops;
            s_fakePulse   = 1.f;
            s_forceDropAt = -1.f;
            fprintf( stderr, "FORCED DROP (t=%.1fs)\n", m_globaltime );
        }
        s_fakePulse *= expf( -dt / 0.5f );
        audioFx.dropPulse = std::max( audioFx.dropPulse, s_fakePulse );

        // ---- Virtual camera (global "Regie" layer, applied in the present
        // pass): micro drift keeps every effect subtly "filmed"; the downbeat
        // punches in and releases; the bar rolls the frame gently; a build-up
        // slowly tightens the shot; kicks add a tiny shake and a DROP hits
        // hard.  All terms are either slew-limited envelopes or fixed-
        // frequency oscillations — no phase remapping, no flicker.
        {
            // Downbeat-Punch UND Kick-Shake gedaempft (User-Feedback: die
            // Beat-Reaktion, insbesondere das Pulsieren, war zu praesent) -
            // der Drop-Hit (1.1*dropPulse weiter unten, 0.010*dropPulse im
            // Shake) bleibt bewusst kraeftig, das ist der dramaturgische
            // Moment; nur das PRO-BEAT-Dauerpumpen wird leiser.
            if( m_downbeatTick )
                m_camPunch = std::max( m_camPunch, 0.13f + 0.16f * m_downbeatSmooth );
            m_camPunch *= expf( -dt / 0.35f );
            float punch = m_camPunch + 1.1f * audioFx.dropPulse;
            float zoom  = 1.f + 0.045f * audioFx.buildUp * audioFx.buildUp
                              + 0.055f * punch;
            float sway  = 0.010f * sinf( 6.2831853f * audioFx.barPhase )
                        * audio.rhythmStrength * gate;
            float shakeAmp = 0.0022f * m_kickSmooth * gate
                           + 0.010f  * audioFx.dropPulse;
            // Gate-Weave: das feine 24-fps-Zittern einer Filmkopie im
            // Projektor - diskrete, winzige Versaetze pro "Filmbild"
            // (kein Audio-Faktor auf absoluter Zeit, nur Wandzeit-Hash).
            float film = floorf( m_globaltime * 24.f );
            float wvx  = ( sinf( film * 12.9898f ) * 43758.5453f );
            wvx = ( wvx - floorf( wvx ) - 0.5f ) * 0.0012f;
            float wvy  = ( sinf( film * 78.2330f ) * 12543.8530f );
            wvy = ( wvy - floorf( wvy ) - 0.5f ) * 0.0012f;
            float ox = 0.0030f * sinf( m_globaltime * 0.23f ) + wvx
                     + shakeAmp * sinf( m_globaltime * 39.7f );
            float oy = 0.0030f * cosf( m_globaltime * 0.17f ) + wvy
                     + shakeAmp * cosf( m_globaltime * 31.3f );
            // The zoom must always pay for the offset + rotation so no edge
            // ever samples outside the frame.  Die 2.5D-Parallaxe verschiebt
            // nahe Strukturen bis 1.8x staerker als den Frame selbst - der
            // Deckungs-Faktor waechst mit (Vorframe-Wert des Slews reicht).
            float need = ( fabsf(ox) + fabsf(oy) ) * ( 1.f + 1.8f * m_trailDepth3D )
                       + 0.62f * fabsf(sway);
            zoom = std::max( zoom, 1.f + 2.4f * need );
            m_camZoom = zoom; m_camRot = sway;
            m_camOffX = ox;   m_camOffY = oy;
        }

        // ---- Zeit-Regie: Drop-Rewind, Break-Scrub, Zeitecho, Atem-anhalten --
        {
            // Drop-Rewind-Race: auf ~40% der Drops springt die Anzeige 1.6 s
            // in die Vergangenheit und holt in ~0.5 s sichtbar auf - der
            // Tape-Catch-up landet genau im Drop-Hit.
            const int dropCountNow = audio.dropCount + s_fakeDrops;
            if( m_lastDropSeen < 0 )
                m_lastDropSeen = dropCountNow;
            if( dropCountNow > m_lastDropSeen )
            {
                m_lastDropSeen = dropCountNow;
                if( gate > 0.5f && ( rand() % 100 ) < 40 )
                {
                    m_rewindBack = 1.6f;
                    m_rewindRace = true;
                }
            }
            // DJ-Stop: solange die Musik den Atem anhaelt, scrubbt das Bild
            // rueckwaerts (max ~2.8 s Ring-Tiefe); der Slam-back schnappt es
            // mit hoher Rate zurueck auf live.
            if( audio.breakHold > 0.5f && !m_rewindRace )
                m_rewindBack = std::min( m_rewindBack + 1.5f * dt, 2.8f );
            else if( m_rewindBack > 0.f )
            {
                float rate = m_rewindRace ? 3.2f : 6.0f;
                m_rewindBack -= rate * dt;
                if( m_rewindBack <= 0.f ) { m_rewindBack = 0.f; m_rewindRace = false; }
            }
            // Sichtbarkeit schnell, aber nicht hart schalten (12/s Slew);
            // das ENDE des Race bleibt ein knackiger Schnitt zurueck auf live.
            float rmTarget = ( m_rewindBack > 0.02f ) ? 1.f : 0.f;
            m_rewindMixSm = slewToward( m_rewindMixSm, rmTarget, 12.f, dt );

            // Atem-anhalten: erst die obere Haelfte des Build-ups zaehlt -
            // ein normaler Groove soll das Bild nicht staendig entsaettigen.
            float bTarget = std::max( 0.f, std::min( 1.f,
                                ( audio.buildUp - 0.5f ) * 2.2f ) ) * gate;
            m_breathSm = slewToward( m_breathSm, bTarget, 2.5f, dt );

            // CinemaScope-Letterbox: die Balken KRIECHEN im Build-up herein
            // (0.8/s - man merkt erst spaet, dass das Bild enger wird) und
            // reissen auf den Drop schlagartig auf (12/s).
            {
                float lbRate = ( audioFx.dropPulse > 0.4f ) ? 12.f
                             : ( bTarget > m_letterSm ? 0.8f : 2.0f );
                m_letterSm = slewToward( m_letterSm, bTarget, lbRate, dt );
            }

            // Bass-Schockwelle: auf jeden kraeftigen Kick startet ein
            // Verzerrungsring im Zentrum (klein), auf einen Drop ein grosser.
            // Reine Verschiebung, keine Helligkeit - photosensitiv unkritisch.
            {
                bool kickEdge = ( m_kickSmooth > 0.55f && m_prevShockKick <= 0.55f );
                bool dropEdge = ( audioFx.dropPulse > 0.85f && m_prevShockDrop <= 0.85f );
                m_prevShockKick = m_kickSmooth;
                m_prevShockDrop = audioFx.dropPulse;
                if( dropEdge )
                    { m_shockR = 0.f; m_shockAmp = 0.030f; }
                else if( kickEdge && gate > 0.5f )
                    { m_shockR = 0.f; m_shockAmp = std::max( m_shockAmp, 0.011f ); }
                m_shockR   += dt * 1.7f;
                m_shockAmp *= expf( -dt / 0.30f );
            }

            // Dev-Haken KALEIDO_REGIE_TEST: festes 12-s-Muster (3 s Echo,
            // 3 s Breath, 2 s Rewind-Scrub, Rest live) fuer deterministische
            // Frame-Proben der Zeit-Regie ohne echte Drops/Build-ups.
            static int s_regieTest = -1;
            if( s_regieTest < 0 )
                s_regieTest = getenv( "KALEIDO_REGIE_TEST" ) ? 1 : 0;
            if( s_regieTest )
            {
                float ph = fmodf( m_globaltime, 12.f );
                m_echoOverride = ( ph < 3.f ) ? 0.40f : 0.f;
                m_breathSm   = ( ph >= 3.f && ph < 6.f ) ? 1.f : 0.f;
                m_letterSm   = m_breathSm;             // Balken folgen dem Breath
                if( ph >= 6.0f && ph < 6.4f && m_shockR > 1.f )
                    { m_shockR = 0.f; m_shockAmp = 0.03f; }   // 1 Welle pro Zyklus
                if( ph >= 7.f && ph < 9.f )
                    { m_rewindBack = 1.5f; m_rewindMixSm = 1.f; }
                else if( ph >= 9.f && ph < 9.5f )
                    { m_rewindBack = 0.f; m_rewindMixSm = 0.f; }
            }
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
    
/*********************** Szenen-Wahl: SceneScheduler ***********************/

	// Trigger (Novelty/Section/Drop, Pin) + Effekt-Zustandsmaschine.  Der
	// Combine-Teil (tickCombine) laeuft weiter NACH den Effekt-Passes, weil
	// erst dort m_trueStereoHold entsteht.
	SceneScheduler::Tick schedTick;
	schedTick.dt             = timeSinceLastFrameSec;
	schedTick.downbeatTick   = m_downbeatTick;
	schedTick.gateSmooth     = m_gateSmooth;
	schedTick.timingScale    = m_timingScale;
	schedTick.pinned         = s_pinned;
	schedTick.harmonicChange = audio.harmonicChange;
	schedTick.musicPresence  = audio.musicPresence;
	schedTick.sectionCount   = audio.sectionCount;
	schedTick.sectionId      = audio.sectionId;
	schedTick.dropCount      = audio.dropCount + s_fakeDrops;
	schedTick.rhythmStrength = audio.rhythmStrength;
	schedTick.estimatedBPM   = audio.estimatedBPM;
	schedTick.logAttackTime  = audio.logAttackTime;
	m_scheduler.tick( schedTick );
    
    //printf( "Rotation t n: %d %f %f\n", m_stateInterpolationTunnel, m_speedKaleidoscopeTunnelAct, m_speedTunnelAct );

	// -------------------------
	// ----- render pass 2 -----
	// -------------------------
	// ** TODO **
	
	//float t = float(m_time.elapsed()) * 0.001;
    
	m_globaltime += timeSinceLastFrameSec; //t//+= 0.01f;
	//m_lastTime = t;


	// GPU-/Host-Simulationen (GpuSims): Bedarf ermitteln (nur steppen, was
	// ein sichtbarer Effekt wirklich sampelt - der aktive oder, während einer
	// Überblendung, der einblendende), Frame-Kontext übergeben, laufen lassen.
	// GpuSims bindet die neuesten Felder auf die globalen Units 7-11/28.
	{
		EffectShader *aktE = m_effectTextures[m_scheduler.actTexture()];
		EffectShader *nxtE = m_effectTextures[m_scheduler.nextTexture()];
		const bool fading  = ( m_scheduler.texState() != 0 );
		GpuSims::Demand need;
		need.rd       = aktE->usesSim()      || ( fading && nxtE->usesSim() );
		need.fluid    = aktE->usesFluid()    || ( fading && nxtE->usesFluid() );
		need.smoke3D  = aktE->usesSmoke3D()  || ( fading && nxtE->usesSmoke3D() );
		need.physarum = aktE->usesPhysarum() || ( fading && nxtE->usesPhysarum() );
		need.ssm      = aktE->usesSSM()      || ( fading && nxtE->usesSSM() );
		need.spectro  = aktE->usesSpectro()  || ( fading && nxtE->usesSpectro() );

		GpuSims::Frame simFrame;
		simFrame.globalTime   = m_globaltime;
		simFrame.audioAdvance = m_audioAdvance;
		simFrame.dyeTexA      = m_liveTex ? m_liveTex : m_actTex;
		simFrame.dyeTexB      = m_liveTex ? m_liveTex : m_nextTex;
		simFrame.dyeInterp    = m_interpolationTexture;

		m_sims.run( audio, timeSinceLastFrameSec, need, simFrame );
	}


	// ---- GL 4.3 compute-shader sims (ComputeFX) ----
	// Same demand gating as the older sims, but generic: an effect opts in by
	// declaring the sampler, which sets one bit of cfxMask().  Only the kinds
	// actually on screen are stepped, and each publishes on its own unit.
	{
		static bool cfxInit = false;
		if( !cfxInit ) { m_cfx.init(); cfxInit = true; }

		unsigned int need = m_effectTextures[m_scheduler.actTexture()]->cfxMask();
		if( m_scheduler.texState() != 0 )
			need |= m_effectTextures[m_scheduler.nextTexture()]->cfxMask();

		if( need )
		{
			GLuint src = m_liveTex ? m_liveTex : m_actTex;
			for( int k = 0; k < CFX_COUNT; ++k )
			{
				if( !( need & ( 1u << k ) ) ) continue;
				GLuint tex = m_cfx.step( k, audio, timeSinceLastFrameSec,
				                         m_globaltime, src, m_width, m_height );
				if( tex )
				{
					glActiveTexture( GL_TEXTURE0 + kCfxInfo[k].unit );
					glBindTexture( GL_TEXTURE_2D, tex );
				}
			}
			glActiveTexture( GL_TEXTURE0 );
		}
		m_cfx.retireIdle( m_globaltime );
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
		const bool act3D    = m_effectTextures[m_scheduler.actTexture()]->is3D();
		const bool texSolo  = ( m_scheduler.texState() == 0 );
		const bool next3D   = m_effectTextures[m_scheduler.nextTexture()]->is3D();
		m_trueStereoHold   = stereoOn && act3D && ( texSolo || next3D );
		m_trueStereoPacked = m_trueStereoHold
		                   && m_scheduler.combState() == 0;
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
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectTexture1 );

    //glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint, GL_TEXTURE_2D, m_texIDFBOEffectTexture1, 0);

	// A 2D effect never touches the depth attachment, so whatever the last 3D
	// scene left there would still be sitting in it — and the combine stage now
	// READS that texture.  Clearing here means "no geometry" always reads as the
	// far plane instead of as a stale silhouette.
	// Shadow map first: the depth pass has to be complete before the scene that
	// samples it is drawn.  It renders into its own framebuffer, so it happens
	// before the texture FBO is bound below.
	m_lastAudioFx = audioFx;
	// The box is sized by the SCENE, because only it knows its own scale, and
	// the map's 2048 texels are spent across whatever this says.
	EffectShader::s_shadowExtent =
	    m_effectTextures[m_scheduler.actTexture()]->shadowExtent();
	updateLightMatrix( m_globaltime );
	if( m_effectTextures[m_scheduler.actTexture()]->usesShadow() )
	{
		renderShadowPass( m_effectTextures[m_scheduler.actTexture()] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectTexture1 );
	}

	EffectShader::s_depthValid[0] =
	    m_effectTextures[m_scheduler.actTexture()]->is3D() ? 1.f : 0.f;
	if( EffectShader::s_depthValid[0] == 0.f )
	{
		glClearDepth( 1.0 );
		glClear( GL_DEPTH_BUFFER_BIT );
	}

	m_effectTextures[m_scheduler.actTexture()]->enableShader();
	m_effectTextures[m_scheduler.actTexture()]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
	m_effectTextures[m_scheduler.actTexture()]->applyAudioFeatures( audioFx );
	if( m_trueStereoPacked )
		renderSceneStereo( m_effectTextures[m_scheduler.actTexture()] );
	else
		m_effectTextures[m_scheduler.actTexture()]->draw();

	// Transparent geometry goes in afterwards, over the opaque frame this scene
	// just produced and against the depth it just wrote.
	if( !m_trueStereoPacked && m_effectTextures[m_scheduler.actTexture()]->usesOit() )
		renderOitPass( m_effectTextures[m_scheduler.actTexture()],
		               m_depthTexEffect1, m_fboEffectTexture1 );

	checkGLErrors("createTextures() 1");

	//Now Use Final Rendering
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	checkFramebufferStatus();

	//Do the FBO Stuff
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectTexture2 );

	// Skip the "next" texture effect while NOT cross-fading: every combine weights
	// this output (tex1) by (1-interpolation), which is 0 at interpolation==1.0, so
	// it is invisible.  Saves a whole effect pass during the common solo periods.
	EffectShader::s_depthValid[1] = 0.f;
	if( m_scheduler.texState() != 0 )
	{
		EffectShader::s_depthValid[1] =
		    m_effectTextures[m_scheduler.nextTexture()]->is3D() ? 1.f : 0.f;
		if( EffectShader::s_depthValid[1] == 0.f )
		{
			glClearDepth( 1.0 );
			glClear( GL_DEPTH_BUFFER_BIT );
		}
		m_effectTextures[m_scheduler.nextTexture()]->enableShader();
		m_effectTextures[m_scheduler.nextTexture()]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
		m_effectTextures[m_scheduler.nextTexture()]->applyAudioFeatures( audioFx );
		if( m_trueStereoPacked )     // 3D<->3D fade: the incoming scene is
			renderSceneStereo( m_effectTextures[m_scheduler.nextTexture()] );  // eye-packed too
		else
			m_effectTextures[m_scheduler.nextTexture()]->draw();
	}

	
	//Now Use Post Processing
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	checkFramebufferStatus();

	//printf( "%f %d\n", t-m_lastTime, loadimage );
   



	//Now Use Final Rendering
	// -------------------------
	// ----- render pass 3 -----
	// -------------------------
	// ** TODO **

/******************State Machine for the post processing*******************************/
	
/***********************************Plain and Full*****************************************/

	// Combine-Zustandsmaschine (an der alten Stelle, s.o.).
	m_scheduler.tickCombine( schedTick, m_trueStereoHold );

	
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	// 2D CAMERA RIG: if a scene carries rig2* formulas, the combine gets the
	// TRANSFORMED frame instead.  Never on eye-packed frames (warping a
	// packed stereo frame shears the two eyes against each other), and the
	// "next" slot only when its pass actually rendered this frame.
	GLuint combineTex1 = m_texIDFBOEffectTexture1;
	GLuint combineTex2 = m_texIDFBOEffectTexture2;
	if( !m_trueStereoPacked )
	{
		combineTex1 = rig2Transform( m_effectTextures[m_scheduler.actTexture()],
		                             m_texIDFBOEffectTexture1, 0 );
		if( m_scheduler.texState() != 0 )
			combineTex2 = rig2Transform( m_effectTextures[m_scheduler.nextTexture()],
			                             m_texIDFBOEffectTexture2, 1 );
		glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
		glViewport( 0, 0, m_width, m_height );
	}

	glActiveTexture(GL_TEXTURE3);
	glBindTexture( GL_TEXTURE_2D, combineTex1 );

	glActiveTexture(GL_TEXTURE4);
	glBindTexture( GL_TEXTURE_2D, combineTex2 );

	// The matching depth buffers.  Bound unconditionally: they are two texture
	// binds, and a combine that ignores them never declares the samplers.
	glActiveTexture(GL_TEXTURE0 + 29);
	glBindTexture( GL_TEXTURE_2D, m_depthTexEffect1 );
	glActiveTexture(GL_TEXTURE0 + 30);
	glBindTexture( GL_TEXTURE_2D, m_depthTexEffect2 );
	glActiveTexture(GL_TEXTURE0);

	//Do the FBO Stuff
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectCombine1 );

    //glFramebufferCombine2DEXT( GL_FRAMEBUFFER, m_attachmentpoint, GL_Combine_2D, m_texIDFBOEffectCombine1, 0);

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
		                                           m_scheduler.texInterp() );
		drawWindow();
	}
	else
	{
		m_effectCombines[m_scheduler.actCombine()]->enableShader();
		m_effectCombines[m_scheduler.actCombine()]->setUniforms( m_globaltime, m_scheduler.texInterp(), 3, 4 );
		m_effectCombines[m_scheduler.actCombine()]->applyAudioFeatures( audioFx );
		m_effectCombines[m_scheduler.actCombine()]->draw();
	}


	checkGLErrors("createCombines() 1");


    /*glFramebufferCombine2DEXT( GL_FRAMEBUFFER, m_attachmentpoint, GL_Combine_2D, m_texIDFBOEffectCombine2, 0);

	m_effectCombines[m_scheduler.nextCombine()]->enableShader();
	m_effectCombines[m_scheduler.nextCombine()]->setUniforms( m_globaltime, m_interpolationCombine );
	m_effectCombines[m_scheduler.nextCombine()]->draw();*/


	//Now Use Final Rendering
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	checkFramebufferStatus();

	//Do the FBO Stuff
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectCombine2 );

	// Skip the "next" combine while NOT cross-fading combines: the final present
	// pass (CombinePlain) weights this output by (1-interpolation)=0 at
	// interpolation==1.0, so it is invisible.  Saves the second combine pass.
	if( m_scheduler.combState() != 0 )
	{
		m_effectCombines[m_scheduler.nextCombine()]->enableShader();
		m_effectCombines[m_scheduler.nextCombine()]->setUniforms( m_globaltime, m_scheduler.texInterp(), 3, 4 );
		m_effectCombines[m_scheduler.nextCombine()]->applyAudioFeatures( audioFx );
		m_effectCombines[m_scheduler.nextCombine()]->draw();
	}

	
	//Now Use Final Rendering — into the safety FBO if active, else to the screen.
	GLuint combineTarget = m_present.ready() ? m_present.targetFbo() : m_defaultFBO;
	glBindFramebuffer( GL_FRAMEBUFFER, combineTarget );
	checkFramebufferStatus();

	/*******************************************************************************/

	glUseProgram( m_sh_prog_id_combine );
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	// Styled combine-combine transition (0 = classic linear mix).
	{
		GLint locTS = glGetUniformLocation( m_sh_prog_id_combine, "transStyle" );
		if( locTS >= 0 ) glUniform1i( locTS, m_scheduler.transStyleComb() );
	}


	//rwrw
	//glUniform1i( m_texPointCombineUni1, 3 );		// texture Unit 0, nicht mit texId verwechseln
	//glUniform1i( m_texPointCombineUni2, 4 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointCombineUni1, 5 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointCombineUni2, 6 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform2f( m_texSizeRcpCombineUni, (float) m_width, (float) m_height );
    glUniform1f( m_interpolationCombineUni, m_scheduler.combInterp() );
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
	GLuint presentSource = m_present.finalTex();
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

		glBindFramebuffer( GL_FRAMEBUFFER, m_fboTrail[cur] );
		glViewport( 0, 0, m_width, m_height );
		glUseProgram( m_trailProgId );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, m_present.finalTex() );
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
				bool sceneUp = m_effectTextures[m_scheduler.actTexture()]->is3D()
				            || ( m_scheduler.texState() != 0
				                 && m_effectTextures[m_scheduler.nextTexture()]->is3D() );
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
	if( m_present.ready() )
	{
		PresentPass::Inputs pin;
		pin.source       = presentSource;
		pin.targetFbo    = m_defaultFBO;
		pin.renderW      = m_width;    pin.renderH  = m_height;
		pin.displayW     = m_displayW; pin.displayH = m_displayH;
		pin.fx           = &audioFx;
		pin.dtFrame      = timeSinceLastFrameSec;
		pin.dtWall       = dtWall;
		pin.globalTime   = m_globaltime;
		pin.chasePhase   = m_chasePhase;
		pin.camZoom      = m_camZoom;  pin.camRot  = m_camRot;
		pin.camOffX      = m_camOffX;  pin.camOffY = m_camOffY;
		pin.stereoPacked = m_trueStereoPacked;
		pin.stereoMode   = s_stereoMode;
		pin.stereoDepth  = s_stereoDepth;
		pin.blackout     = s_blackout;
		pin.breakSmooth  = m_breakSmooth;
		pin.fadeOutEnv   = m_fadeOutEnv;
		pin.moodStrength = s_moodStrength;
		pin.lightShow    = s_lightShow;
		pin.renderScale  = s_renderScale;
		pin.lyricsAlpha   = m_overlay.lyricsAlpha;
		pin.lyricsScrollV = m_overlay.lyricsScrollV;
		pin.lyricsAspect  = m_overlay.lyricsAspect;
		pin.lyricsHlV0    = m_overlay.lyricsHlV0;
		pin.lyricsHlV1    = m_overlay.lyricsHlV1;
		pin.lyricsHlProg  = m_overlay.lyricsHlProg;
		pin.artistAlpha   = m_overlay.artistAlpha;
		pin.artistAspect  = m_overlay.artistAspect;
		// Zeit-Regie: Rewind/Echo/Breath.  Das Zeitecho traeumt in Ambient-
		// Passagen und blitzt nach einem Drop als Flashback auf; waehrend
		// eines Rewinds pausiert es (History auf History waere Matsch).
		pin.rewindSecs = m_rewindBack;
		pin.rewindMix  = m_rewindMixSm;
		pin.echoAmt    = std::max( 0.50f * audioFx.dropPulse,
		                           0.20f * audio.ambientFactor * audio.musicPresence )
		               * ( 1.f - m_rewindMixSm );
		if( m_echoOverride >= 0.f )
			pin.echoAmt = m_echoOverride;
		pin.echoDelay  = 1.4f;
		pin.breath     = m_breathSm;
		// Welle 2: Letterbox, Schockwelle, Cover-Palette, Zeilen-Slam,
		// 2.5D-Parallaxe (Tiefe der AKTIVEN Szene; eine 2D-Szene hat auf
		// die Fernebene geloeschte Tiefe -> Parallaxe neutralisiert sich).
		pin.letterbox    = m_letterSm;
		pin.shockR       = m_shockR;
		pin.shockAmp     = m_shockAmp;
		pin.lyricsLineAge = m_overlay.lyricsLineAge;
		pin.paletteAmt   = m_overlay.paletteAmt;
		for( int pi = 0; pi < 3; ++pi )
		{
			pin.paletteA[pi] = m_overlay.paletteA[pi];
			pin.paletteB[pi] = m_overlay.paletteB[pi];
		}
		pin.sceneDepthTex = m_depthTexEffect1;
		pin.depthPar      = m_trailDepth3D;
		pin.nearZ         = EffectShader::kSceneNear;
		pin.farZ          = EffectShader::kSceneFar;
		m_present.run( pin );
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

// Shared empty VAO for every fullscreen-triangle draw (core profile needs a
// VAO bound even without vertex attributes; the shared Fullscreen.vert
// generates the triangle from gl_VertexID).
GLuint fullscreenVAO()
{
	static GLuint vao = 0;
	if( vao == 0 )
		glGenVertexArrays( 1, &vao );
	return vao;
}

void FilterShader::drawWindow()
{
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}


/**
 * Create framebuffer object, bind it to reroute rendering operations 
 * from the traditional framebuffer to the off-screen buffer
 */
// Fixed-function copy of a texture into the currently bound FBO.  Used by the
// true-stereo path: the eye-packed 3D frame replaces the combine output 1:1.
// 2D CAMERA RIG: rotate/zoom/pan a finished 2D scene frame before the
// combine consumes it, driven by the scene's rig2* formulas (evaluated in
// EffectShader::applyAudioFeatures).  Renders src into a per-slot scratch
// texture through Blend/Rig2D.frag and returns THAT; the caller simply
// binds the returned id, so nothing is copied back and no other consumer
// of the original texture is affected.  Off (returns src) when the scene
// has no rig2 formulas — zero extra cost for the whole existing catalogue.
GLuint FilterShader::rig2Transform( EffectShader *fx, GLuint srcTex, int slot )
{
	float rig[4];
	if( !fx || !fx->rig2( rig ) )
		return srcTex;

	static GLuint prog = 0;
	static GLint  uTex = -1, uRoll = -1, uZoom = -1, uPan = -1, uRes = -1;
	if( prog == 0 )
	{
		prog  = setShaders( "..\\standard.vert", "..\\Blend\\Rig2D.frag" );
		uTex  = glGetUniformLocation( prog, "tex" );
		uRoll = glGetUniformLocation( prog, "rigRoll" );
		uZoom = glGetUniformLocation( prog, "rigZoom" );
		uPan  = glGetUniformLocation( prog, "rigPan" );
		uRes  = glGetUniformLocation( prog, "resolution" );
	}
	if( prog == 0 )
		return srcTex;                      // compile failed: fail open

	// Lazy scratch targets, size-checked every use (render scale / DPI
	// changes re-allocate here instead of needing a resize() case).
	if( m_rig2W != m_width || m_rig2H != m_height )
	{
		for( int i = 0; i < 2; ++i )
		{
			if( m_rig2Tex[i] == 0 ) glGenTextures( 1, &m_rig2Tex[i] );
			glBindTexture( GL_TEXTURE_2D, m_rig2Tex[i] );
			glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height,
			              0, m_texFormat, m_texType, NULL );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
			if( m_rig2Fbo[i] == 0 ) glGenFramebuffers( 1, &m_rig2Fbo[i] );
			glBindFramebuffer( GL_FRAMEBUFFER, m_rig2Fbo[i] );
			glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
			                        GL_TEXTURE_2D, m_rig2Tex[i], 0 );
		}
		glBindTexture( GL_TEXTURE_2D, 0 );
		m_rig2W = m_width;
		m_rig2H = m_height;
	}

	glBindFramebuffer( GL_FRAMEBUFFER, m_rig2Fbo[slot] );
	glViewport( 0, 0, m_width, m_height );
	glDisable( GL_DEPTH_TEST );
	glDisable( GL_BLEND );
	glUseProgram( prog );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, srcTex );
	if( uTex  >= 0 ) glUniform1i( uTex, 0 );
	if( uRes  >= 0 ) glUniform2f( uRes,  float(m_width), float(m_height) );
	if( uRoll >= 0 ) glUniform1f( uRoll, rig[0] );
	if( uZoom >= 0 ) glUniform1f( uZoom, rig[1] );
	if( uPan  >= 0 ) glUniform2f( uPan,  rig[2], rig[3] );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
	checkGLErrors( "FilterShader::rig2Transform" );
	return m_rig2Tex[slot];
}

void FilterShader::blitTexture( GLuint tex )
{
	// Tiny dedicated blit program (fixed-function texturing is gone in core).
	static GLuint blitProg = 0;
	static GLint  blitTexUni = -1;
	if( blitProg == 0 )
	{
		blitProg   = setShaders( "..\\standard.vert", "..\\Blend\\Blit.frag" );
		blitTexUni = glGetUniformLocation( blitProg, "tex" );
	}
	glUseProgram( blitProg );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, tex );
	if( blitTexUni >= 0 ) glUniform1i( blitTexUni, 0 );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}

// Create the shadow map's depth-only framebuffer.  Lazy: only a scene that
// declares "texShadow" ever triggers it, and most never do.
bool FilterShader::ensureShadowMap()
{
	if( m_shadowFbo != 0 )
		return true;

	glGenTextures( 1, &m_shadowTex );
	glBindTexture( GL_TEXTURE_2D, m_shadowTex );
	// LINEAR is deliberate: with GL_TEXTURE_COMPARE_MODE set, the hardware
	// filters the RESULT of four depth comparisons rather than the depths
	// themselves — free 2x2 percentage-closer filtering, which is what turns a
	// staircased shadow edge into a soft one.
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	// Outside the light's box there is no occluder, so the border must read as
	// "fully lit" — CLAMP_TO_EDGE would smear the nearest shadow outward across
	// everything beyond the map.
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_BORDER );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_BORDER );
	const float border[4] = { 1.f, 1.f, 1.f, 1.f };
	glTexParameterfv( GL_TEXTURE_2D, GL_TEXTURE_BORDER_COLOR, border );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, kShadowSize, kShadowSize,
	              0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );

	glGenFramebuffers( 1, &m_shadowFbo );
	glBindFramebuffer( GL_FRAMEBUFFER, m_shadowFbo );
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
	                        GL_TEXTURE_2D, m_shadowTex, 0 );
	// No colour attachment at all; without telling GL that, the framebuffer is
	// incomplete.
	glDrawBuffer( GL_NONE );
	glReadBuffer( GL_NONE );
	bool ok = checkFramebufferStatus();
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	glBindTexture( GL_TEXTURE_2D, 0 );

	if( !ok )
	{
		fputs( "shadow map FBO incomplete - shadows disabled\n", stderr );
		glDeleteFramebuffers( 1, &m_shadowFbo );
		glDeleteTextures( 1, &m_shadowTex );
		m_shadowFbo = m_shadowTex = 0;
	}
	return ok;
}

// Orthographic projection along a slowly turning light direction, covering a
// fixed cube at the origin.  Orthographic and not perspective because this is a
// SUN: its rays are parallel, and a perspective shadow frustum would give the
// shadows a vanishing point that the shading does not have.
void FilterShader::updateLightMatrix(float t)
{
	// The ACTIVE scene's box, not the default: the map's resolution is spent
	// across it, so a small scene must get a small box or its shadows come out
	// in blocks a texel wide.
	const float E = EffectShader::s_shadowExtent;

	// Kept fairly high on purpose.  A low sun is more dramatic per shadow, but
	// shadow length goes as 1/tan(elevation) — at 37 degrees a tall object
	// throws a shadow longer than itself, and in any scene with repeated
	// geometry the ground ends up entirely dark.
	float a = t * 0.06f;
	float lx = 0.42f * sinf( a );
	float ly = 1.15f + 0.16f * sinf( a * 0.43f );
	float lz = -0.42f * cosf( a ) - 0.18f;
	float ln = sqrtf( lx * lx + ly * ly + lz * lz );
	lx /= ln; ly /= ln; lz /= ln;
	EffectShader::s_lightDir[0] = lx;
	EffectShader::s_lightDir[1] = ly;
	EffectShader::s_lightDir[2] = lz;

	// Look-at from the light toward the origin.  f points from the eye into the
	// scene, so it is the NEGATED light direction.
	float fx = -lx, fy = -ly, fz = -lz;
	// Any up vector not parallel to f; y is parallel when the light is overhead.
	float ux = 0.f, uy = 1.f, uz = 0.f;
	if( fabsf( fy ) > 0.98f ) { ux = 1.f; uy = 0.f; }
	// s = f x up, then u = s x f  (both normalised).
	float sx = fy * uz - fz * uy;
	float sy = fz * ux - fx * uz;
	float sz = fx * uy - fy * ux;
	float sn = sqrtf( sx * sx + sy * sy + sz * sz );
	sx /= sn; sy /= sn; sz /= sn;
	float tx = sy * fz - sz * fy;
	float ty = sz * fx - sx * fz;
	float tz = sx * fy - sy * fx;

	// Eye far enough back that the whole box lies in front of it.
	const float dist = E * 2.f;
	float ex = lx * dist, ey = ly * dist, ez = lz * dist;

	// View matrix (column-major), rows s / t / -f, translated by -eye.
	float V[16] = {
		 sx,  tx, -fx, 0.f,
		 sy,  ty, -fy, 0.f,
		 sz,  tz, -fz, 0.f,
		-( sx * ex + sy * ey + sz * ez ),
		-( tx * ex + ty * ey + tz * ez ),
		  ( fx * ex + fy * ey + fz * ez ), 1.f
	};

	// Orthographic box: +-E across, and deep enough to hold the box from the
	// eye's distance.
	const float zn = 0.1f, zf = dist + E * 2.f;
	float P[16] = {
		1.f / E, 0.f,     0.f,                  0.f,
		0.f,     1.f / E, 0.f,                  0.f,
		0.f,     0.f,    -2.f / ( zf - zn ),    0.f,
		0.f,     0.f,    -( zf + zn ) / ( zf - zn ), 1.f
	};

	// s_lightM = P * V, column-major.
	float *M = EffectShader::s_lightM;
	for( int c = 0; c < 4; ++c )
		for( int r = 0; r < 4; ++r )
		{
			float sum = 0.f;
			for( int k = 0; k < 4; ++k )
				sum += P[k * 4 + r] * V[c * 4 + k];
			M[c * 4 + r] = sum;
		}
}

// Draw one 3D scene into the shadow map, depth only.
void FilterShader::renderShadowPass(EffectShader *fx)
{
	if( !ensureShadowMap() )
		return;

	glBindFramebuffer( GL_FRAMEBUFFER, m_shadowFbo );
	glViewport( 0, 0, kShadowSize, kShadowSize );
	glClearDepth( 1.0 );
	glClear( GL_DEPTH_BUFFER_BIT );

	// Deliberately NO face culling.  The usual trick is to cull front faces so
	// the map records each object's far side, which moves self-shadowing out of
	// the lit surface — but it only works if the geometry's winding is known,
	// and it is not: the cube buffer winds its outward faces clockwise, so
	// culling GL_FRONT there records the NEAREST surfaces and every face
	// shadows itself.  The receivers offset their lookup along the surface
	// normal instead, which needs no assumption about winding at all.
	glDisable( GL_CULL_FACE );

	EffectShader::s_shadowPass = 1.f;
	fx->enableShader();
	fx->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
	fx->applyAudioFeatures( m_lastAudioFx );
	fx->draw();
	EffectShader::s_shadowPass = 0.f;

	glActiveTexture( GL_TEXTURE0 + 31 );
	glBindTexture( GL_TEXTURE_2D, m_shadowTex );
	glActiveTexture( GL_TEXTURE0 );

	glViewport( 0, 0, m_width, m_height );
}

// Allocate the two accumulation targets weighted-blended OIT needs.
bool FilterShader::ensureOitTargets()
{
	if( m_oitFbo != 0 )
		return true;
	if( !glBlendFunci || !glDrawBuffers || !glClearBufferfv )
		return false;

	// Accumulation must be FLOATING POINT and cannot be 8-bit: it sums
	// premultiplied colour over every transparent layer with no clamping in
	// between, so an 8-bit target saturates after two or three panes and the
	// stack turns into a flat white card.
	glGenTextures( 1, &m_oitAccum );
	glBindTexture( GL_TEXTURE_2D, m_oitAccum );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, m_width, m_height, 0,
	              GL_RGBA, GL_FLOAT, NULL );

	glGenTextures( 1, &m_oitReveal );
	glBindTexture( GL_TEXTURE_2D, m_oitReveal );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_R16F, m_width, m_height, 0,
	              GL_RED, GL_FLOAT, NULL );

	glGenFramebuffers( 1, &m_oitFbo );
	glBindFramebuffer( GL_FRAMEBUFFER, m_oitFbo );
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
	                        GL_TEXTURE_2D, m_oitAccum, 0 );
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1,
	                        GL_TEXTURE_2D, m_oitReveal, 0 );
	const GLenum bufs[2] = { GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1 };
	glDrawBuffers( 2, bufs );
	bool ok = checkFramebufferStatus();
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	glBindTexture( GL_TEXTURE_2D, 0 );

	if( ok && m_oitResolveProg == 0 )
		m_oitResolveProg = setShaders( "..\\standard.vert", "..\\Blend\\OitResolve.frag" );

	if( !ok )
	{
		fputs( "OIT targets incomplete - transparent pass disabled\n", stderr );
		glDeleteFramebuffers( 1, &m_oitFbo );
		glDeleteTextures( 1, &m_oitAccum );
		glDeleteTextures( 1, &m_oitReveal );
		m_oitFbo = m_oitAccum = m_oitReveal = 0;
	}
	return ok;
}

// Draw the scene's transparent geometry into the accumulation targets, then
// composite the result back over the already-rendered opaque frame.
void FilterShader::renderOitPass(EffectShader *fx, GLuint depthTex, GLuint targetFbo)
{
	if( !ensureOitTargets() )
		return;

	glBindFramebuffer( GL_FRAMEBUFFER, m_oitFbo );
	// The SCENE'S depth buffer, not one of our own: transparent surfaces must
	// still be hidden by the opaque geometry that was drawn before them, and
	// that information only exists in the depth the scene just wrote.
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
	                        GL_TEXTURE_2D, depthTex, 0 );

	// Accumulation starts empty; revealage starts at 1 (nothing covered yet).
	const GLfloat zero[4] = { 0.f, 0.f, 0.f, 0.f };
	const GLfloat one[4]  = { 1.f, 1.f, 1.f, 1.f };
	glClearBufferfv( GL_COLOR, 0, zero );
	glClearBufferfv( GL_COLOR, 1, one );

	glEnable( GL_DEPTH_TEST );
	// Depth WRITES off.  The whole point is that transparent surfaces do not
	// occlude each other — writing depth would make the first one drawn hide
	// the ones behind it, which is exactly the order dependence being removed.
	glDepthMask( GL_FALSE );
	glEnable( GL_BLEND );
	// The two targets blend DIFFERENTLY: colour adds up, revealage multiplies
	// down.  One glBlendFunc could not express both.
	glBlendFunci( 0, GL_ONE, GL_ONE );
	glBlendFunci( 1, GL_ZERO, GL_ONE_MINUS_SRC_COLOR );

	EffectShader::s_oitPass = 1.f;
	fx->enableShader();
	fx->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
	fx->applyAudioFeatures( m_lastAudioFx );
	fx->draw();
	EffectShader::s_oitPass = 0.f;

	glDepthMask( GL_TRUE );
	glDisable( GL_BLEND );
	glDisable( GL_DEPTH_TEST );

	// ---- resolve: composite the accumulated transparency over the frame ----
	glBindFramebuffer( GL_FRAMEBUFFER, targetFbo );
	glViewport( 0, 0, m_width, m_height );
	if( m_oitResolveProg == 0 )
		return;
	glUseProgram( m_oitResolveProg );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_oitAccum );
	glActiveTexture( GL_TEXTURE1 );
	glBindTexture( GL_TEXTURE_2D, m_oitReveal );
	glActiveTexture( GL_TEXTURE0 );
	GLint l0 = glGetUniformLocation( m_oitResolveProg, "texAccum" );
	GLint l1 = glGetUniformLocation( m_oitResolveProg, "texReveal" );
	GLint lr = glGetUniformLocation( m_oitResolveProg, "resolution" );
	if( l0 >= 0 ) glUniform1i( l0, 0 );
	if( l1 >= 0 ) glUniform1i( l1, 1 );
	if( lr >= 0 ) glUniform2f( lr, float(m_width), float(m_height) );

	// Standard "over" compositing of the resolved layer onto the opaque frame.
	glEnable( GL_BLEND );
	glBlendFunc( GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
	glDisable( GL_BLEND );
}

void FilterShader::initFBO(GLuint &fboEffect, GLuint &texIDEffectTexture, GLuint *depthRb)
{
	// create FBO (off-screen framebuffer) — reuse the id if it already exists
	// (re-entering this path must re-attach, not leak a fresh FBO)
    if( fboEffect == 0 )
        glGenFramebuffers( 1, &fboEffect );

    // bind offscreen framebuffer (that is, skip the window-specific render target)
    glBindFramebuffer( GL_FRAMEBUFFER, fboEffect );

    // check if something went completely wrong
    checkGLErrors("initFBO()");
		// attach texture to FBO
    glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint,
							   GL_TEXTURE_2D, texIDEffectTexture, 0);
	checkGLErrors("initFBO()");

	// Optional depth buffer (the 3D scene effects need depth testing; the plain
	// fullscreen-quad effects ignore it).  (Re)created at the current size on
	// every (re)init, so window resizes stay correct.
	//
	// A TEXTURE, not a renderbuffer: a renderbuffer is write-only from the
	// shader's side, and everything interesting downstream — depth of field,
	// ambient occlusion, light shafts, fog — needs to READ the depth the scene
	// just wrote.  The attachment costs the same either way.
	if( depthRb )
	{
		if( *depthRb == 0 )
			glGenTextures( 1, depthRb );
		glBindTexture( GL_TEXTURE_2D, *depthRb );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, m_width, m_height,
		              0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );
		glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
		                        GL_TEXTURE_2D, *depthRb, 0 );
		glBindTexture( GL_TEXTURE_2D, 0 );
	}

	// check if that worked
    if ( !checkFramebufferStatus() )
	{
		fputs( "glFramebufferTexture2D() FAILED!\n", stderr );
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
	// (glTexEnvi removed: fixed-function texturing is gone in core)

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

	glGenerateMipmap( GL_TEXTURE_2D );

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
    status = (GLenum) glCheckFramebufferStatus(GL_FRAMEBUFFER);
    switch(status) {
        case GL_FRAMEBUFFER_COMPLETE:
            return true;
        case GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
			printf("Framebuffer incomplete, incomplete attachment\n");
            return false;
        case GL_FRAMEBUFFER_UNSUPPORTED:
			printf("Unsupported framebuffer format\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
			printf("Framebuffer incomplete, missing attachment\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
			printf("Framebuffer incomplete, attached images must have same dimensions\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_FORMATS:
			printf("Framebuffer incomplete, attached images must have same format\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER:
			printf("Framebuffer incomplete, missing draw buffer\n");
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_READ_BUFFER:
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
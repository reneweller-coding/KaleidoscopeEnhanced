/**
 * @file RenderPipeline.cpp
 * @brief Implements RenderPipeline: the per-frame render/present pipeline (see paint()) —
 *        texture-effect and combine-effect rendering, the SceneScheduler-driven cross-fade
 *        state machines, feedback/trails, shadow and order-independent-transparency passes,
 *        the 2D camera rig, true-stereo per-eye rendering, and the background ImageLoader
 *        thread that streams new photos in without stalling the render thread.
 */
#include <float.h>
#include <math.h>
#include <algorithm>

#include "shader_setup.h"
#include <set>
#include <string>
#include "RenderPipeline.h"
#include "PlatformQt.h"
#include "SpoutOut.h"
#include "SpoutIn.h"
#include "VideoIn.h"
#include "Scene3DShader.h"
#include "Utils.h"

#include <QtXml/QDomDocument>
#include <QtCore/QTextStream>
#include <QtCore/QFileInfo>
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
float RenderPipeline::s_reactivity  = 1.0f;
float RenderPipeline::s_trailAmount = 0.6f;
float RenderPipeline::s_moodStrength = 1.0f;
float RenderPipeline::s_renderScale = 1.0f;
float RenderPipeline::s_renderScaleMax = 1.0f;   // no supersampling unless asked for
bool  RenderPipeline::s_renderScaleFromCli = false;
float RenderPipeline::s_lightShow   = 0.0f;   // corner lamps / light-show OFF by default
bool  RenderPipeline::s_spoutEnabled = false; // Spout sender (CLI -o)
float RenderPipeline::s_latencyLead  = 0.05f; // display-phase lead vs. heard audio
int   RenderPipeline::s_stereoMode  = 0;      // stereoscopic output (CLI -3 / 'z')
float RenderPipeline::s_stereoDepth = 1.0f;   // disparity strength
bool  RenderPipeline::s_blackout = false;     // VJ blackout ('b')
bool  RenderPipeline::s_freeze   = false;     // VJ freeze ('e')
bool  RenderPipeline::s_pinned   = false;     // VJ pin ('u')
QHash<QString, float> RenderPipeline::s_taste;  // taste learning (skip/favourite)
bool    RenderPipeline::s_spoutInEnabled = false;  // Spout input (CLI -i)
QString RenderPipeline::s_spoutInSender;
QString RenderPipeline::s_videoPath;                // native video input (CLI -v)
QString RenderPipeline::s_imageDirCli;              // photo source override (CLI -f)
QString RenderPipeline::s_imageDirUser;             // photo source override (ini)

// Settings file lives next to the Configurations folder (parent of Debug/Release),
// matching how shaders and configs are loaded ("..\\...").
static QString settingsFilePath()
{
	return Platform::assetPath( QString( "..\\kaleidoscope_settings.ini" ) );
}

void RenderPipeline::loadSettings()
{
	QSettings s( settingsFilePath(), QSettings::IniFormat );
	s_reactivity   = clampParam( s.value( "reactivity",  s_reactivity  ).toFloat(), 0.f, 3.0f  );
	s_trailAmount  = clampParam( s.value( "trails",      s_trailAmount ).toFloat(), 0.f, 0.95f );
	s_moodStrength = clampParam( s.value( "mood",        s_moodStrength).toFloat(), 0.f, 2.5f  );
	s_latencyLead  = clampParam( s.value( "latencyLead", s_latencyLead ).toFloat(), 0.f, 0.25f );
	s_stereoMode   = s.value( "stereoMode", s_stereoMode ).toInt() & 3;
	// Photo source. Empty (the shipped default) means "whatever the preset
	// says", which is the bundled Images/ folder -- see init().
	s_imageDirUser = s.value( "imageDirectory", s_imageDirUser ).toString().trimmed();
	s_stereoDepth  = clampParam( s.value( "stereoDepth", s_stereoDepth ).toFloat(), 0.f, 2.f );
	setRenderScale( s.value( "renderScale", s_renderScale ).toFloat() );  // clamps internally
	setRenderScaleMax( s.value( "renderScaleMax", s_renderScaleMax ).toFloat() );

	// Taste learning: PER-PRESET per-shader selection-weight factors (keys
	// "<Preset>/<file>"), decayed toward 1.0 a little on every start so old
	// skips/favourites slowly lose their grip.
	s_marked.clear();
	s.beginGroup( "marked" );
	for( const QString &k : s.allKeys() )
		if( s.value( k, false ).toBool() )
			s_marked.insert( k );
	s.endGroup();

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

// Basename of a fragment path ("..\\Scene2D\\Voyager.frag" -> "Voyager.frag").
static QString tasteBase( const char *fragPath )
{
	QString f = QString::fromLocal8Bit( fragPath ? fragPath : "?" );
	int cut = std::max( f.lastIndexOf( QChar('\\') ), f.lastIndexOf( QChar('/') ) );
	return f.mid( cut + 1 );
}

float RenderPipeline::tasteFor( const char *fragPath ) const
{
	auto it = s_taste.constFind( m_presetName + "/" + tasteBase( fragPath ) );
	return ( it == s_taste.constEnd() ) ? 1.f : it.value();
}

void RenderPipeline::bumpTaste( const char *fragPath, float mul )
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

void RenderPipeline::saveSettings()
{
	QSettings s( settingsFilePath(), QSettings::IniFormat );
	s.setValue( "reactivity",  s_reactivity   );
	s.setValue( "trails",      s_trailAmount  );
	s.setValue( "mood",        s_moodStrength );
	s.setValue( "latencyLead", s_latencyLead  );
	s.setValue( "stereoMode",  s_stereoMode   );
	s.setValue( "stereoDepth", s_stereoDepth  );
	s.setValue( "renderScale", s_renderScale  );
	s.setValue( "renderScaleMax", s_renderScaleMax );
	// Written back even when empty, so the key is visible in the file for
	// anyone who wants to point the visualizer at their own pictures without
	// hunting through documentation for its name.
	s.setValue( "imageDirectory", s_imageDirUser );
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
RenderPipeline::RenderPipeline( )
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
, m_fboEffectFx1(0)
, m_fboEffectFx2(0)
, m_attachmentpoint(GL_COLOR_ATTACHMENT0)
, m_texID1(0)
, m_texID2(0)
, m_texIDFBOEffectTexture1(0)
, m_texIDFBOEffectTexture2(0)
, m_texIDFBOEffectFx1(0)
, m_texIDFBOEffectFx2(0)
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
, m_triggerImageload(false)
, m_waitForImageToLoad(false)
, m_globaltime(0.0)
, m_nanotimer()
, m_nrTextureUploads(0)
{
	m_effectTextures.clear();
	m_effectFx.clear();
	m_effectTransitions.clear();
}




void RenderPipeline::init( const QString &directory, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax, unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax )
{
	// Photo source, most specific layer first: an explicit -f on the command
	// line, then the user's persistent ini setting, then the preset's own
	// ImageDirectory attribute -- which ships as "..\\Images", the folder the
	// bundled photo library unpacks into, resolved against the executable's
	// working directory exactly like the shader paths are.
	m_imageDirectory = !s_imageDirCli.isEmpty()  ? s_imageDirCli
	                 : !s_imageDirUser.isEmpty() ? s_imageDirUser
	                                             : directory;

	m_timeTextureSoloMin = timeTextureSoloMin;
	m_timeTextureSoloMax = timeTextureSoloMax;
	m_timeTextureInterpolationMin = timeTextureInterpolationMin;
	m_timeTextureInterpolationMax = timeTextureInterpolationMax;
}

void RenderPipeline::start( int width, int height )
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

	// Name the LAYER the directory came from, not just the path: with three
	// possible sources a bare path leaves the reader guessing which one won,
	// and a typo in the ini looks exactly like a missing photo pack.
	const char *src = !s_imageDirCli.isEmpty()  ? "command line -f"
	                : !s_imageDirUser.isEmpty() ? "imageDirectory in kaleidoscope_settings.ini"
	                                            : "preset default";
	printf( "Nr of images: %d\n", (int) m_imageList.size() );
	if( m_imageList.isEmpty() )
		fprintf( stderr, "WARNING: image directory '%s' (%s) missing or empty - "
		                 "using a procedural fallback texture. The photo pack is an "
		                 "optional download; unpack it into the Images folder.\n",
		         m_imageDirectory.toLocal8Bit().constData(), src );
	else
		fprintf( stderr, "Photo source: %s (%s)\n",
		         m_imageDirectory.toLocal8Bit().constData(), src );

	// The honest catalogue size. An entry is a SCENE -- a model, a camera, a
	// background, a set of parameters -- but several entries can be the same
	// shader wearing different clothes. Reporting only the entry count inflates
	// what the program is; reporting only the shader count undersells what it
	// shows. Both, side by side.
	{
		std::set<std::string> distinct;
		int entries = 0;
		const std::vector<EffectShader *> *lists[3] =
		    { &m_effectTextures, &m_effectFx, &m_effectTransitions };
		for( int L = 0; L < 3; ++L )
			for( EffectShader *e : *lists[L] )
			{
				++entries;
				if( e->fragmentName() ) distinct.insert( e->fragmentName() );
			}
		fprintf( stderr, "Catalogue: %d scenes from %d shaders (%d entries reuse one)\n",
		         entries, (int) distinct.size(), entries - (int) distinct.size() );
	}
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
		EffectShader *fb = new EffectShader( "..\\FX\\FxPlain.frag", 30, 60, 20, 40 );
		fb->setProbability( 1.f );
		fb->setComplexity( 1 );
		m_effectTextures.push_back( fb );
	}
	if( m_effectFx.empty() )
	{
		fprintf( stderr, "WARNING: configuration has no valid <CombineShader> "
		                 "entries (they need the SAME attribute names as "
		                 "TextureShader + type=\"normal\") - using FxPlain.\n" );
		EffectShader *fb = new EffectShader( "..\\FX\\FxPlain.frag", 30, 60, 20, 40 );
		fb->setProbability( 1.f );
		fb->setComplexity( 1 );
		m_effectFx.push_back( fb );
	}
	// Presets from before the Transitions/ split (or with a typo'd element
	// name) carry no <TransitionShader> entries; scene fades then fall back
	// to the classic linear crossfade so old configs keep working unchanged.
	if( m_effectTransitions.empty() )
	{
		fprintf( stderr, "WARNING: configuration has no <TransitionShader> "
		                 "entries - scene fades use the plain Crossfade.\n" );
		EffectShader *fb = new EffectShader( "..\\Transitions\\Crossfade.frag", 30, 60, 20, 40 );
		fb->setProbability( 1.f );
		fb->setComplexity( 1 );
		m_effectTransitions.push_back( fb );
	}

	// Initiale Effekt-/Combine-Wahl + Szenen-Uhren: SceneScheduler.
	m_scheduler.attach( &m_effectTextures, &m_effectFx, &m_effectTransitions );
	m_scheduler.setTasteCallback( [this]( const char *f ){ return tasteFor( f ); } );
	m_scheduler.reset();

	//Start the timers
	m_time.start();
	m_timeTexture.start();

	
	//m_renderPipeline = new RenderPipeline(100,100, directory);
	m_imageLoader = new ImageLoader( this );
    m_imageLoader->start();

	loadShader();
	reinit( width, height );
}

QString RenderPipeline::activeShaderInfo() const
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
		if( currentSceneMarked() )
			out += QString("   [MARKIERT %1]").arg( markedCount() );
		if (m_scheduler.texState() != 0)
			out += QString("   → %1  (%2%)")
			       .arg(base(m_effectTextures[m_scheduler.nextTexture()]->fragmentName()))
			       .arg(int((1.0f - m_scheduler.texInterp()) * 100.0f + 0.5f));
	}
	out += "\n";
	if (!m_effectFx.empty())
	{
		out += "COMB  " + base(m_effectFx[m_scheduler.actFx()]->fragmentName());
		if (m_scheduler.fxState() != 0)
			out += QString("   → %1  (%2%)")
			       .arg(base(m_effectFx[m_scheduler.nextFx()]->fragmentName()))
			       .arg(int((1.0f - m_scheduler.fxInterp()) * 100.0f + 0.5f));
	}
	// The transition only ACTS during a scene fade; showing it outside one
	// would just name the stale last roll.
	if (!m_effectTransitions.empty() && m_scheduler.texState() != 0)
		out += "\nTRANS " +
		       base(m_effectTransitions[m_scheduler.actTransition()]->fragmentName());
	return out;
}

void RenderPipeline::stop()
{
	// NOTE: the global Spout facades are deliberately NOT released here —
	// stop() runs on every preset switch, which made the Spout sender vanish
	// from OBS/Resolume at each switch (and deleted the receiver texture
	// without a current GL context).  GLwidget's destructor releases them
	// once at shutdown.

	// NOTE: terminate() hard-kills the loader thread immediately rather than
	// asking it to exit its poll loop cooperatively — there is no cooperative
	// stop flag (ImageLoader::run() only checks m_triggerImageload). Safe in
	// practice because run() never holds a mutex; the worst case is an image
	// decode aborted partway, and the ImageLoader object itself is deleted
	// right below anyway.
	m_imageLoader->terminate();

	cleanTextures();
	cleanShaderPrograms();

	delete m_imageLoader;
}














// Destructor
RenderPipeline::~RenderPipeline()
{
	cleanTextures();
	cleanShaderPrograms();
	delete m_mesh;
}

void RenderPipeline::cleanTextures()
{
	glDeleteFramebuffers( 1, &m_fboEffectTexture1 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboEffectTexture2 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboEffectFx1 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboEffectFx2 );		// clean up framebuffer object
	glDeleteFramebuffers( 1, &m_fboTransition );		// clean up framebuffer object
	glDeleteTextures( 1, &m_actTex );         // clean up textures
	glDeleteTextures( 1, &m_nextTex );
	//glDeleteTextures( 1, &m_texID3 );
}

void RenderPipeline::cleanShaderPrograms()
{
	// Shared: every configuration builds the same OverlayBlend program.
	shaderProgramRelease(m_sh_prog_id_fx);


	for( unsigned int i = 0; i < m_effectTextures.size(); i++ )
	{
		m_effectTextures[i]->cleanShaderPrograms();
	}


	for( unsigned int i = 0; i < m_effectFx.size(); i++ )
	{
		m_effectFx[i]->cleanShaderPrograms();
	}

	for( unsigned int i = 0; i < m_effectTransitions.size(); i++ )
	{
		m_effectTransitions[i]->cleanShaderPrograms();
	}
}



void RenderPipeline::loadShader()
{
	//checkGLErrors("loadShader 0");
	//cleanShaderPrograms();
	//checkGLErrors("loadShader 1");
	initGLSL();	// init shader runtime
	checkGLErrors("loadShader 2");
}

bool RenderPipeline::loadObj(const char *filename)
{
	delete m_mesh;
	m_mesh = new Mesh(filename);
	if(!m_mesh->success()) {
		std::cerr << "Failed reading model\n";
		return false;
	}
	return true;
}

void RenderPipeline::reinit(int width, int height)
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

	
	for( unsigned int i = 0; i < m_effectFx.size(); i++ )
	{
		m_effectFx[i]->prepare( m_width, m_height );   // lazy compile
	}

	for( unsigned int i = 0; i < m_effectTransitions.size(); i++ )
	{
		m_effectTransitions[i]->prepare( m_width, m_height );   // lazy compile
	}

	checkGLErrors("reinit() 0");
	createTexture();					// create texture

	createFBOTexture( m_texIDFBOEffectTexture1 );
	createFBOTexture( m_texIDFBOEffectTexture2 );
	createFBOTexture( m_texIDFBOEffectFx1 );
	createFBOTexture( m_texIDFBOEffectFx2 );
	createFBOTexture( m_texIDFBOTransition );
	initFBO(  m_fboEffectTexture1, m_texIDFBOEffectTexture1, &m_depthTexEffect1 );
	initFBO(  m_fboEffectTexture2, m_texIDFBOEffectTexture2, &m_depthTexEffect2 );
	initFBO(  m_fboEffectFx1, m_texIDFBOEffectFx1 );
	initFBO(  m_fboEffectFx2, m_texIDFBOEffectFx2 );
	initFBO(  m_fboTransition,     m_texIDFBOTransition );
	
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
void RenderPipeline::resize(int width, int height)
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
	for( unsigned int i = 0; i < m_effectFx.size(); i++ )
		m_effectFx[i]->setSize( m_width, m_height );
	for( unsigned int i = 0; i < m_effectTransitions.size(); i++ )
		m_effectTransitions[i]->setSize( m_width, m_height );

	// Re-allocate the off-screen colour buffers to the new size, reusing IDs.
	setupFBOTexture( m_texIDFBOEffectTexture1 );
	setupFBOTexture( m_texIDFBOEffectTexture2 );
	setupFBOTexture( m_texIDFBOEffectFx1 );
	setupFBOTexture( m_texIDFBOEffectFx2 );
	setupFBOTexture( m_texIDFBOTransition );

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
void RenderPipeline::setupSafety()
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
		m_trailProgId   = setShaders( "..\\standard.vert", "..\\Engine\\Feedback.frag" );
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
		m_stereoMixProgId  = setShaders( "..\\standard.vert", "..\\Engine\\StereoMix.frag" );
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
void RenderPipeline::showTitle( const QString &title, const QString &artist )
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

	// Auto-shrink instead of eliding with "...": most real track/artist names
	// fit once the font gives a little, and a slightly smaller-but-complete
	// title reads better than a truncated one on a reveal that's only on
	// screen for ~8s anyway. Floors at ~55% of the nominal size (still
	// legible); eliding stays as the last resort for the rare title that
	// doesn't fit even there.
	const int maxW = W - int(80 * S);
	auto fitFont = [&]( const char *family, int nominalPt, bool bold, const QString &text ) -> QFont
	{
		const int minPt = int( nominalPt * 0.55f );
		QFont f( family, nominalPt, bold ? QFont::Bold : QFont::Normal );
		while( f.pointSize() > minPt && QFontMetrics( f ).horizontalAdvance( text ) > maxW )
			f.setPointSize( f.pointSize() - 1 );
		return f;
	};
	QFont ft = fitFont( "Segoe UI", int(52 * S), true,  title );
	QFont fa = fitFont( "Segoe UI", int(26 * S), false, artist );
	QString t = title, a = artist;
	if( QFontMetrics( ft ).horizontalAdvance( t ) > maxW )
		t = QFontMetrics( ft ).elidedText( t, Qt::ElideRight, maxW );
	if( QFontMetrics( fa ).horizontalAdvance( a ) > maxW )
		a = QFontMetrics( fa ).elidedText( a, Qt::ElideRight, maxW );

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
void RenderPipeline::requestSceneChange()
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
void RenderPipeline::compileAllShaders()
{
	// Timed separately from the rest of startup on purpose: the eager compile
	// shares this run with 977 photo loads and 238 mesh imports, and the total
	// says nothing about which of them costs what.
	QElapsedTimer compileClock; compileClock.start();
	for( EffectShader *s : m_effectTextures )
	{
		fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
		s->ensureCompiled();
	}
	for( EffectShader *s : m_effectFx )
	{
		fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
		s->ensureCompiled();
	}
	for( EffectShader *s : m_effectTransitions )
	{
		fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
		s->ensureCompiled();
	}
	fprintf( stderr, "COMPILEALL done (%d textures, %d combines, %d transitions)\n",
	         (int)m_effectTextures.size(), (int)m_effectFx.size(),
	         (int)m_effectTransitions.size() );
	// The honest count: how many DISTINCT shader programs the catalogue
	// actually is, next to how many entries name one. The two differ by
	// the 3D-model families, where one shader carries up to 29 scenes.
	int progs = 0, reuses = 0; double buildMs = 0.0;
	shaderCacheStats( &progs, &reuses, &buildMs );
	const double avg = progs ? buildMs / progs : 0.0;
	fprintf( stderr, "SHADERS: %d distinct programs, %d builds served from the cache\n",
	         progs, reuses );
	fprintf( stderr, "SHADERS: %.0f ms compiling+linking (%.0f ms each), so the cache saved about %.0f ms\n",
	         buildMs, avg, avg * reuses );
	// The eager-build total for contrast: for a 3D-model scene it also imports
	// the .glb, which is the larger half. Naming it compile time would be wrong.
	fprintf( stderr, "SHADERS: eager build incl. mesh import took %lld ms\n",
	         (long long) compileClock.elapsed() );
}

// Remote scene browser: list the preset's texture shaders (file basenames).
QStringList RenderPipeline::sceneNames() const
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
void RenderPipeline::forceScene( int idx )
{
	if( idx < 0 || idx >= (int)m_effectTextures.size() )
		return;
	if( s_pinned || s_freeze )
		return;                       // same handbrakes as requestSceneChange
	m_scheduler.forceScene( idx );
}

// Key 'f': the user LIKES what is on screen — persistent selection bonus.
QSet<QString> RenderPipeline::s_marked;

/**
 * @brief The settings-ini key for one marked scene.
 *
 * Deliberately the bare filename, NOT the preset-qualified key taste uses: a
 * mark says "this SHADER needs another look", which is true no matter which
 * preset it happened to appear in.
 */
static QString markKey( const char *fragPath )
{
	return QString( "marked/" ) + tasteBase( fragPath );
}

bool RenderPipeline::currentSceneMarked() const
{
	if( m_scheduler.actTexture() >= m_effectTextures.size() )
		return false;
	return s_marked.contains( tasteBase( m_effectTextures[m_scheduler.actTexture()]->fragmentName() ) );
}

bool RenderPipeline::toggleMarkCurrentScene()
{
	if( m_scheduler.actTexture() >= m_effectTextures.size() )
		return false;
	const char *frag = m_effectTextures[m_scheduler.actTexture()]->fragmentName();
	const QString base = tasteBase( frag );

	QSettings s( settingsFilePath(), QSettings::IniFormat );
	const bool nowMarked = !s_marked.contains( base );
	if( nowMarked )
	{
		s_marked.insert( base );
		s.setValue( markKey( frag ), true );
	}
	else
	{
		s_marked.remove( base );
		s.remove( markKey( frag ) );
	}
	// Persist immediately: an inspection pass is exactly the situation where
	// the app gets closed abruptly, and losing the shortlist defeats the point.
	s.sync();
	fprintf( stderr, "Mark: %s %s (%d marked)\n",
	         base.toLocal8Bit().constData(),
	         nowMarked ? "SET" : "cleared", (int) s_marked.size() );
	return nowMarked;
}

bool RenderPipeline::saveMarkedPreset( QString *outPath )
{
	if( s_marked.isEmpty() )
	{
		fprintf( stderr, "Marked preset: nothing marked\n" );
		return false;
	}

	// Take the scenes' real nodes from the master catalogue. Synthesising tags
	// here would drop geom and every preset parameter -- the exact failure that
	// made a whole measurement campaign's probes meaningless earlier.
	const QString cfgDir = QFileInfo( settingsFilePath() ).absolutePath() + "/Configurations";
	QDomDocument master;
	QFile mf( cfgDir + "/Komplett.xml" );
	QString parseErr; int errLine = 0;
	if( !mf.open( QIODevice::ReadOnly ) || !master.setContent( &mf, &parseErr, &errLine ) )
	{
		fprintf( stderr, "Marked preset: cannot read Komplett.xml (%s, line %d)\n",
		         parseErr.toLocal8Bit().constData(), errLine );
		return false;
	}
	mf.close();

	QDomDocument out;
	QDomElement root = out.createElement( "configuration" );
	root.setAttribute( "ImageDirectory", master.documentElement().attribute( "ImageDirectory" ) );
	root.setAttribute( "ConfigurationName", "Marked" );
	out.appendChild( root );
	root.appendChild( out.createComment(
		" Scenes marked at runtime with SPACE, written with SHIFT+SPACE. "
		"Regenerated wholesale on every save. " ) );

	QDomNodeList texs = master.documentElement().elementsByTagName( "TextureShader" );
	QSet<QString> written;
	for( int i = 0; i < texs.count(); ++i )
	{
		QDomElement el = texs.at( i ).toElement();
		const QString base = tasteBase( el.attribute( "file" ).toLocal8Bit().constData() );
		if( !s_marked.contains( base ) || written.contains( base ) )
			continue;
		written.insert( base );
		QDomElement copy = out.importNode( el, true ).toElement();
		// Every marked scene should actually appear, and long enough to judge.
		copy.setAttribute( "probability", "1.0" );
		copy.setAttribute( "minTimeSolo", "12" );
		copy.setAttribute( "maxTimeSolo", "18" );
		copy.setAttribute( "minTimeInterpolation", "2" );
		copy.setAttribute( "maxTimeInterpolation", "3" );
		root.appendChild( copy );
	}
	if( written.isEmpty() )
	{
		fprintf( stderr, "Marked preset: none of the %d marked scenes are in Komplett.xml\n",
		         (int) s_marked.size() );
		return false;
	}

	// Plain overlay + a neutral fade, so what you see is the scene itself.
	QDomElement comb = out.createElement( "CombineShader" );
	comb.setAttribute( "file", "..\\FX\\FxPlain.frag" );
	comb.setAttribute( "type", "normal" );
	comb.setAttribute( "probability", "1.0" );
	comb.setAttribute( "complexity", "1" );
	root.appendChild( comb );
	QDomElement tr = out.createElement( "TransitionShader" );
	tr.setAttribute( "file", "..\\Transitions\\Crossfade.frag" );
	tr.setAttribute( "type", "normal" );
	tr.setAttribute( "probability", "1" );
	tr.setAttribute( "complexity", "1" );
	root.appendChild( tr );

	const QString path = cfgDir + "/Marked.xml";
	QFile f( path );
	if( !f.open( QIODevice::WriteOnly | QIODevice::Text ) )
	{
		fprintf( stderr, "Marked preset: cannot write %s\n", path.toLocal8Bit().constData() );
		return false;
	}
	QTextStream ts( &f );
	ts << "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n" << out.toString( 2 );
	f.close();

	if( outPath ) *outPath = path;
	fprintf( stderr, "Marked preset: %d scene(s) -> %s\n", (int) written.size(),
	         path.toLocal8Bit().constData() );
	return true;
}

void RenderPipeline::favoriteCurrentEffect()
{
	if( m_scheduler.actTexture() < m_effectTextures.size() )
		bumpTaste( m_effectTextures[m_scheduler.actTexture()]->fragmentName(), 1.25f );
}


// ---------------------------------------------------------------------------
// paint(): the whole per-frame pipeline.  Rough order (see the section
// comments below for each): (1) live Spout/video input + timing-scale smoothing;
// (2) VJ freeze/pin + DJ-stop dt manipulation; (3) title-reveal upload/advance;
// (4) the big audio-reactive block that turns raw AudioFeatures into continuous,
// slew-limited phases/envelopes (audioFx) — beat PLL, bar phase, onset/kick/
// snare/hat envelopes, swell, fade-out, melody ring, virtual-camera "Regie",
// Zeit-Regie rewind/echo/breath, chroma-hue slew; (5) the image cross-fade state
// machine and the SceneScheduler tick (effect selection); (6) GpuSims/ComputeFX
// stepping, gated to only what the active/incoming effects actually sample;
// (7) shadow pass, the two texture-effect passes (optional true-stereo/OIT) and
// the two combine passes, with the SceneScheduler combine tick running in
// between (it needs m_trueStereoHold, computed just before the texture passes);
// (8) the legacy outer "combine of combines" (FxPlain) cross-fade; (9) the
// phosphor feedback/trails pass; (10) PresentPass::run() for tone-mapping,
// bloom, camera transform, stereo packing, overlays and final display.
// ---------------------------------------------------------------------------
void RenderPipeline::beginFrame( const AudioFeatures &audio )
{
	m_scheduler.setMood( audio.arousal, audio.valence, audio.ambientFactor );
	// Snapshot for the ImageLoader's mood-matched image choice (its thread).
	m_moodValence = audio.valence;
	m_moodArousal = audio.arousal;
	m_moodAmbient = audio.ambientFactor;

	// Lazy-compile warm-up: ONE step per frame. This used to be the hidden
	// stutter engine: ensureCompiled() on a mesh scene ran buildGeometry(),
	// which loaded the model SYNCHRONOUSLY -- 200-700 ms per model, one per
	// frame, for as long as it took to walk all 238 mesh scenes. The
	// comment used to promise "every shader is ready long before random
	// selection could pick it", and that was true back when a step was a
	// GLSL compile; the mesh loads arrived later and turned the warmer
	// into a minutes-long hitch parade.
	// Now the warmer only ever does cheap-ish GL work on this thread:
	//   1. an unbuilt-but-READY mesh gets its GL upload (a few ms), or
	//   2. an uncompiled shader gets its GLSL compile -- with its model
	//      load handed to the worker FIRST, so buildGeometry() defers
	//      instead of blocking.
	// The worker crawls the models in the background; an active fade's
	// scene jumps the queue (see requestMeshWarmup).
	{
		bool warmed = false;
		for( EffectShader *s : m_effectTextures )
			if( s->finishMeshWarmup() ) { warmed = true; break; }
		if( !warmed )
			for( EffectShader *s : m_effectTextures )
				if( !s->isCompiled() )
				{
					s->requestMeshWarmup();   // no-op for non-mesh scenes
					s->ensureCompiled();      // GLSL only; mesh build defers
					warmed = true;
					break;
				}
		if( !warmed )
			for( EffectShader *s : m_effectFx )
				if( !s->isCompiled() ) { s->ensureCompiled(); break; }
	}

}

void RenderPipeline::updateLiveInput()
{
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

}

void RenderPipeline::updateTimingScale( const AudioFeatures &audio )
{
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

}

RenderPipeline::FrameTiming RenderPipeline::readFrameClock()
{
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

	return { timeSinceLastFrameSec, dtWall };
}

void RenderPipeline::applyTransportModifiers( const AudioFeatures &audio, float &timeSinceLastFrameSec, float dtWall )
{
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

}

void RenderPipeline::updateTitleReveal( const AudioFeatures &audio, float dtWall )
{
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


}

AudioFeatures RenderPipeline::conditionAudio( const AudioFeatures &audio, float timeSinceLastFrameSec )
{
    // Audio-reactive motion, envelopes, the beat PLL and the colour-chase
    // phase: all delegated to AudioConditioner (moved out of paint() to keep
    // this function to the scheduling/render pipeline). update() must be
    // called exactly once per frame, in frame order -- every signal in there
    // is an integrator or a slew limiter.
    AudioConditioner::Context acCtx;
    acCtx.globalTime   = m_globaltime;
    acCtx.trailDepth3D = m_trailDepth3D;
    acCtx.meshUp       = m_meshUp;
    acCtx.reactivity   = s_reactivity;
    acCtx.latencyLead  = s_latencyLead;
    acCtx.ssmHead      = m_sims.ssmHeadNorm();
    acCtx.ssmFill      = m_sims.ssmFillNorm();
    acCtx.spectroHead  = m_sims.spectroHeadNorm();
    acCtx.spectroFill  = m_sims.spectroFillNorm();
    return m_audioConditioner.update( audio, timeSinceLastFrameSec, acCtx );


}

void RenderPipeline::updateImageState( float timeSinceLastFrameSec )
{
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
			if( m_audioConditioner.downbeatTick() || m_pendingImgAge > 2.5f || m_audioConditioner.gate() < 0.25f )
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


			m_interpolationTexture = 1.0;

            m_timeTextureInterpolation = (float) ((m_timeTextureInterpolationMax > m_timeTextureInterpolationMin)
                ? m_timeTextureInterpolationMin + (qrand() % (m_timeTextureInterpolationMax - m_timeTextureInterpolationMin))
                : m_timeTextureInterpolationMin) / m_timingScale;   // min==max would be % 0
		}
	}
    
}

SceneScheduler::Tick RenderPipeline::buildSchedulerTick( const AudioFeatures &audio, float timeSinceLastFrameSec )
{
/*********************** Szenen-Wahl: SceneScheduler ***********************/

	// Trigger (Novelty/Section/Drop, Pin) + Effekt-Zustandsmaschine.  Der
	// Combine-Teil (tickFx) laeuft weiter NACH den Effekt-Passes, weil
	// erst dort m_trueStereoHold entsteht.
	SceneScheduler::Tick schedTick;
	schedTick.dt             = timeSinceLastFrameSec;
	schedTick.downbeatTick   = m_audioConditioner.downbeatTick();
	schedTick.gateSmooth     = m_audioConditioner.gate();
	schedTick.timingScale    = m_timingScale;
	schedTick.pinned         = s_pinned;
	schedTick.harmonicChange = audio.harmonicChange;
	schedTick.musicPresence  = audio.musicPresence;
	schedTick.sectionCount   = audio.sectionCount;
	schedTick.sectionId      = audio.sectionId;
	schedTick.sectionKnown   = audio.sectionKnown;
	schedTick.dropCount      = audio.dropCount + m_audioConditioner.fakeDropCount();
	schedTick.rhythmStrength = audio.rhythmStrength;
	schedTick.estimatedBPM   = audio.estimatedBPM;
	schedTick.logAttackTime  = audio.logAttackTime;
	m_scheduler.tick( schedTick );
    

	return schedTick;
}

void RenderPipeline::stepSimulations( const AudioFeatures &audio, float timeSinceLastFrameSec, const AudioFeatures &audioFx )
{
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
		simFrame.audioAdvance = audioFx.audioAdvance;
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

	// ---- Previous-frame feedback (opt-in via texPrevFrame) ----
	// m_texTrail[] is otherwise an internal detail of the global echo-warp
	// trails pass below (Engine/Feedback.frag); a scene can additionally
	// sample LAST frame's fully composited image directly by declaring
	// texPrevFrame. m_trailIdx has not been swapped for THIS frame yet at
	// this point in paint(), so m_texTrail[1-m_trailIdx] still holds exactly
	// that (the trails pass swaps it further down, after drawWindow()).
	glActiveTexture( GL_TEXTURE0 + 34 );
	glBindTexture( GL_TEXTURE_2D, m_texTrail[1 - m_trailIdx] );
	glActiveTexture( GL_TEXTURE0 );

	// ---- Deep-zoom Mandelbrot (opt-in via texMandelbrot) ----
	// Bound directly here rather than through the generic ComputeFX kind
	// table (see ComputeFX::stepMandelbrot()'s comment): units 0-31 are
	// already fully claimed on a 32-texture-unit GPU, so this sim gets its
	// own dedicated unit the same way texBake/texPrevFrame already do.
	{
		bool wantMandelbrot = m_effectTextures[m_scheduler.actTexture()]->usesMandelbrot();
		if( m_scheduler.texState() != 0 )
			wantMandelbrot |= m_effectTextures[m_scheduler.nextTexture()]->usesMandelbrot();
		if( wantMandelbrot )
		{
			GLuint mbTex = m_cfx.stepMandelbrot( audio, timeSinceLastFrameSec,
			                                     m_globaltime, m_width, m_height );
			if( mbTex )
			{
				glActiveTexture( GL_TEXTURE0 + 35 );
				glBindTexture( GL_TEXTURE_2D, mbTex );
				glActiveTexture( GL_TEXTURE0 );
			}
		}
	}

}

void RenderPipeline::bindSceneInputs()
{
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	glActiveTexture(GL_TEXTURE0);
	glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_actTex );


	glActiveTexture(GL_TEXTURE1);
	glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_nextTex );


}

void RenderPipeline::updateTrueStereoState()
{
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
		                   && m_scheduler.fxState() == 0;
		m_trueStereoNow    = m_trueStereoPacked && texSolo;
	}

}

	// Per-eye scene render into the SBS/TB halves of the bound FBO
	// (scissored, so each eye's clear stays inside its half).  Eye
	// separation scales with the stereo-depth knob (keys c/m).
	
void RenderPipeline::renderSceneStereo( EffectShader *fx )
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
}

void RenderPipeline::renderActiveScenePass( const AudioFeatures &audioFx )
{
	// MSAA: 3D scenes draw into the shared multisample scratch target instead
	// of the regular FBO, then resolve (blit) into it once opaque drawing is
	// done -- OIT/rig2/combine/depth-post all keep reading the same regular
	// textures as always, unaware AA ever happened. 2D effects never touch
	// this at all (no geometric edges to smooth). True-stereo eye-packed
	// frames are excluded too: the scissored halves would each need their own
	// resolve, and the packed frame already halves the sampling rate per eye.
	bool tex1Is3D = m_effectTextures[m_scheduler.actTexture()]->is3D();
	bool msaaTex1 = tex1Is3D && !m_trueStereoPacked;
	if( msaaTex1 )
		ensureMsaaTargets( m_width, m_height );
	msaaTex1 = msaaTex1 && m_msaaReady;

	//Do the FBO Stuff
	glBindFramebuffer( GL_FRAMEBUFFER, msaaTex1 ? m_msaaFbo : m_fboEffectTexture1 );

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
		glBindFramebuffer( GL_FRAMEBUFFER, msaaTex1 ? m_msaaFbo : m_fboEffectTexture1 );
	}
	// Second, independent shadow-casting light (studio-style two-light setup);
	// same scope as light 1 -- the active scene only, never the cross-fading
	// "next" one.
	updateLightMatrix2( m_globaltime );
	if( m_effectTextures[m_scheduler.actTexture()]->usesShadow2() )
	{
		renderShadowPass2( m_effectTextures[m_scheduler.actTexture()] );
		glBindFramebuffer( GL_FRAMEBUFFER, msaaTex1 ? m_msaaFbo : m_fboEffectTexture1 );
	}

	EffectShader::s_depthValid[0] = tex1Is3D ? 1.f : 0.f;
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

	if( msaaTex1 )
	{
		resolveMsaa( m_fboEffectTexture1, m_width, m_height );
		checkGLErrors("resolveMsaa() 1");
	}

	// Transparent geometry goes in afterwards, over the opaque frame this scene
	// just produced and against the depth it just wrote.
	if( !m_trueStereoPacked && m_effectTextures[m_scheduler.actTexture()]->usesOit() )
		renderOitPass( m_effectTextures[m_scheduler.actTexture()],
		               m_depthTexEffect1, m_fboEffectTexture1 );

	checkGLErrors("createTextures() 1");

	//Now Use Final Rendering
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	checkFramebufferStatus();

}

void RenderPipeline::renderNextScenePass( const AudioFeatures &audioFx )
{
	// Skip the "next" texture effect while NOT cross-fading: every combine weights
	// this output (tex1) by (1-interpolation), which is 0 at interpolation==1.0, so
	// it is invisible.  Saves a whole effect pass during the common solo periods.
	EffectShader::s_depthValid[1] = 0.f;
	if( m_scheduler.texState() != 0 )
	{
		bool tex2Is3D = m_effectTextures[m_scheduler.nextTexture()]->is3D();
		bool msaaTex2 = tex2Is3D && !m_trueStereoPacked;
		if( msaaTex2 )
			ensureMsaaTargets( m_width, m_height );
		msaaTex2 = msaaTex2 && m_msaaReady;

		//Do the FBO Stuff
		glBindFramebuffer( GL_FRAMEBUFFER, msaaTex2 ? m_msaaFbo : m_fboEffectTexture2 );

		EffectShader::s_depthValid[1] = tex2Is3D ? 1.f : 0.f;
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

		if( msaaTex2 )
		{
			resolveMsaa( m_fboEffectTexture2, m_width, m_height );
			checkGLErrors("resolveMsaa() 2");
		}
	}

	
}

GLuint RenderPipeline::prepareFxInputs()
{
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );

	// 2D CAMERA RIG: if a scene carries rig2* formulas, the FX pass gets the
	// TRANSFORMED frame instead.  Never on eye-packed frames (warping a
	// packed stereo frame shears the two eyes against each other), and the
	// "next" slot only when its pass actually rendered this frame.
	GLuint fxTex1 = m_texIDFBOEffectTexture1;
	GLuint fxTex2 = m_texIDFBOEffectTexture2;
	if( !m_trueStereoPacked )
	{
		fxTex1 = rig2Transform( m_effectTextures[m_scheduler.actTexture()],
		                             m_texIDFBOEffectTexture1, 0 );
		if( m_scheduler.texState() != 0 )
			fxTex2 = rig2Transform( m_effectTextures[m_scheduler.nextTexture()],
			                             m_texIDFBOEffectTexture2, 1 );
		glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
		glViewport( 0, 0, m_width, m_height );
	}

	glActiveTexture(GL_TEXTURE3);
	glBindTexture( GL_TEXTURE_2D, fxTex1 );

	glActiveTexture(GL_TEXTURE4);
	glBindTexture( GL_TEXTURE_2D, fxTex2 );

	// The matching depth buffers.  Bound unconditionally: they are two texture
	// binds, and a shader that ignores them never declares the samplers.
	glActiveTexture(GL_TEXTURE0 + 29);
	glBindTexture( GL_TEXTURE_2D, m_depthTexEffect1 );
	glActiveTexture(GL_TEXTURE0 + 30);
	glBindTexture( GL_TEXTURE_2D, m_depthTexEffect2 );
	glActiveTexture(GL_TEXTURE0);

	return fxTex1;
}

void RenderPipeline::renderStereoMixPass()
{
	// Packed 3D<->3D cross-fade: plain per-pixel mix of the two
	// eye-packed frames — same endpoint weighting as the Crossfade
	// transition, but guaranteed warp-free.
	glUseProgram( m_stereoMixProgId );
	if( m_stereoMixTexAUni >= 0 ) glUniform1i( m_stereoMixTexAUni, 3 );
	if( m_stereoMixTexBUni >= 0 ) glUniform1i( m_stereoMixTexBUni, 4 );
	if( m_stereoMixResUni  >= 0 ) glUniform2f( m_stereoMixResUni,
	                                           (float)m_width, (float)m_height );
	if( m_stereoMixWUni    >= 0 ) glUniform1f( m_stereoMixWUni,
	                                           m_scheduler.texInterp() );
	drawWindow();
}

GLuint RenderPipeline::renderTransitionPass( const AudioFeatures &audioFx, GLuint fxTex1 )
{
	// TRANSITION pass (only during a scene fade): the rolled Transitions/
	// shader blends outgoing (tex0, unit 3) and incoming (tex1, unit 4)
	// scene into its own FBO.  While a scene plays solo the pass is
	// skipped entirely and the overlays read the scene frame directly.
	GLuint sceneTex = fxTex1;
	if( m_scheduler.texState() != 0 && !m_effectTransitions.empty() )
	{
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboTransition );
		EffectShader *tr = m_effectTransitions[m_scheduler.actTransition()];
		tr->enableShader();
		tr->setUniforms( m_globaltime, m_scheduler.texInterp(), 3, 4 );
		tr->applyAudioFeatures( audioFx );
		tr->draw();
		sceneTex = m_texIDFBOTransition;
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx1 );
	}

	return sceneTex;
}

void RenderPipeline::renderOverlayPass( const AudioFeatures &audioFx, GLuint sceneTex )
{
	// OVERLAY pass: the combine/FX shader reads the FINISHED scene.  Both
	// units carry the same texture and interpolation is pinned to 1.0
	// ("old scene fully visible"), so overlays never see a half-blended
	// pair — scene mixing is entirely the transition pass's job now.
	glActiveTexture(GL_TEXTURE3);
	glBindTexture( GL_TEXTURE_2D, sceneTex );
	glActiveTexture(GL_TEXTURE4);
	glBindTexture( GL_TEXTURE_2D, sceneTex );
	glActiveTexture(GL_TEXTURE0);

	m_effectFx[m_scheduler.actFx()]->enableShader();
	m_effectFx[m_scheduler.actFx()]->setUniforms( m_globaltime, 1.0f, 3, 4 );
	m_effectFx[m_scheduler.actFx()]->applyAudioFeatures( audioFx );
	m_effectFx[m_scheduler.actFx()]->draw();
}

void RenderPipeline::renderNextOverlayPass( const AudioFeatures &audioFx )
{
	// Skip the "next" combine while NOT cross-fading combines: the final blend
	// pass (Engine/OverlayBlend.frag) weights this output by (1-interpolation),
	// which is 0 at interpolation==1.0, so it is invisible.  Saves the second
	// combine pass.  Units 3/4 still hold the finished scene from the pass
	// above; interpolation stays pinned at 1.0 like for the active overlay.
	if( m_scheduler.fxState() != 0 )
	{
		m_effectFx[m_scheduler.nextFx()]->enableShader();
		m_effectFx[m_scheduler.nextFx()]->setUniforms( m_globaltime, 1.0f, 3, 4 );
		m_effectFx[m_scheduler.nextFx()]->applyAudioFeatures( audioFx );
		m_effectFx[m_scheduler.nextFx()]->draw();
	}
}

void RenderPipeline::renderFxStage( const AudioFeatures &audioFx )
{
	const GLuint fxTex1 = prepareFxInputs();

	glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx1 );

	if( m_trueStereoNow )
	{
		// True stereo: the eye-packed 3D frame passes through UNTOUCHED (any
		// transition/overlay warp would fold content across the eye boundary).
		blitTexture( m_texIDFBOEffectTexture1 );
	}
	else if( m_trueStereoPacked && m_stereoMixProgId != 0 )
	{
		renderStereoMixPass();
	}
	else
	{
		// Order matters: the overlay reads the FINISHED scene, so the
		// transition has to have produced it first.
		const GLuint sceneTex = renderTransitionPass( audioFx, fxTex1 );
		renderOverlayPass( audioFx, sceneTex );
	}

	checkGLErrors("createFx() 1");

	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	checkFramebufferStatus();

	glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx2 );
	renderNextOverlayPass( audioFx );
}


void RenderPipeline::renderFinalBlend()
{
	//Now Use Final Rendering — into the safety FBO if active, else to the screen.
	GLuint fxTarget = m_present.ready() ? m_present.targetFbo() : m_defaultFBO;
	glBindFramebuffer( GL_FRAMEBUFFER, fxTarget );
	checkFramebufferStatus();

	/*******************************************************************************/

	glUseProgram( m_sh_prog_id_fx );
	// restore render destination to regular frame buffer
	glViewport( 0, 0, m_width, m_height );


	glUniform1i( m_texPointFxUni1, 5 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointFxUni2, 6 );		// texture Unit 0, nicht mit texId verwechseln
	glUniform2f( m_texSizeRcpFxUni, (float) m_width, (float) m_height );
    glUniform1f( m_interpolationFxUni, m_scheduler.fxInterp() );
	glUniform1f( m_timeFxUni, m_globaltime );



	glActiveTexture(GL_TEXTURE5);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectFx1 );
	
	glActiveTexture(GL_TEXTURE6);
	glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectFx2 );

	drawWindow();

}

GLuint RenderPipeline::renderTrailsPass( const AudioFeatures &audio, const AudioFeatures &audioFx, float timeSinceLastFrameSec, float dtWall )
{
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
		// A loaded model gets almost no feedback trail. The trail layer's warp
		// field deliberately rides the beat (ripple below), which on abstract
		// material is the liquid MilkDrop look -- but on a solid object it
		// drags beat-synced after-images across the hull, and that reads as
		// the OBJECT twitching (reported three times before the cause was
		// found). Slewed via m_meshUp, so cross-fades ease it in and out.
		decay *= 1.f - 0.85f * m_meshUp;
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
			float zoom = 1.0f + (0.05f + 0.22f * m_audioConditioner.beatSmooth()
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
				// Same shape, but for loaded-model scenes only: drives the
				// time-echo damping in the present pass (see EffectShader::
				// isMeshScene). Slewed on the same ramp so a cross-fade eases
				// it rather than switching it.
				bool meshUp = m_effectTextures[m_scheduler.actTexture()]->isMeshScene()
				           || ( m_scheduler.texState() != 0
				                && m_effectTextures[m_scheduler.nextTexture()]->isMeshScene() );
				m_meshUp = slewToward( m_meshUp, meshUp ? 1.f : 0.f, 2.5f, dtWall );
				// Dev hook: KALEIDO_CALM=1 pins the damping to full on EVERY
				// scene -- one switch that silences all beat-driven full-frame
				// motion (camera punch/shake/sway, trail warp, time echo). Used
				// for A/B-proving which channel a residual twitch comes from.
				{
					static int s_calm = -1;
					if( s_calm < 0 )
						s_calm = getenv( "KALEIDO_CALM" ) ? 1 : 0;
					if( s_calm == 1 )
						m_meshUp = 1.f;
				}
				if( m_trailDepthUni >= 0 )
					glUniform1f( m_trailDepthUni, m_trailDepth3D );
			}
			// MilkDrop-style spatial warp field: the liquid feedback look.
			// Ripple rides the beat, the swirl direction swings very slowly,
			// the flow field breathes with the music; all phases are
			// integrated (no flicker), all amplitudes are per-frame (x dt).
			{
				m_warpRipplePhase += dtf * ( 2.0f + 5.0f * m_audioConditioner.beatSmooth() );
				m_warpFlowPhase   += dtf * 0.55f;
				// Displacement VELOCITIES (uv/s resp. rad/s), applied per
				// frame; they accumulate through the feedback loop.
				float rip  = ( 0.05f * m_audioConditioner.beatSmooth()
				             + 0.10f * audioFx.dropPulse ) * dtf;
				float swl  = 0.25f * sinf( m_globaltime * 0.013f )
				           * ( 0.4f + 0.6f * audio.ambientFactor ) * dtf;
				float flw  = ( 0.02f + 0.05f * audio.ambientFactor
				             + 0.04f * audioFx.swell ) * dtf;
				// Scale with the trails knob (no trails -> no warp) and gate
				// out of the packed true-stereo frames entirely.
				float g = s_trailAmount * audio.musicPresence;
				// Same damping as the trail decay above: no beat-warp field over
				// a loaded model (see the m_meshUp comment there).
				g *= 1.f - 0.85f * m_meshUp;
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

	return presentSource;
}

void RenderPipeline::runPresentPass( GLuint presentSource, const AudioFeatures &audio, const AudioFeatures &audioFx, float timeSinceLastFrameSec, float dtWall )
{
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
		pin.chasePhase   = m_audioConditioner.chasePhase();
		pin.camZoom      = m_audioConditioner.camZoom();  pin.camRot  = m_audioConditioner.camRot();
		pin.camOffX      = m_audioConditioner.camOffX();  pin.camOffY = m_audioConditioner.camOffY();
		pin.stereoPacked = m_trueStereoPacked;
		pin.stereoMode   = s_stereoMode;
		pin.stereoDepth  = s_stereoDepth;
		pin.blackout     = s_blackout;
		pin.breakSmooth  = m_breakSmooth;
		pin.fadeOutEnv   = audioFx.fadeOut;
		pin.moodStrength = s_moodStrength;
		pin.lightShow    = s_lightShow;
		pin.renderScale  = s_renderScale;
		pin.lyricsAlpha   = m_overlay.lyricsAlpha;
		pin.lyricsScrollV = m_overlay.lyricsScrollV;
		pin.lyricsAspect  = m_overlay.lyricsAspect;
		pin.lyricsHlV0    = m_overlay.lyricsHlV0;
		pin.lyricsHlV1    = m_overlay.lyricsHlV1;
		pin.lyricsHlProg  = m_overlay.lyricsHlProg;
		pin.lyricsUScale  = m_overlay.lyricsUScale;
		pin.lyricsFocusV0 = m_overlay.lyricsFocusV0;
		pin.lyricsFocusV1 = m_overlay.lyricsFocusV1;
		pin.lyricsScrollU = m_overlay.lyricsScrollU;
		pin.artistAlpha   = m_overlay.artistAlpha;
		pin.artistAspect  = m_overlay.artistAspect;
		// Zeit-Regie: Rewind/Echo/Breath.  Das Zeitecho traeumt in Ambient-
		// Passagen und blitzt nach einem Drop als Flashback auf; waehrend
		// eines Rewinds pausiert es (History auf History waere Matsch).
		pin.rewindSecs = m_audioConditioner.rewindBack();
		pin.rewindMix  = m_audioConditioner.rewindMix();
		pin.echoAmt    = std::max( 0.50f * audioFx.dropPulse,
		                           0.20f * audio.ambientFactor * audio.musicPresence )
		               * ( 1.f - m_audioConditioner.rewindMix() );
		// ...but barely, while a loaded model is on screen. The echo blends the
		// frame from 1.4 s ago at 4.5 % larger scale, which on an abstract
		// scene is a dreamy after-image and on a solid object is a bigger,
		// half-transparent twin -- a thing no physical object has, so it reads
		// as a rendering fault rather than as an effect. Slewed on the same
		// 2.5/s ramp as m_trailDepth3D so a cross-fade into or out of a mesh
		// scene eases the damping in rather than switching it.
		pin.echoAmt *= ( 1.f - 0.85f * m_meshUp );
		if( m_audioConditioner.echoOverride() >= 0.f )
			pin.echoAmt = m_audioConditioner.echoOverride();
		pin.echoDelay  = 1.4f;
		pin.breath     = m_audioConditioner.breath();
		// Welle 2: Letterbox, Schockwelle, Cover-Palette, Zeilen-Slam,
		// 2.5D-Parallaxe (Tiefe der AKTIVEN Szene; eine 2D-Szene hat auf
		// die Fernebene geloeschte Tiefe -> Parallaxe neutralisiert sich).
		pin.letterbox    = m_audioConditioner.letterbox();
		pin.shockR       = m_audioConditioner.shockR();
		pin.shockAmp     = m_audioConditioner.shockAmp();
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

}

void RenderPipeline::paint(const float *rotMatrix, float tx, float ty, float tz,
                         const AudioFeatures &audio)
{
	beginFrame( audio );
	updateLiveInput();
	updateTimingScale( audio );

	const FrameTiming ft = readFrameClock();
	float       timeSinceLastFrameSec = ft.dt;
	const float dtWall                = ft.dtWall;
	// A frame far beyond any real frame rate is a STALL (first-activation
	// shader compile + mesh load, a driver recompile, a suspend), not time the
	// viewer spent watching. Subtract it from the scheduler's wall clocks, or
	// the fade completes inside the frozen frame and the minimum solo is
	// already used up when the picture returns. 0.16 s stays on the books --
	// a legitimately slow frame's worth.
	if( dtWall > 0.4f )
		m_scheduler.absorbHitch( dtWall - 0.16f );
	applyTransportModifiers( audio, timeSinceLastFrameSec, dtWall );
	updateTitleReveal( audio, dtWall );

	const AudioFeatures audioFx = conditionAudio( audio, timeSinceLastFrameSec );
	updateImageState( timeSinceLastFrameSec );

	const SceneScheduler::Tick schedTick = buildSchedulerTick( audio, timeSinceLastFrameSec );

	// Asynchronous mesh warm-up: while the fade's INCOMING scene is still
	// waiting for its model (worker thread, see Scene3DShader), hold the
	// scheduler clocks so the fade stays parked at its start -- the
	// outgoing scene keeps playing, nothing freezes, and the fade then
	// runs in full once the model is in. Past the timeout the fade is
	// released regardless; draw() keeps skipping the unbuilt mesh, so at
	// worst the object appears late, but the show never wedges on a
	// stuck load.
	if( m_scheduler.texState() != 0 )
	{
		EffectShader *nx = m_effectTextures[m_scheduler.nextTexture()];
		if( nx->meshWarmupPending() )
		{
			nx->requestMeshWarmup();
			m_meshHoldSecs += dtWall;
			if( m_meshHoldSecs < 5.f )
				m_scheduler.absorbHitch( dtWall );
		}
		else
			m_meshHoldSecs = 0.f;
	}
	else
		m_meshHoldSecs = 0.f;

	// The one clock every shader reads. It advances AFTER the transport
	// modifiers above, so a freeze ('e') or a DJ-stop really does stop it.
	m_globaltime += timeSinceLastFrameSec;

	stepSimulations( audio, timeSinceLastFrameSec, audioFx );
	bindSceneInputs();
	updateTrueStereoState();

	renderActiveScenePass( audioFx );
	renderNextScenePass( audioFx );
	glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
	checkFramebufferStatus();

	// The combine half of the scheduler tick, deliberately AFTER both scene
	// passes: it needs m_trueStereoHold, which only exists once they ran.
	m_scheduler.tickFx( schedTick, m_trueStereoHold );

	renderFxStage( audioFx );
	renderFinalBlend();

	const GLuint presentSource =
		renderTrailsPass( audio, audioFx, timeSinceLastFrameSec, dtWall );

	// Spout output (-o): publish the displayed frame for OBS / Resolume etc.
	// (Needs the GL context, which is current here; texture-share via DX interop.)
	if( s_spoutEnabled )
	{
		if( !m_spoutStarted )
			m_spoutStarted = spoutOutInit( "Kaleidoscope" );
		spoutOutSend( presentSource, m_width, m_height );
	}

	runPresentPass( presentSource, audio, audioFx, timeSinceLastFrameSec, dtWall );
	checkGLErrors("paint() 2");
}

void RenderPipeline::drawScene(const float *rotMatrix, float tx, float ty, float tz)
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

void RenderPipeline::drawWindow()
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
// texture through Engine/Rig2D.frag and returns THAT; the caller simply
// binds the returned id, so nothing is copied back and no other consumer
// of the original texture is affected.  Off (returns src) when the scene
// has no rig2 formulas — zero extra cost for the whole existing catalogue.
GLuint RenderPipeline::rig2Transform( EffectShader *fx, GLuint srcTex, int slot )
{
	float rig[4];
	if( !fx || !fx->rig2( rig ) )
		return srcTex;

	static GLuint prog = 0;
	static GLint  uTex = -1, uRoll = -1, uZoom = -1, uPan = -1, uRes = -1;
	if( prog == 0 )
	{
		prog  = setShaders( "..\\standard.vert", "..\\Engine\\Rig2D.frag" );
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
	checkGLErrors( "RenderPipeline::rig2Transform" );
	return m_rig2Tex[slot];
}

void RenderPipeline::blitTexture( GLuint tex )
{
	// Tiny dedicated blit program (fixed-function texturing is gone in core).
	static GLuint blitProg = 0;
	static GLint  blitTexUni = -1;
	if( blitProg == 0 )
	{
		blitProg   = setShaders( "..\\standard.vert", "..\\Engine\\Blit.frag" );
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
bool RenderPipeline::ensureShadowMapGeneric( GLuint &fbo, GLuint &tex )
{
	if( fbo != 0 )
		return true;

	glGenTextures( 1, &tex );
	glBindTexture( GL_TEXTURE_2D, tex );
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

	glGenFramebuffers( 1, &fbo );
	glBindFramebuffer( GL_FRAMEBUFFER, fbo );
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
	                        GL_TEXTURE_2D, tex, 0 );
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
		glDeleteFramebuffers( 1, &fbo );
		glDeleteTextures( 1, &tex );
		fbo = tex = 0;
	}
	return ok;
}

// Orthographic projection along a slowly turning light direction, covering a
// fixed cube at the origin.  Orthographic and not perspective because this is a
// SUN: its rays are parallel, and a perspective shadow frustum would give the
// shadows a vanishing point that the shading does not have.
//
// Shared by both lights: angleOffset phase-shifts the orbit so light 2 never
// moves in lockstep with light 1, and tiltY lowers the base elevation (0 for
// the overhead "sun", >0 for a cooler, more side-on second light) -- see the
// updateLightMatrix()/updateLightMatrix2() wrappers in the header for the
// actual per-light parameters.
void RenderPipeline::updateLightMatrixGeneric( float t, float angleOffset, float tiltY, float *outM, float *outDir )
{
	// The ACTIVE scene's box, not the default: the map's resolution is spent
	// across it, so a small scene must get a small box or its shadows come out
	// in blocks a texel wide.
	const float E = EffectShader::s_shadowExtent;

	// Kept fairly high on purpose.  A low sun is more dramatic per shadow, but
	// shadow length goes as 1/tan(elevation) — at 37 degrees a tall object
	// throws a shadow longer than itself, and in any scene with repeated
	// geometry the ground ends up entirely dark.  (tiltY pulls this down for a
	// second light on purpose -- a lower, cooler fill reads as a second
	// distinct source rather than a copy of the sun.)
	float a = t * 0.06f + angleOffset;
	float lx = 0.42f * sinf( a );
	float ly = ( 1.15f - tiltY ) + 0.16f * sinf( a * 0.43f );
	float lz = -0.42f * cosf( a ) - 0.18f;
	float ln = sqrtf( lx * lx + ly * ly + lz * lz );
	lx /= ln; ly /= ln; lz /= ln;
	outDir[0] = lx;
	outDir[1] = ly;
	outDir[2] = lz;

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

	// outM = P * V, column-major.
	for( int c = 0; c < 4; ++c )
		for( int r = 0; r < 4; ++r )
		{
			float sum = 0.f;
			for( int k = 0; k < 4; ++k )
				sum += P[k * 4 + r] * V[c * 4 + k];
			outM[c * 4 + r] = sum;
		}
}

// Draw one 3D scene into a shadow map, depth only. Shared by both lights --
// see renderShadowPass()/renderShadowPass2() in the header for which FBO/
// texture/unit/pass-flag each one binds.
void RenderPipeline::renderShadowPassGeneric( EffectShader *fx, GLuint &fbo, GLuint tex, int texUnit, float &passFlag )
{
	if( !ensureShadowMapGeneric( fbo, tex ) )
		return;

	glBindFramebuffer( GL_FRAMEBUFFER, fbo );
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

	passFlag = 1.f;
	fx->enableShader();
	fx->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
	fx->applyAudioFeatures( m_lastAudioFx );
	fx->draw();
	passFlag = 0.f;

	glActiveTexture( GL_TEXTURE0 + texUnit );
	glBindTexture( GL_TEXTURE_2D, tex );
	glActiveTexture( GL_TEXTURE0 );

	glViewport( 0, 0, m_width, m_height );
}

// Allocate the two accumulation targets weighted-blended OIT needs.
bool RenderPipeline::ensureOitTargets()
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
		m_oitResolveProg = setShaders( "..\\standard.vert", "..\\Engine\\OitResolve.frag" );

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
void RenderPipeline::renderOitPass(EffectShader *fx, GLuint depthTex, GLuint targetFbo)
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

void RenderPipeline::initFBO(GLuint &fboEffect, GLuint &texIDEffectTexture, GLuint *depthRb)
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


void RenderPipeline::ensureMsaaTargets( int w, int h )
{
	if( m_msaaReady && m_msaaW == w && m_msaaH == h )
		return;

	if( !m_msaaTried )
	{
		m_msaaTried = true;
		if( !glTexImage2DMultisample )
		{
			fputs( "MSAA: glTexImage2DMultisample unavailable -- 3D scenes render unaliased\n", stderr );
			return;
		}
		GLint maxSamples = 0;
		glGetIntegerv( GL_MAX_SAMPLES, &maxSamples );
		m_msaaActualSamples = std::min( kMsaaSamples, maxSamples );
		if( m_msaaActualSamples < 2 )
		{
			fputs( "MSAA: GL_MAX_SAMPLES < 2 -- 3D scenes render unaliased\n", stderr );
			m_msaaActualSamples = 0;
			return;
		}
	}
	if( m_msaaActualSamples == 0 )   // permanent soft-fail from the first attempt
		return;

	m_msaaW = w; m_msaaH = h;

	if( m_msaaColorTex == 0 ) glGenTextures( 1, &m_msaaColorTex );
	glBindTexture( GL_TEXTURE_2D_MULTISAMPLE, m_msaaColorTex );
	glTexImage2DMultisample( GL_TEXTURE_2D_MULTISAMPLE, m_msaaActualSamples,
	                          m_texInternalFormat, w, h, GL_TRUE );

	if( m_msaaDepthTex == 0 ) glGenTextures( 1, &m_msaaDepthTex );
	glBindTexture( GL_TEXTURE_2D_MULTISAMPLE, m_msaaDepthTex );
	glTexImage2DMultisample( GL_TEXTURE_2D_MULTISAMPLE, m_msaaActualSamples,
	                          GL_DEPTH_COMPONENT24, w, h, GL_TRUE );
	glBindTexture( GL_TEXTURE_2D_MULTISAMPLE, 0 );

	if( m_msaaFbo == 0 ) glGenFramebuffers( 1, &m_msaaFbo );
	glBindFramebuffer( GL_FRAMEBUFFER, m_msaaFbo );
	glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint,
	                         GL_TEXTURE_2D_MULTISAMPLE, m_msaaColorTex, 0 );
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
	                         GL_TEXTURE_2D_MULTISAMPLE, m_msaaDepthTex, 0 );
	m_msaaReady = checkFramebufferStatus();
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );

	if( !m_msaaReady )
		fputs( "MSAA: scratch FBO incomplete -- 3D scenes render unaliased\n", stderr );
}


void RenderPipeline::resolveMsaa( GLuint dstFbo, int w, int h )
{
	glBindFramebuffer( GL_READ_FRAMEBUFFER, m_msaaFbo );
	glBindFramebuffer( GL_DRAW_FRAMEBUFFER, dstFbo );
	// Straight 1:1 pixel resolve (source and destination are the same size),
	// so the filter argument never actually interpolates anything -- GL_NEAREST
	// because glBlitFramebuffer requires it for the depth bits regardless, and
	// blitting colour and depth together needs one shared filter.
	glBlitFramebuffer( 0, 0, w, h, 0, 0, w, h,
	                    GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT, GL_NEAREST );
	glBindFramebuffer( GL_FRAMEBUFFER, dstFbo );
}


void RenderPipeline::loadNewTexture( GLuint &texID )
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


    //printf( "%s\n", qPrintable((*m_imageListIterator)) );

	
	//printf( "Texture: %f\n", timeSetup );
	//printf( "Texture: Del: %f, Gen %f, Set %f\n", timeDelete, timeGen, timeSetup );
}


void RenderPipeline::createFBOTexture( GLuint &texID )
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
QImage RenderPipeline::fallbackImage()
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

// Robustness: a corrupt/unreadable photo (bad JPEG, a file caught mid-copy,
// a dropped network share) makes QImage's load fail and return a null 0x0
// image. prepareImage() would then hand back a null image too (scaled() on
// null stays null), and setupTexture() relies on ALWAYS getting a real
// 1024x1024 image on the first two uploads to size the GL texture storage
// correctly for every later glTexSubImage2D reuse -- a null image there
// permanently breaks the photo texture (0x0 storage, GL_INVALID_VALUE from
// then on). Load through here instead of a bare QImage(path) wherever the
// result feeds setupTexture()/prepareImage().
static QImage loadImageOrFallback( const QString &path )
{
	QImage img( path );
	if( img.isNull() )
	{
		fprintf( stderr, "WARNING: unreadable image '%s' - using the "
		                 "procedural fallback for this slot.\n", qPrintable( path ) );
		img = RenderPipeline::fallbackImage();
	}
	return img;
}

void RenderPipeline::createTexture()
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
    setupTexture( m_actTex, prepareImage( loadImageOrFallback( *m_imageListIterator ) ) );
    fprintf( stderr, "PHOTO %s\n", qPrintable((*m_imageListIterator)) );

	m_imageListIterator++;
    if(m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_nextTex, prepareImage( loadImageOrFallback( *m_imageListIterator ) ) );
    fprintf( stderr, "PHOTO %s\n", qPrintable((*m_imageListIterator)) );

	/*m_imageListIterator++;
    if(m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_texID3, QImage( (*m_imageListIterator) ) );*/

	// set texenv mode from modulate (the default) to replace)
	//rwrw glTexEnvi( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );

    // check if something went completely wrong
    checkGLErrors("createTextures() 1");
}

void RenderPipeline::traverse( const QString& dirname, QStringList& imageList )
{
  // Every photo folder reaches the walk here, including the preset's own
  // "..\\Images". On POSIX a backslash is not a separator, so an unnormalised
  // path silently walks an EMPTY directory rather than failing loudly.
  QDir dir( Platform::assetPath( dirname ) );
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
		// Case-INSENSITIVE, and .jpeg too. The comparison used to be exact,
		// so a library holding IMG_0001.JPG or anything saved as .jpeg was
		// silently half-empty with nothing to say why.
		const QString ext = fi.suffix().toLower();
		if( ext == "png" || ext == "jpg" || ext == "jpeg" )
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


void RenderPipeline::setupFBOTexture( const GLuint texID )
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



void RenderPipeline::setupTexture( const GLuint texID, const QImage &image )
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
	// WHY glTexImage2D only the first two times: m_actTex and m_nextTex are the
	// only two textures this ever writes, and prepareImage() (Utils.cpp) always
	// hands back a fixed 1024x1024 ARGB32 image regardless of the source photo's
	// size — so the storage glTexImage2D allocates on those first two calls is
	// guaranteed to fit every later photo too, and glTexSubImage2D can safely
	// reuse it (cheaper: no reallocation) for every subsequent load.
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
void RenderPipeline::initGLSL()
{
	// ---- texture-unit budget diagnostic -------------------------------------
	// The pipeline hands out fixed unit numbers well above 31 (shadow map 2 on
	// 32, texPrevFrame on 34, the deep-zoom Mandelbrot on 35, geom="mesh"'s
	// material array on 36). Whether that is legal depends on
	// GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS, NOT on the much smaller
	// GL_MAX_TEXTURE_IMAGE_UNITS that ComputeFX prints -- the latter
	// only caps how many samplers a single fragment stage may use at once.
	// Confusing the two led to a "shadow light 2 is out of range" report that
	// the numbers below disprove. Log both, and say plainly whether the highest
	// unit we hand out actually fits, so nobody has to guess again.
	{
		GLint maxCombined = 0, maxFragment = 0;
		glGetIntegerv( GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS, &maxCombined );
		glGetIntegerv( GL_MAX_TEXTURE_IMAGE_UNITS,          &maxFragment );
		const int kHighestUnitUsed = 36;   // Scene3DShader::kMeshMaterialTexUnit; see paint()
		fprintf( stderr,
		         "GL texture units: %d combined (legal indices 0..%d), "
		         "%d per fragment stage; pipeline uses up to %d -> %s\n",
		         maxCombined, maxCombined - 1, maxFragment, kHighestUnitUsed,
		         (kHighestUnitUsed < maxCombined) ? "fits"
		                                          : "OUT OF RANGE, bindings will be dropped" );
		if( kHighestUnitUsed >= maxCombined )
			fprintf( stderr,
			         "  WARNING: shadow map 2 (unit 32), texPrevFrame (34), the "
			         "Mandelbrot sim (35) and geom=\"mesh\"'s material array (36) "
			         "cannot bind on this GPU; those features will silently read "
			         "black. Re-map them below %d.\n", maxCombined );
	}

	// load and compile shader — the final pass that blends the outgoing and
	// incoming OVERLAY outputs during a combine switch (a plain linear mix;
	// the styled variety lives in Transitions/ and fires on SCENE fades).
	m_sh_prog_id_fx = setShaders( "standard.vert", "..\\Engine\\OverlayBlend.frag" );
	// Get location of the texture samplers and point vector for future use
	m_texPointFxUni1 = glGetUniformLocation( m_sh_prog_id_fx, "tex0" );
	m_texPointFxUni2 = glGetUniformLocation( m_sh_prog_id_fx, "tex1" );
	m_texSizeRcpFxUni = glGetUniformLocation( m_sh_prog_id_fx, "resolution" );
	m_timeFxUni = glGetUniformLocation( m_sh_prog_id_fx, "time" );
    m_interpolationFxUni = glGetUniformLocation( m_sh_prog_id_fx, "interpolation" );

	
    glUseProgram( m_sh_prog_id_fx );
}


/**
 * Checks for OpenGL errors.
 * Extremely useful debugging function: When developing, 
 * make sure to call this after almost every GL call.
 */
void RenderPipeline::checkGLErrors( const char *label )
{
	// glGetError() can force a GPU/driver sync, and this is called from
	// dozens of sites every frame, so it is a no-op unless explicitly asked
	// for (KALEIDO_GL_DEBUG=1) -- e.g. while chasing exactly the kind of
	// silent failure a disabled check would otherwise hide (a null texture
	// upload, an unlinked shader program bound anyway, ...).
	static const bool enabled = qEnvironmentVariableIsSet( "KALEIDO_GL_DEBUG" );
	if( !enabled )
		return;

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
bool RenderPipeline::checkFramebufferStatus(void)
{
	// Same KALEIDO_GL_DEBUG gate as checkGLErrors() -- see there for why.
	static const bool enabled = qEnvironmentVariableIsSet( "KALEIDO_GL_DEBUG" );
	if( !enabled )
		return true;

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
void RenderPipeline::reloadFragment( const QString &bareName )
{
	auto matches = [&bareName]( EffectShader *s ) {
		QString f = QString::fromLocal8Bit( s->fragmentName() );
		f.replace( '\\', '/' );
		int i = f.lastIndexOf( '/' );
		return ((i >= 0) ? f.mid( i + 1 ) : f)
		       .compare( bareName, Qt::CaseInsensitive ) == 0;
	};
	// Forget the cached program FIRST, or every reloadShader() below would be
	// handed back the very program it is trying to replace.
	shaderCacheDrop( qPrintable( bareName ) );

	int n = 0;
	for( EffectShader *s : m_effectTextures )
		if( matches( s ) ) { s->reloadShader(); ++n; }
	for( EffectShader *s : m_effectFx )
		if( matches( s ) ) { s->reloadShader(); ++n; }
	if( n )
		fprintf( stderr, "HOT-RELOAD: %s (%d program%s)\n",
		         qPrintable( bareName ), n, (n == 1) ? "" : "s" );
}

void RenderPipeline::addTextureShader( EffectShader * shader )
{
	m_effectTextures.push_back( shader );
}


void RenderPipeline::addFxShader( EffectShader * shader )
{
	m_effectFx.push_back( shader );
}

void RenderPipeline::addTransitionShader( EffectShader * shader )
{
	m_effectTransitions.push_back( shader );
}


ImageLoader::ImageLoader( RenderPipeline *shader )
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
				m_shader->m_nextImage = prepareImage( RenderPipeline::fallbackImage() );
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

            m_shader->m_nextImage = prepareImage( loadImageOrFallback( *m_shader->m_imageListIterator ) );
			fprintf( stderr, "PHOTO %s\n", qPrintable((*m_shader->m_imageListIterator)) );
            m_shader->m_triggerImageload = false;

			//float loadingtime = timer.elapsed();
			//printf( "Time to load: %f\n", loadingtime );//rwrwdebug
        }
		else
			msleep( 50 );
    }
    
}
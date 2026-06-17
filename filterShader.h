#ifndef GENPROC_H
#define GENPROC_H

#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>

#include "mesh.h"

#include "EffectShader.h"
#include "TextureEffectKaleidoscopeBase.h"
#include "Utils.h"
#include "AudioFeatures.h"

class ImageLoader;

class FilterShader
{
public:
	FilterShader( );
	FilterShader(int width, int height, const QString &filename);
	~FilterShader();
	void loadShader(); // load shader from file, compile and link them to programs, get variable locations
	bool loadObj(const char *filename);
	/** Draw one frame.
	 *  @param audio  Optional audio analysis result.  Pass a default-constructed
	 *                AudioFeatures{} (all zero) to disable audio reactivity.
	 *                Audio-driven motion is integrated into continuous phase
	 *                offsets here (see m_audioRotPhase / m_audioAdvance) so that
	 *                changing the audio never jumps the visual.                 */
	void paint(const float *rotMatrix, float tx, float ty, float tz,
	           const AudioFeatures &audio = AudioFeatures{});

	/** The framebuffer the final image must be drawn into.  Under QOpenGLWidget
	 *  the visible buffer is NOT 0 but QOpenGLWidget::defaultFramebufferObject();
	 *  the widget passes it here every frame before paint().  Defaults to 0. */
	void setDefaultFBO( GLuint fbo ) { m_defaultFBO = fbo; }

	/** Request an early cross-fade to the next texture effect (manual 'n' key or
	 *  an automatic musical novelty trigger).  Honoured at the next opportunity. */
	void requestSceneChange() { m_forceEffectChange = true; }

	// ---- Live-tunable look parameters (shared across all configs; set by hotkeys) ----
	static void  adjustReactivity( float d ) { s_reactivity  = clampParam(s_reactivity  + d, 0.f, 3.0f); }
	static void  adjustTrails     ( float d ) { s_trailAmount = clampParam(s_trailAmount + d, 0.f, 0.95f); }
	static void  adjustMood       ( float d ) { s_moodStrength= clampParam(s_moodStrength+ d, 0.f, 2.5f); }
	static float reactivity() { return s_reactivity; }
	static float trails()     { return s_trailAmount; }
	static float mood()       { return s_moodStrength; }

	// Persist / restore the look parameters above (+ render scale) across runs.
	// loadSettings() is called at startup BEFORE the command line is parsed, so
	// explicit flags (e.g. -s) still override the saved values.
	static void  loadSettings();
	static void  saveSettings();
	void reinit(int width, int height); // full (re)build: shaders, image + FBO textures, FBOs

	// Lightweight resize: re-allocate ONLY the off-screen FBO colour textures to
	// the new size, reusing their texture IDs and FBOs.  Keeps the loaded image
	// textures and shader programs untouched and allocates no new GL objects, so
	// it can be called on every window resize without leaking or reloading images.
	void resize(int width, int height);

	// Photosensitivity-safety helpers (final present FBO + brightness limiter).
	void setupSafety();          // create the final FBO/texture/present shader
	void updateFinalTexture();   // (re)allocate the mipmapped final texture

	// GPU reaction-diffusion simulation (Gray-Scott, float ping-pong).
	void setupReactionDiffusion();                       // create float FBOs + sim shader
	void stepReactionDiffusion(const AudioFeatures &a);  // advance one PDE step per frame

	// Mood-based selection bias: accept a candidate effect with a probability that
	// depends on how well its complexity matches the current arousal (calm music →
	// simple effects, energetic → busy).  Safe: callers retry, then fall back.
	bool moodAccept(unsigned int complexity);
	float			m_lastArousal = 0.5f;   // latest arousal (for moodAccept)
	void checkGLErrors( const char *label ); // check and print gl errors to stderr

	
	void init( const QString &filename, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax, unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax );

	
	void start( int width, int height );
	void stop();

	void addCombineShader( EffectShader * shader );
	void addTextureShader( EffectShader * shader );

    
    bool        m_triggerImageload;
    bool        m_waitForImageToLoad;
    QImage      m_nextImage;

    
	QStringList 	m_imageList;
	QStringList::const_iterator m_imageListIterator;

private:

	void initFBO(GLuint &fboEffect, GLuint &texIDEffect); // initialization of framebuffer object
	void createFBOTexture( GLuint &texID );
	void setupFBOTexture( const GLuint texID );
	void createTexture();  // create and setup textures
	void setupTexture( const GLuint texID, const QImage &image ); // needed by createTextures()
public:
	// Procedural texture used when the image directory is missing/empty (robustness).
	static QImage fallbackImage();
private:
	void initGLSL(); // initialize GLSL - shader programs
	void drawScene(const float *rotMatrix, float tx, float ty, float tz);
	void drawWindow();
	void cleanShaderPrograms();
	void cleanTextures();

	bool checkFramebufferStatus(); // framebuffer status to stdout

	void traverse( const QString& dirname, QStringList& imageList );
	void loadNewTexture( GLuint &texID );


	Mesh			*m_mesh;


	bool			m_npot_supported; // non power of two textures supportet (or not)
	unsigned int	m_width; // texture width
	unsigned int	m_height; // texture height

	GLenum			m_texInternalFormat; // internal format of texture
	GLenum			m_texFormat;
	GLenum			m_texType;
	GLuint			m_fboEffectTexture1; // variable to store framebuffer object id
	GLuint			m_fboEffectTexture2; // variable to store framebuffer object id
	GLuint			m_fboEffectCombine1; // variable to store framebuffer object id
	GLuint			m_fboEffectCombine2; // variable to store framebuffer object id
	GLuint			m_depthFbo;
	GLenum			m_attachmentpoint; // where to attack framebufferobjects
	GLuint			m_texID1; // texture ids of read/write Textures
	GLuint			m_texID2;
	GLuint			m_texIDFBOEffectTexture1;
	GLuint			m_texIDFBOEffectTexture2;
	GLuint			m_texIDFBOEffectCombine1;
	GLuint			m_texIDFBOEffectCombine2;

	// Target framebuffer for the final on-screen pass (QOpenGLWidget's FBO, not 0).
	GLuint			m_defaultFBO = 0;

	// True once start() has built the GL resources, so revisiting a configuration
	// only resizes instead of rebuilding (which leaked programs/textures/FBOs and
	// spawned a duplicate ImageLoader).
	bool			m_started = false;

	// Manual / novelty-driven early scene change + its rate-limit cooldown.
	bool			m_forceEffectChange = false;
	float			m_noveltyCooldown   = 0.f;

	// ---- Photosensitivity safety: final present pass with global brightness
	// rate-limiting.  The combined frame is rendered into m_fboFinal, its average
	// luminance is read back (coarse mip), and a uniform scale is chosen so the
	// whole-frame average can't change faster than a safe limit per second.
	GLuint			m_fboFinal       = 0;
	GLuint			m_texFinal       = 0;
	GLuint			m_presentProgId  = 0;
	GLint			m_presentTexUni  = -1;
	GLint			m_presentResUni  = -1;
	GLint			m_presentScaleUni= -1;
	// Global mood-grade uniforms in the present shader.
	GLint			m_presentCentroidUni = -1;
	GLint			m_presentValenceUni  = -1;
	GLint			m_presentLevelUni    = -1;
	GLint			m_presentFluxUni     = -1;
	GLint			m_presentHueUni      = -1;
	GLint			m_presentBeatUni     = -1;
	float			m_prevMeanLum    = -1.f;   // <0 = uninitialised
	bool			m_safetyReady    = false;  // false → present pass disabled (safe fallback)
	int				m_safetyFrame    = 0;      // for sub-sampling the readback
	float			m_lastSafetyScale= 1.f;    // reused between readbacks
	float			m_safetyAccumDt  = 0.f;    // dt accumulated since last readback

	// ---- Feedback / trails (phosphor-style ping-pong) ----
	GLuint			m_fboTrail[2]   = { 0, 0 };
	GLuint			m_texTrail[2]   = { 0, 0 };
	int				m_trailIdx      = 0;
	GLuint			m_trailProgId   = 0;
	GLint			m_trailCurUni   = -1;
	GLint			m_trailPrevUni  = -1;
	GLint			m_trailResUni   = -1;
	GLint			m_trailDecayUni = -1;
	bool			m_feedbackReady = false;

	// ---- GPU reaction-diffusion simulation (Gray-Scott, float ping-pong) ----
	// A genuine on-GPU simulation: each frame a fragment shader advances the
	// Gray-Scott PDE in two RGBA16F buffers (R=A, G=B), reading its own previous
	// state.  The living field is bound to a global "texSim" sampler so any effect
	// (e.g. ReactionDiffusion.frag) can fold it through the kaleidoscope.  Audio
	// (onsets) injects new reagent, so the pattern grows on the beat.
	static const int kRDSize = 320;          // simulation grid (kept small → fast on iGPUs)
	GLuint			m_fboRD[2]    = { 0, 0 };
	GLuint			m_texRD[2]    = { 0, 0 };
	int				m_rdIdx       = 0;
	GLuint			m_rdProgId    = 0;
	GLint			m_rdPrevUni   = -1;
	GLint			m_rdResUni    = -1;
	GLint			m_rdSeedUni   = -1;
	GLint			m_rdFeedUni   = -1;
	GLint			m_rdKillUni   = -1;
	GLint			m_rdInjectUni = -1;
	bool			m_rdReady     = false;   // false → simulation disabled (safe fallback)
	bool			m_rdSeeded    = false;   // false → next step writes the seed pattern
	float			m_rdInjectAcc = 0.f;     // moving injection point phase

	// Live-tunable look parameters (static → one shared setting across all configs).
	static float	s_reactivity;    // audio-motion master gain (default 1.0)
	static float	s_trailAmount;   // feedback trail length 0..0.95 (default 0.6)
	static float	s_moodStrength;  // global mood-grade strength (default 1.0)
	static float	clampParam( float v, float lo, float hi )
	{ return v < lo ? lo : (v > hi ? hi : v); }

	float			m_smoothedSides = 6.f;   // eased kaleidoscope symmetry (no snap)

	// Internal render resolution = display resolution × s_renderScale.  All the
	// expensive offscreen passes use m_width/m_height (= render res); only the final
	// present pass upscales to the display resolution (m_displayW/m_displayH).  Set
	// s_renderScale < 1 to run smoothly on weak GPUs at high display resolutions.
	int				m_displayW = 100;
	int				m_displayH = 100;
	static float	s_renderScale;           // 0.25 .. 2.0 (1.0 = native; set via -s)
public:
	static void setRenderScale( float s )
	{ s_renderScale = (s < 0.25f) ? 0.25f : (s > 2.0f ? 2.0f : s); }
	static float renderScale() { return s_renderScale; }
private:

	// GLSL vars

		// time since initialization
	QElapsedTimer m_time;

	unsigned int m_maxIterationsEffectSearch; //maximum number of iterations during search for next effect



	//Combination of FBOs
	GLuint			m_sh_prog_id_combine;
	GLuint			m_texPointCombineUni1;
	GLuint			m_texPointCombineUni2;
	GLuint			m_texSizeRcpCombineUni;
	GLuint			m_timeCombineUni;
    GLuint			m_interpolationCombineUni;


    float			m_interpolationCombine; //Between 0 and 1

	
	QElapsedTimer		m_timeTexture;
	float       m_timeTextureSolo;
	float		m_timeTextureInterpolation;
	float		m_interpolationTexture;
	unsigned int		m_stateTexture;
	unsigned int		m_timeTextureInterpolationMin;
	unsigned int		m_timeTextureInterpolationMax;
	unsigned int		m_timeTextureSoloMin;
	unsigned int		m_timeTextureSoloMax;
	GLuint      m_actTex;
	GLuint		m_nextTex;
	int			m_state;

    float       m_lastTime;
	float		m_globaltime;


	QElapsedTimer		m_timeEffectTexture;
	unsigned int	m_stateInterpolationEffectTexture;
	float		m_interpolationEffectTexture;
	float		m_timeInterpolationEffectTexture;
	
	//EffectShader *m_effectTextures[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMinTimeSolo[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMaxTimeSolo[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMinTimeInterpolation[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMaxTimeInterpolation[NR_EFFECTS_TEXTURE];

	std::vector<EffectShader *> m_effectTextures;


	unsigned int m_effectTextureTimeInterpolation;
	//unsigned int m_effectTextureMinTimeInterpolation;
	//unsigned int m_effectTextureMaxTimeInterpolation;

	unsigned int  m_actEffectTexture;
	unsigned int  m_nextEffectTexture;


	
	QElapsedTimer		m_timeEffectCombine;
	unsigned int	m_stateInterpolationEffectCombine;
	float		m_interpolationEffectCombine;
	float		m_timeInterpolationEffectCombine;

	
	std::vector<EffectShader *> m_effectCombines;
	

	unsigned int m_effectCombineTimeInterpolation;

    // Dynamic timing scale from AudioAnalyzer (via AudioFeatures::timingScale).
    // < 1.0 → all times scaled longer (ambient mode)
    // > 1.0 → all times scaled shorter (energetic beat music)
    float m_timingScale = 1.f;

    // ---- Audio-reactive motion integration (anti-flicker) ----
    // The old mapping multiplied the absolute 'time' uniform by an audio-varying
    // speed and a flipping sign (audioFlip), so every audio change remapped the
    // entire accumulated phase at once → seizure-grade flicker.  We now integrate
    // the audio-driven *rate* over each frame's dt into these continuous phase
    // accumulators (passed to shaders via AudioFeatures::audioRotPhase / advance).
    float m_audioRotPhase = 0.f;   // accumulated rotation phase (radians)
    float m_audioAdvance  = 0.f;   // accumulated tunnel forward offset
    float m_audioDir      = 1.f;   // eased rotation direction (-1..+1)
    // Slew-rate-limited brightness signals so beats pulse instead of strobing
    // (photosensitive-epilepsy safety).
    float m_audioBeatSmooth  = 0.f;
    float m_audioLevelSmooth = 0.f;
    float m_audioFluxSmooth  = 0.f;
	//unsigned int m_effectCombineMinTimeInterpolation;
	//unsigned int m_effectCombineMaxTimeInterpolation;

	unsigned int  m_actEffectCombine;
	unsigned int  m_nextEffectCombine;

	NanoTimer	m_nanotimer; //debug
	unsigned int m_nrTextureUploads;

	QString		m_imageDirectory;

	ImageLoader	*m_imageLoader;
};


class ImageLoader : public QThread
{
public:
    explicit ImageLoader( FilterShader *shader );
    //explicit Writer(const QString& mark) : mark_(mark) {}
 
    void run();
private:
    FilterShader *m_shader;

};

#endif
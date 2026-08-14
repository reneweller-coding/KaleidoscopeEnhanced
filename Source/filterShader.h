#ifndef GENPROC_H
#define GENPROC_H

#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>
#include <map>
#include <vector>
#include <atomic>
#include <QtCore/QHash>
#include <QtCore/QPair>

#include "mesh.h"

#include "EffectShader.h"
#include "TextureEffectKaleidoscopeBase.h"
#include "Utils.h"
#include "AudioFeatures.h"
#include "ComputeFX.h"
#include "GpuSims.h"
#include "PresentPass.h"

class ImageLoader;

class FilterShader
{
public:
	FilterShader( );
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

	/** Preset name (set by Configuration after loading the XML) — namespaces
	 *  the persistent taste-learning factors, so likes/dislikes are learned
	 *  PER PRESET. */
	void setPresetName( const QString &n ) { m_presetName = n; }

	/** Track-title REVEAL: renders "title / artist" into a texture that the
	 *  present pass unfolds out of a kaleidoscopic swirl, holds readable and
	 *  dissolves toward the viewer (~8 s).  Called by the widget on a track
	 *  change (replaces the old QPainter lower third). */
	void showTitle( const QString &title, const QString &artist );

	/** Request an early cross-fade to the next texture effect (manual 'n' key,
	 *  MIDI pad or web remote).  Honoured at the next opportunity.  TASTE
	 *  LEARNING: skipping an effect that has only just appeared counts as
	 *  "gefaellt mir nicht" — its selection weight gets a persistent, slowly
	 *  decaying malus. */
	void requestSceneChange();

	/** Remote scene browser: names of the preset's texture shaders, and a
	 *  DIRECT jump to one of them (instant, unquantised, respects pin/freeze). */
	QStringList sceneNames() const;
	void forceScene( int idx );

	/** Review mode (Test* presets): scenes run alphabetically, 8 s each,
	 *  'n' steps to the next in order.  No mood/taste filtering, no beat
	 *  quantisation — a systematic viewing bench. */
	void setReviewMode( bool on ) { m_reviewMode = on; }

	/** Validation aid (KALEIDO_COMPILE_ALL=1): eagerly compile every effect
	 *  and combine shader of this configuration — the log then holds one
	 *  Compilation/Linking verdict per shader.  GL context must be current. */
	void compileAllShaders();

	/** Taste learning, positive side (key 'f'): boost the CURRENT effect's
	 *  persistent selection weight ("Favorit"). */
	void favoriteCurrentEffect();

	/** Hot-reload (dev aid): recompile every effect/combine whose fragment file
	 *  matches the given bare name.  GL context must be current. */
	void reloadFragment( const QString &bareName );

	// ---- Live-tunable look parameters (shared across all configs; set by hotkeys) ----
	static void  adjustReactivity( float d ) { s_reactivity  = clampParam(s_reactivity  + d, 0.f, 3.0f); }
	static void  adjustTrails     ( float d ) { s_trailAmount = clampParam(s_trailAmount + d, 0.f, 0.95f); }
	static void  adjustMood       ( float d ) { s_moodStrength= clampParam(s_moodStrength+ d, 0.f, 2.5f); }
	static float reactivity() { return s_reactivity; }
	static float trails()     { return s_trailAmount; }
	static float mood()       { return s_moodStrength; }

	// Latency compensation: loopback capture + analysis + render + display add
	// up to ~40-80 ms, so phase-locked visuals land slightly AFTER the heard
	// beat.  This leads the DISPLAY phase (tempo pulse, beat/bar phase) by the
	// given seconds; detection envelopes can't be led, but the phase-driven
	// rhythm feel dominates.  Keys ; and ' adjust it in 10 ms steps.
	static void  adjustLatency( float d ) { s_latencyLead = clampParam(s_latencyLead + d, 0.f, 0.25f); }
	static void  setLatency   ( float v ) { s_latencyLead = clampParam(v, 0.f, 0.25f); }
	static float latency()    { return s_latencyLead; }

	// Stage "lamps" (corner spotlight cones + haze/mirror-ball/gobo light show).
	// Off by default; toggled with key 'l' and persisted.
	static void  toggleLightShow() { s_lightShow = (s_lightShow > 0.5f) ? 0.f : 1.f; }
	static void  setLightShow( bool on ) { s_lightShow = on ? 1.f : 0.f; }
	static bool  lightShow()  { return s_lightShow > 0.5f; }

	// ---- Stereoscopic output (CLI -3 sbs|tb|ana; key 'z' cycles, c/m depth) --
	// The mono frame is DEPTH-REPROJECTED in the present pass: a pseudo-depth
	// (smoothed brightness pops bright structures forward, the radial term
	// sinks the tunnel centre) drives a small horizontal disparity per eye.
	// Side-by-side / top-bottom feed 3D projectors and HMD video viewers
	// (Virtual Desktop, Bigscreen, ...); red-cyan anaglyph works on any
	// screen.  No native OpenXR — deliberately a display-format feature.
	static int   s_stereoMode;    // 0 off, 1 SBS, 2 top-bottom, 3 anaglyph
	static float s_stereoDepth;   // disparity strength 0..2 (default 1)
	static void  cycleStereo()    { s_stereoMode = (s_stereoMode + 1) & 3; }
	static int   stereoMode()     { return s_stereoMode; }
	static void  adjustStereoDepth( float d )
	{ s_stereoDepth = clampParam(s_stereoDepth + d, 0.f, 2.f); }
	static float stereoDepth()    { return s_stereoDepth; }

	// ---- VJ handbrakes ----
	// Blackout (key 'b'): fade the OUTPUT to black (window, Spout, recording —
	// it multiplies the present pass's brightness scale) and back.
	static void  toggleBlackout() { s_blackout = !s_blackout; }
	static bool  blackout()       { return s_blackout; }
	// Freeze (key 'e'): hold the picture — the frame time is forced to 0 (all
	// phase integration and envelope motion stops) and the activation clocks
	// are re-armed so no scheduled switch fires behind the frozen image.
	static void  toggleFreeze()   { s_freeze = !s_freeze; }
	static bool  frozen()         { return s_freeze; }
	// Pin (key 'u'): keep the CURRENT effect/combine on screen — scheduled and
	// forced switches (section/drop/novelty) are suppressed until unpinned.
	static void  togglePin()      { s_pinned = !s_pinned; }
	static bool  pinned()         { return s_pinned; }

	// Spout output (CLI -o): publish the displayed frame as sender "Kaleidoscope".
	static bool		s_spoutEnabled;

	/** Spout INPUT (CLI -i <sender|any>): a Spout sender's live texture (OBS,
	 *  Resolume, a webcam through OBS, ...) replaces the photo as the source
	 *  image of the whole pipeline — the audience becomes the mandala.  While
	 *  no sender runs, the photos are the fallback. */
	static bool		s_spoutInEnabled;
	static QString	s_spoutInSender;
	// Native video as an image source (CLI -v).  Feeds the same m_liveTex slot
	// as Spout does, so every effect gets moving footage without knowing.
	// Spout wins if both are given: it is the live feed, the file is not.
	static QString	s_videoPath;

	// Human-readable names of the currently active / cross-fading effects (debug overlay).
	QString activeShaderInfo() const;
	// Absolute setters (e.g. MIDI knobs map a 0..1 value to the full range).
	static void  setReactivity( float v ) { s_reactivity  = clampParam(v, 0.f, 3.0f); }
	static void  setTrails     ( float v ) { s_trailAmount = clampParam(v, 0.f, 0.95f); }
	static void  setMood       ( float v ) { s_moodStrength= clampParam(v, 0.f, 2.5f); }

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

	// Baut Trails/StereoMix + delegiert Present/Bloom an den PresentPass.
	void setupSafety();


	// Mood-based selection bias: accept a candidate effect with a probability that
	// depends on how well its complexity matches the current arousal (calm music →
	// simple effects, energetic → busy).  Safe: callers retry, then fall back.
	bool moodAccept(EffectShader *s);
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

	// Live mood snapshot for the ImageLoader's mood-matched image choice
	// (written once per frame in paint(), read on the loader thread).
	std::atomic<float> m_moodValence { 0.5f };
	std::atomic<float> m_moodArousal { 0.5f };
	std::atomic<float> m_moodAmbient { 0.f };

private:

	// Initialise a framebuffer object; depthRb != nullptr additionally creates
	// and attaches a depth renderbuffer (needed by the 3D scene effects).
	void initFBO(GLuint &fboEffect, GLuint &texIDEffect, GLuint *depthRb = nullptr);
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
	// Zero-initialised so create*/init* can safely REUSE existing ids instead of
	// generating fresh ones (leak-proof if a rebuild path is ever re-entered).
	GLuint			m_fboEffectTexture1 = 0; // variable to store framebuffer object id
	GLuint			m_fboEffectTexture2 = 0; // variable to store framebuffer object id
	GLuint			m_fboEffectCombine1 = 0; // variable to store framebuffer object id
	GLuint			m_fboEffectCombine2 = 0; // variable to store framebuffer object id
	GLuint			m_depthFbo = 0;
	GLenum			m_attachmentpoint; // where to attack framebufferobjects
	GLuint			m_texID1 = 0; // texture ids of read/write Textures
	GLuint			m_texID2 = 0;
	GLuint			m_texIDFBOEffectTexture1 = 0;
	GLuint			m_texIDFBOEffectTexture2 = 0;
	GLuint			m_texIDFBOEffectCombine1 = 0;
	GLuint			m_texIDFBOEffectCombine2 = 0;

	// Target framebuffer for the final on-screen pass (QOpenGLWidget's FBO, not 0).
	GLuint			m_defaultFBO = 0;

	// True once start() has built the GL resources, so revisiting a configuration
	// only resizes instead of rebuilding (which leaked programs/textures/FBOs and
	// spawned a duplicate ImageLoader).
	bool			m_started = false;

	// Manual / novelty-driven early scene change + its rate-limit cooldown.
	bool			m_forceEffectChange = false;
	bool			m_forceCombineChange = false;
	int				m_forcedNextTexture = -1;   // >= 0: remote-chosen next scene

	// ---- Review mode (Test* presets): alphabetical 8 s sequence ----
	bool			m_reviewMode = false;
	std::vector<int> m_reviewOrder;             // effect indices, sorted by name
	int				m_reviewPos = 0;
	float			m_noveltyCooldown   = 0.f;
	// Last-seen analyzer section counter (verse/chorus/bridge detector); a
	// single +1 step forces an early, short cross-fade to the next shader.
	int				m_lastSectionCount  = 0;
	// Last-seen analyzer drop counter (EDM drop detector): +1 = immediate cut.
	int				m_lastDropCount     = 0;

	// ---- Song-structure memory ----
	// Per analyzer section id: which effect/combine played it and the effect's
	// rolled parameter values.  A RETURNING section (chorus #2) replays the
	// exact same look; a NEW section's fresh look is stored after the switch.
	std::map<int, unsigned int>       m_sectionEffect;
	std::map<int, unsigned int>       m_sectionCombine;
	std::map<int, std::vector<float>> m_sectionParams;
	int				m_pendingSectionStore   = -1;
	int				m_pendingSectionRestore = -1;

	// Per-transition blend styles (0 linear, 1 wipe, 2 kaleido, 3 zoom),
	// rolled when a change fires; linear stays the most common.
	int				m_transStyleTex  = 0;
	int				m_transStyleComb = 0;

	// Beat-quantised IMAGE change (like the shader changes: pending until the
	// next downbeat, with a timeout + no-music escape).
	bool			m_pendingImgChange = false;
	float			m_pendingImgAge    = 0.f;

	// Key colour: chroma hue slewed AROUND the colour circle (shortest way,
	// max ~20 deg/s) so key changes glide instead of jumping the palette.
	float			m_chromaHueSlew = 0.f;

	// Latest mood state for moodAccept (tag-based shader selection).
	float			m_lastValence = 0.5f;
	float			m_lastAmbient = 0.f;

	// Instrument-separated onset envelopes (kick / snare / hat): peak-hold +
	// slew, exactly like the global beat/onset envelopes above them.
	float			m_kickEnv = 0.f,  m_kickSmooth = 0.f;
	float			m_snareEnv = 0.f, m_snareSmooth = 0.f;
	float			m_hatEnv = 0.f,   m_hatSmooth = 0.f;

	// Finaler Present (Limiter, AutoExposure, Bloom, Titel-Reveal, Stereo):
	// komplett im PresentPass gekapselt.
	PresentPass		m_present;

	// ---- Track-title reveal state (see showTitle) ----
	QImage			m_titlePending;          // rendered text, awaits GL upload

	// ---- Virtual camera (global "Regie" layer, applied in the present pass) --
	// A single slow-moving transform over the finished frame: micro drift,
	// downbeat punch-in (decaying), per-bar sway, build-up tension zoom and a
	// kick/drop shake.  Makes every effect feel "filmed" instead of static.
	float			m_camPunch = 0.f;   // decaying punch-in envelope
	float			m_camZoom  = 1.f;
	float			m_camRot   = 0.f;
	float			m_camOffX  = 0.f, m_camOffY = 0.f;


	// ---- Feedback / trails (phosphor-style ping-pong) ----
	GLuint			m_fboTrail[2]   = { 0, 0 };
	GLuint			m_texTrail[2]   = { 0, 0 };
	int				m_trailIdx      = 0;
	GLuint			m_trailProgId   = 0;
	GLint			m_trailCurUni   = -1;
	GLint			m_trailPrevUni  = -1;
	GLint			m_trailResUni   = -1;
	GLint			m_trailDecayUni = -1;
	GLint			m_trailZoomUni  = -1;   // echo-warp: per-frame zoom
	GLint			m_trailRotUni   = -1;   //   ... rotation (radians/frame)
	GLint			m_trailHueUni   = -1;   //   ... hue drift of the echoes
	GLint			m_trailDepthUni = -1;   // depth-aware trails (3D scenes)
	float			m_trailDepth3D  = 0.f;  // slewed 0..1 "a 3D scene is up"
	// Spatial warp field (MilkDrop-style liquid feedback).
	GLint			m_trailRipAmpUni  = -1, m_trailRipPhUni  = -1;
	GLint			m_trailSwirlUni   = -1, m_trailFlowAmpUni = -1;
	GLint			m_trailFlowPhUni  = -1;
	float			m_warpRipplePhase = 0.f, m_warpFlowPhase = 0.f;
	bool			m_feedbackReady = false;
	bool			m_spoutStarted  = false;
	GLuint			m_liveTex       = 0;   // Spout-in texture (0 = photos)

	// Depth renderbuffers for the two effect FBOs (3D scene effects).
	// Depth attachments of the two texture-effect FBOs.  Textures, not
	// renderbuffers, so the combine stage can READ what the 3D scene wrote
	// ("texDepth0"/"texDepth1", units 29/30).
	GLuint			m_depthTexEffect1 = 0, m_depthTexEffect2 = 0;

	// ---- shadow map ----
	// A single depth-only target, shared by whichever 3D scene wants it.
	// Created on first use: a scene opts in by declaring "texShadow", and most
	// never do.
	static const int kShadowSize = 2048;
	GLuint			m_shadowFbo = 0;
	GLuint			m_shadowTex = 0;
	AudioFeatures	m_lastAudioFx;   // this frame's features, for the shadow pass
	bool			ensureShadowMap();
	void			updateLightMatrix(float t);
	void			renderShadowPass(EffectShader *fx);

	// ---- order-independent transparency (weighted blended) ----
	// Two extra targets the transparent geometry accumulates into, sharing the
	// scene's depth buffer so transparency is still occluded by opaque solids.
	// Created on first use, like the shadow map.
	GLuint			m_oitFbo = 0;
	GLuint			m_oitAccum = 0;     // RGBA16F: premultiplied colour, weighted
	GLuint			m_oitReveal = 0;    // R16F: how much background still shows
	GLuint			m_oitResolveProg = 0;
	bool			ensureOitTargets();
	void			renderOitPass(EffectShader *fx, GLuint depthTex, GLuint targetFbo);
	// FPS EMA for the cube-scene detail budget (see paint()).
	float			m_cubeFpsEma = 60.f;
	// TRUE-STEREO state (real per-eye rendering of a solo 3D scene):
	// hold = a 3D scene is solo while SBS/TB stereo is on (freezes combine
	// switching); now = additionally the combine is solo -> the scene renders
	// per-eye, the combine pass is bypassed and present passthroughs.
	bool			m_trueStereoHold = false;
	bool			m_trueStereoNow  = false;
	// packed = the on-screen frame is eye-packed (solo OR a 3D<->3D texture
	// cross-fade with the combine solo) -> per-eye rendering, plain mixing,
	// trail-warp suppression and present passthrough.
	bool			m_trueStereoPacked = false;
	// Plain cross-mix program for packed 3D<->3D cross-fades.
	GLuint			m_stereoMixProgId  = 0;
	GLint			m_stereoMixTexAUni = -1;
	GLint			m_stereoMixTexBUni = -1;
	GLint			m_stereoMixResUni  = -1;
	GLint			m_stereoMixWUni    = -1;
	// Fixed-function copy of a texture into the bound FBO (combine bypass).
	void			blitTexture( GLuint tex );




	// ---- Visual spectrum ballistics (anti-jitter for geometry scenes) ----
	float			m_specVis[32] = {};

	// ---- Song-end dramaturgy + melody history (host state) ----
	float			m_fadeSlow6   = 0.f;    // 6 s loudness average
	float			m_fadeSlow20  = 0.f;    // 20 s loudness average
	float			m_fadeOutEnv  = 0.f;    // slewed fade-out envelope
	float			m_melody[96]  = {};     // dominantPitch ring (~7.7 s)
	int				m_melodyHead  = 0;
	float			m_melodyAccum = 0.f;

	ComputeFX		m_cfx;                     // GL 4.3 compute-shader sims


	// GPU-/Host-Simulationen (RD, Fluid, Smoke3D, Physarum, SSM, Spectro):
	// komplett in GpuSims gekapselt; paint() meldet nur den Bedarf.
	GpuSims			m_sims;

	// Live-tunable look parameters (static → one shared setting across all configs).
	static float	s_reactivity;    // audio-motion master gain (default 1.0)
	static float	s_trailAmount;   // feedback trail length 0..0.95 (default 0.6)
	static float	s_moodStrength;  // global mood-grade strength (default 1.0)
	static float	s_lightShow;     // 0 = corner lamps/light-show off (default), 1 = on
	static float	s_latencyLead;   // display-phase lead in seconds (default 0.05)
	static bool		s_blackout;      // VJ blackout target (smoothed per instance)
	static bool		s_freeze;        // VJ freeze: hold the picture
	static bool		s_pinned;        // VJ pin: no effect/combine switches
	float			m_breakSmooth = 0.f;   // slewed DJ-stop hold (freezes motion)

	// ---- Taste learning (persistent, PER PRESET + shader FILE basename) ----
	// Selection-weight factors in [0.3, 2.5], default 1.0, keyed
	// "<PresetName>/<file>" — skipping a shader in Club leaves its standing
	// in Ambient untouched.  A skip shortly after activation multiplies by
	// 0.8, a favourite by 1.25; each app start decays every factor toward
	// 1.0 so old grudges fade.  Soft bias only — moodAccept keeps a floor,
	// no shader is ever excluded.  Storage is shared (static) across the
	// instances; the keys carry the preset namespace.
	static QHash<QString, float> s_taste;
	QString			m_presetName;              // set by Configuration after load
	float			tasteFor( const char *fragPath ) const;
	void			bumpTaste( const char *fragPath, float mul );
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
	GLuint      m_actTex  = 0;
	GLuint		m_nextTex = 0;
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
    float m_rotEnergy        = 0.f;   // slowly-slewed rotation-speed envelope (no per-beat jerk)
    float m_chasePhase       = 0.f;   // 0..1, advances 1/4 each onset -> corner-cone colour chase
    float m_prevChaseOnset   = 0.f;   // previous onset value (rising-edge detect for the chase)
    // Peak-hold + exponential-release envelopes for the transient pulses.  The
    // analyzer's raw pulses decay at audio-block rate (gone within ~60 ms), far
    // faster than the photosensitivity rise-slew can follow, so beats looked
    // flattened; and onset/downbeat used to be uploaded raw (a 0->1 jump within
    // a single frame).  The envelope holds each peak and releases exponentially,
    // giving the slew a stable target: visible, smooth pulses.
    float m_beatEnv          = 0.f;
    float m_onsetEnv         = 0.f;
    float m_onsetSmooth      = 0.f;
    float m_downbeatEnv      = 0.f;
    float m_downbeatSmooth   = 0.f;
    float m_gateSmooth       = 0.f;   // slewed music gate (no global reactivity pumping)
    float m_beatPhasePLL     = 0.f;   // continuous beat phase (no per-beat resync snap)
    // Swell: slow loudness-build envelope (fast avg minus slow avg) — the one
    // signal that captures AMBIENT dynamics; drives bloom/brightness breathing.
    float m_swellFast        = 0.f;
    float m_swellSlow        = 0.f;
    // Bar tracking on the host: barBeat advances on each PLL wrap and re-syncs
    // to the analyzer's downbeat; barPhase = (barBeat + pllPhase) / 4.
    int   m_barBeatHost      = 0;
    float m_prevPllPhase     = 0.f;
    float m_prevRawDownbeat  = 0.f;
    bool  m_downbeatTick     = false; // true for THIS frame when a downbeat lands
    // Beat-quantised scene changes: when a change becomes due it is held PENDING
    // until the next downbeat (or a timeout / no music), so cuts land on the "1".
    bool  m_pendingEffectChange  = false;
    bool  m_pendingCombineChange = false;
    bool  m_pendingEffectForced  = false;
    bool  m_pendingCombineForced = false;
    float m_pendingEffectAge     = 0.f;
    float m_pendingCombineAge    = 0.f;
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

    // Mood-matched image choice: cached tiny-thumbnail stats per image path
    // (brightness, colourfulness) — loader-thread only, no locking needed.
    static QPair<float,float> imageStats( const QString &path );
    QHash<QString, QPair<float,float>> m_stats;
};

#endif
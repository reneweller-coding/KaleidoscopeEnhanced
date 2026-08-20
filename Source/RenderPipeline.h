/**
 * @file RenderPipeline.h
 * @brief Declares RenderPipeline, the central per-frame render/present pipeline of one
 *        loaded preset (texture-effect + combine-effect scheduling, cross-fade
 *        compositing, feedback/trails, shadow and OIT passes, 2D camera rig, stereo
 *        output, track-title reveal) and its background ImageLoader helper thread.
 */
#ifndef RENDERPIPELINE_H
#define RENDERPIPELINE_H

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
#include "AudioConditioner.h"
#include "AudioFeatures.h"
#include "ComputeFX.h"
#include "GpuSims.h"
#include "PresentPass.h"
#include "SceneScheduler.h"

class ImageLoader;   ///< Forward declaration; background image-loading thread, defined at the bottom of this file.

/**
 * @brief Owns and drives the whole per-frame render/present pipeline of one loaded preset.
 *
 * RenderPipeline renders the two texture-effect FBOs (the active effect and, while cross-fading,
 * the incoming one), composites them through a combine-shader stage (itself cross-fadable),
 * accumulates phosphor-style feedback trails, and hands the result to PresentPass for
 * tone-mapping/bloom/title-reveal/lyrics-overlay/stereo output and final display. It owns all
 * the GL resources (FBOs, textures, shader programs, shadow map, OIT targets) for one loaded
 * configuration, delegates *which* effect/combine plays and *when* it changes to
 * SceneScheduler, and integrates every audio-reactive signal into continuous phases/slewed
 * envelopes (see paint()) so that audio changes never jump or flicker the visuals. One
 * instance exists per loaded preset (Configuration); init() stores the config, start()/reinit()
 * build the GL state, and paint() is called once per displayed frame with the current rotation
 * matrix and audio analysis.
 */
class RenderPipeline
{
public:
	/** @brief Constructs a RenderPipeline with all GL object ids zeroed ("not yet created"); call init() then start() before painting. */
	RenderPipeline( );
	/** @brief Releases every GL texture/program owned by this instance and deletes the legacy mesh. */
	~RenderPipeline();
	/** @brief Loads/links the GLSL runtime programs needed up front (currently just the legacy outer combine program via initGLSL()); the per-effect and per-combine programs themselves compile lazily on first use. */
	void loadShader(); // load shader from file, compile and link them to programs, get variable locations
	/**
	 * @brief Loads a legacy Wavefront OBJ mesh for the fixed-function drawScene() preview path.
	 * @note drawScene()/loadObj() are legacy: in the current build drawScene() is only referenced
	 *       from a fully commented-out block inside paint(), and loadObj() has no active caller
	 *       (glwidget.cpp keeps only a commented-out call) — kept for reference / possible reuse.
	 * @param filename Path to the .obj file to load.
	 * @return true on success; false (with a stderr message) if the mesh failed to load.
	 */
	bool loadObj(const char *filename);
	/** Draw one frame.
	 *  @param audio  Optional audio analysis result.  Pass a default-constructed
	 *                AudioFeatures{} (all zero) to disable audio reactivity.
	 *                Audio-driven motion is integrated into continuous phase
	 *                offsets here (see m_audioRotPhase / m_audioAdvance) so that
	 *                changing the audio never jumps the visual.                 */
	/**
	 * @brief Renders and presents exactly one frame of the visualizer.
	 *
	 * This is the whole pipeline: it (1) picks up live Spout/video input if configured,
	 * (2) smooths the adaptive timing scale and applies the VJ freeze/pin/DJ-stop
	 * dt manipulations, (3) advances the track-title reveal, (4) builds a processed
	 * copy of @p audio (`audioFx`) with every audio signal turned into a continuous,
	 * slew-limited phase/envelope (beat PLL, bar phase, onset/kick/snare/hat envelopes,
	 * swell, fade-out, melody ring, virtual-camera "Regie", Zeit-Regie rewind/echo/breath,
	 * chroma-hue slew — see the in-body comments for each), (5) advances the image
	 * cross-fade and the SceneScheduler's effect/combine state machines, (6) steps the
	 * GpuSims/ComputeFX simulations the active/incoming effects actually sample,
	 * (7) renders the shadow pass, the two texture-effect passes (with optional
	 * true-stereo per-eye rendering and order-independent-transparency pass) and the
	 * two combine passes, (8) runs the legacy outer combine (FxPlain) that cross-fades
	 * between the two combine outputs, (9) accumulates the phosphor feedback/trails
	 * pass, and (10) hands the result to PresentPass::run() for tone-mapping, bloom,
	 * camera transform, stereo packing, overlays and final display.
	 *  @param rotMatrix Column-major 4x4 (or 3x3-in-16, see drawScene()) rotation matrix for the legacy mesh preview path.
	 *  @param tx X translation for the legacy mesh preview path.
	 *  @param ty Y translation for the legacy mesh preview path.
	 *  @param tz Z translation for the legacy mesh preview path.
	 *  @param audio  Optional audio analysis result.  Pass a default-constructed
	 *                AudioFeatures{} (all zero) to disable audio reactivity.
	 *                Audio-driven motion is integrated into continuous phase
	 *                offsets here (see m_audioRotPhase / m_audioAdvance) so that
	 *                changing the audio never jumps the visual.
	 */
	void paint(const float *rotMatrix, float tx, float ty, float tz,
	           const AudioFeatures &audio = AudioFeatures{});

	/** The framebuffer the final image must be drawn into.  Under QOpenGLWidget
	 *  the visible buffer is NOT 0 but QOpenGLWidget::defaultFramebufferObject();
	 *  the widget passes it here every frame before paint().  Defaults to 0. */
	/**
	 * @brief Sets the framebuffer the final image must be drawn into.
	 * @param fbo Target FBO id (QOpenGLWidget::defaultFramebufferObject() under QOpenGLWidget; 0 for a plain default framebuffer).
	 */
	void setDefaultFBO( GLuint fbo ) { m_defaultFBO = fbo; }

	/** Preset name (set by Configuration after loading the XML) — namespaces
	 *  the persistent taste-learning factors, so likes/dislikes are learned
	 *  PER PRESET. */
	/**
	 * @brief Sets the preset name that namespaces the persistent taste-learning factors.
	 * @param n Preset name (used as the "<PresetName>/<file>" key prefix in tasteFor()/bumpTaste()).
	 */
	void setPresetName( const QString &n ) { m_presetName = n; }

	/** Track-title REVEAL: renders "title / artist" into a texture that the
	 *  present pass unfolds out of a kaleidoscopic swirl, holds readable and
	 *  dissolves toward the viewer (~8 s).  Called by the widget on a track
	 *  change (replaces the old QPainter lower third). */
	/**
	 * @brief Renders "title / artist" text into a texture for the present pass's kaleidoscopic reveal.
	 *
	 * Only rasterises the text with QPainter into m_titlePending here; the actual GL upload and
	 * mood-matched reveal-style pick happen at the next paint() call, where a GL context is current.
	 * @param title Track title (elided to fit; drawn large and bold).
	 * @param artist Track artist (elided to fit; drawn smaller below the title, omitted if empty).
	 */
	void showTitle( const QString &title, const QString &artist );

	/** Lyrics-/Künstlerbild-Overlay: GLwidget berechnet den Frame-Zustand
	 *  (Sync, Blenden, Bildrotation) und liefert fertige Texturen; hier wird
	 *  nur an den PresentPass durchgereicht. */
	/**
	 * @brief Per-frame state for the lyrics/artist-image overlay, computed by GLwidget and passed through to PresentPass.
	 */
	struct OverlayFrame
	{
		float lyricsAlpha   = 0.f;   ///< Lyrics overlay opacity, 0 (hidden) .. 1 (fully visible).
		float lyricsScrollV = 0.f;   ///< Vertical scroll offset of the lyrics text block.
		float lyricsAspect  = 1.f;   ///< Aspect ratio of the lyrics texture (for correct on-screen scaling).
		// Kinetik: Sekunden seit dem Wechsel der aktiven Karaoke-Zeile
		// (Slam-Einflug der frischen Zeile); gross = kein Slam.
		float lyricsLineAge = 999.f; ///< Seconds since the active karaoke line changed; large = no "slam" entrance animation.
		// Cover-Palette: zwei dominante Farben des Kuenstlerbilds + Staerke.
		float paletteAmt    = 0.f;   ///< Strength with which the cover-art palette colours tint the frame, 0..1.
		float paletteA[3]   = { 0.f, 0.f, 0.f };  ///< First dominant cover-art colour (RGB, 0..1).
		float paletteB[3]   = { 0.f, 0.f, 0.f };  ///< Second dominant cover-art colour (RGB, 0..1).
		float lyricsHlV0    = -1.f;  ///< Start vertical position of the current word/line highlight sweep (-1 = none).
		float lyricsHlV1    = -1.f;  ///< End vertical position of the current word/line highlight sweep (-1 = none).
		float lyricsHlProg  = 0.f;   ///< Progress of the highlight sweep between lyricsHlV0 and lyricsHlV1, 0..1.
		float artistAlpha   = 0.f;   ///< Artist-image overlay opacity, 0 (hidden) .. 1 (fully visible).
		float artistAspect  = 1.f;   ///< Aspect ratio of the artist-image texture.
	};
	/** @brief Stores this frame's lyrics/artist overlay state (read back by paint()/PresentPass). @param o Overlay state computed by the caller (GLwidget). */
	void setOverlayFrame( const OverlayFrame &o ) { m_overlay = o; }
	/** @brief Uploads the current lyrics-line texture to the present pass. @param rgba Packed RGBA8 pixel data. @param w Image width in pixels. @param h Image height in pixels. */
	void setLyricsTexture( const void *rgba, int w, int h ) { m_present.setLyricsImage( rgba, w, h ); }
	/** @brief Uploads the current artist-image texture to the present pass. @param rgba Packed RGBA8 pixel data. @param w Image width in pixels. @param h Image height in pixels. */
	void setArtistTexture( const void *rgba, int w, int h ) { m_present.setArtistImage( rgba, w, h ); }
	/** @brief Overrides the artist-image corner slot with an externally-owned GL texture (a music-video PiP frame); 0 clears the override. @param texId GL texture id, owned by the caller. */
	void setArtistExternalTexture( GLuint texId ) { m_present.setArtistExternalTexture( texId ); }

	/** Request an early cross-fade to the next texture effect (manual 'n' key,
	 *  MIDI pad or web remote).  Honoured at the next opportunity.  TASTE
	 *  LEARNING: skipping an effect that has only just appeared counts as
	 *  "gefaellt mir nicht" — its selection weight gets a persistent, slowly
	 *  decaying malus. */
	/**
	 * @brief Requests an early manual cross-fade to the next texture effect (key 'n', MIDI pad, web remote).
	 *
	 * Ignored while PIN or FREEZE is active (a message explains why on stderr). If the current
	 * effect has been on screen less than 10 s, skipping it is treated as a dislike and its
	 * persistent taste weight is multiplied down (see bumpTaste()).
	 */
	void requestSceneChange();

	/** Remote scene browser: names of the preset's texture shaders, and a
	 *  DIRECT jump to one of them (instant, unquantised, respects pin/freeze). */
	/** @brief Lists the preset's texture-effect shader names (bare file names, no path/extension), for a remote scene browser. @return One name per configured texture effect, in registration order. */
	QStringList sceneNames() const;
	/** @brief Jumps directly to texture effect @p idx (instant, unquantised cut). Ignored while PIN or FREEZE is active, or if @p idx is out of range. @param idx Index into the texture-effect list, as returned by sceneNames(). */
	void forceScene( int idx );
	/** @brief Index of the currently active texture effect, into the same list as sceneNames(). @return An index into sceneNames(), or -1 if none is active yet. */
	int activeSceneIndex() const { return m_effectTextures.empty() ? -1 : int(m_scheduler.actTexture()); }
	/** @brief Whether a scene cross-fade is currently in flight (mid-transition frames blend two scenes, so callers wanting a clean single-scene snapshot should skip them). */
	bool sceneTransitioning() const { return m_scheduler.texState() != 0; }

	/** Review mode (Test* presets): scenes run alphabetically, 8 s each,
	 *  'n' steps to the next in order.  No mood/taste filtering, no beat
	 *  quantisation — a systematic viewing bench. */
	/** @brief Enables/disables review mode (alphabetical fixed-length walk through every scene, for systematic viewing). @param on true to enable review mode, false to return to normal mood/taste-driven selection. */
	void setReviewMode( bool on ) { m_scheduler.setReviewMode( on ); }

	/** Validation aid (KALEIDO_COMPILE_ALL=1): eagerly compile every effect
	 *  and combine shader of this configuration — the log then holds one
	 *  Compilation/Linking verdict per shader.  GL context must be current. */
	/** @brief Eagerly compiles every texture-effect and combine-effect shader of this configuration (validation aid; GL context must be current). */
	void compileAllShaders();

	/** Taste learning, positive side (key 'f'): boost the CURRENT effect's
	 *  persistent selection weight ("Favorit"). */
	/** @brief Boosts the currently active texture effect's persistent taste weight ("favourite", key 'f'). */
	void favoriteCurrentEffect();

	/** Hot-reload (dev aid): recompile every effect/combine whose fragment file
	 *  matches the given bare name.  GL context must be current. */
	/** @brief Recompiles every texture-effect/combine-effect program whose fragment file matches @p bareName (dev hot-reload aid; GL context must be current). @param bareName Bare fragment file name to match (case-insensitive), e.g. "Voyager.frag". */
	void reloadFragment( const QString &bareName );

	// ---- Live-tunable look parameters (shared across all configs; set by hotkeys) ----
	static void  adjustReactivity( float d ) { s_reactivity  = clampParam(s_reactivity  + d, 0.f, 3.0f); }   ///< @brief Adjusts the global audio-reactivity gain by @p d (clamped to [0, 3]).
	static void  adjustTrails     ( float d ) { s_trailAmount = clampParam(s_trailAmount + d, 0.f, 0.95f); } ///< @brief Adjusts the feedback-trail-length knob by @p d (clamped to [0, 0.95]).
	static void  adjustMood       ( float d ) { s_moodStrength= clampParam(s_moodStrength+ d, 0.f, 2.5f); }  ///< @brief Adjusts the global mood-grade strength by @p d (clamped to [0, 2.5]).
	static float reactivity() { return s_reactivity; }    ///< @brief Returns the current global audio-reactivity gain.
	static float trails()     { return s_trailAmount; }   ///< @brief Returns the current feedback-trail-length knob.
	static float mood()       { return s_moodStrength; }  ///< @brief Returns the current global mood-grade strength.

	// Latency compensation: loopback capture + analysis + render + display add
	// up to ~40-80 ms, so phase-locked visuals land slightly AFTER the heard
	// beat.  This leads the DISPLAY phase (tempo pulse, beat/bar phase) by the
	// given seconds; detection envelopes can't be led, but the phase-driven
	// rhythm feel dominates.  Keys ; and ' adjust it in 10 ms steps.
	static void  adjustLatency( float d ) { s_latencyLead = clampParam(s_latencyLead + d, 0.f, 0.25f); }  ///< @brief Adjusts the display-phase latency-compensation lead by @p d seconds (clamped to [0, 0.25]).
	static void  setLatency   ( float v ) { s_latencyLead = clampParam(v, 0.f, 0.25f); }                  ///< @brief Sets the display-phase latency-compensation lead to @p v seconds (clamped to [0, 0.25]).
	static float latency()    { return s_latencyLead; }   ///< @brief Returns the current display-phase latency-compensation lead, in seconds.

	// Stage "lamps" (corner spotlight cones + haze/mirror-ball/gobo light show).
	// Off by default; toggled with key 'l' and persisted.
	static void  toggleLightShow() { s_lightShow = (s_lightShow > 0.5f) ? 0.f : 1.f; } ///< @brief Toggles the stage-lamps light show on/off (key 'l').
	static void  setLightShow( bool on ) { s_lightShow = on ? 1.f : 0.f; }             ///< @brief Sets the stage-lamps light show on/off. @param on true to enable the corner-lamp light show.
	static bool  lightShow()  { return s_lightShow > 0.5f; }                          ///< @brief Returns whether the stage-lamps light show is currently on.

	// ---- Stereoscopic output (CLI -3 sbs|tb|ana; key 'z' cycles, c/m depth) --
	// The mono frame is DEPTH-REPROJECTED in the present pass: a pseudo-depth
	// (smoothed brightness pops bright structures forward, the radial term
	// sinks the tunnel centre) drives a small horizontal disparity per eye.
	// Side-by-side / top-bottom feed 3D projectors and HMD video viewers
	// (Virtual Desktop, Bigscreen, ...); red-cyan anaglyph works on any
	// screen.  No native OpenXR — deliberately a display-format feature.
	static int   s_stereoMode;    ///< Stereoscopic output mode: 0 off, 1 SBS, 2 top-bottom, 3 anaglyph.
	static float s_stereoDepth;   ///< Stereo disparity strength, 0..2 (default 1).
	static void  cycleStereo()    { s_stereoMode = (s_stereoMode + 1) & 3; }  ///< @brief Cycles to the next stereoscopic output mode (key 'z').
	static int   stereoMode()     { return s_stereoMode; }                    ///< @brief Returns the current stereoscopic output mode.
	static void  adjustStereoDepth( float d )
	{ s_stereoDepth = clampParam(s_stereoDepth + d, 0.f, 2.f); }  ///< @brief Adjusts the stereo disparity strength by @p d (clamped to [0, 2]).
	static float stereoDepth()    { return s_stereoDepth; }       ///< @brief Returns the current stereo disparity strength.

	// ---- VJ handbrakes ----
	// Blackout (key 'b'): fade the OUTPUT to black (window, Spout, recording —
	// it multiplies the present pass's brightness scale) and back.
	static void  toggleBlackout() { s_blackout = !s_blackout; }  ///< @brief Toggles VJ blackout (fades the final output to/from black; key 'b').
	static bool  blackout()       { return s_blackout; }         ///< @brief Returns whether VJ blackout is currently engaged.
	// Freeze (key 'e'): hold the picture — the frame time is forced to 0 (all
	// phase integration and envelope motion stops) and the activation clocks
	// are re-armed so no scheduled switch fires behind the frozen image.
	static void  toggleFreeze()   { s_freeze = !s_freeze; }  ///< @brief Toggles VJ freeze (holds the picture by forcing frame time to 0; key 'e').
	static bool  frozen()         { return s_freeze; }       ///< @brief Returns whether VJ freeze is currently engaged.
	// Pin (key 'u'): keep the CURRENT effect/combine on screen — scheduled and
	// forced switches (section/drop/novelty) are suppressed until unpinned.
	static void  togglePin()      { s_pinned = !s_pinned; }  ///< @brief Toggles VJ pin (suppresses scheduled/forced effect and combine switches; key 'u').
	static bool  pinned()         { return s_pinned; }       ///< @brief Returns whether VJ pin is currently engaged.

	// Spout output (CLI -o): publish the displayed frame as sender "Kaleidoscope".
	static bool		s_spoutEnabled;    ///< Whether the Spout output sender ("Kaleidoscope") is enabled (CLI -o).

	/** Spout INPUT (CLI -i <sender|any>): a Spout sender's live texture (OBS,
	 *  Resolume, a webcam through OBS, ...) replaces the photo as the source
	 *  image of the whole pipeline — the audience becomes the mandala.  While
	 *  no sender runs, the photos are the fallback. */
	static bool		s_spoutInEnabled;   ///< Whether Spout input is enabled (CLI -i): a live sender texture replaces the photo source.
	static QString	s_spoutInSender;    ///< Name of the Spout sender to receive from, or "any" (CLI -i argument).
	// Native video as an image source (CLI -v).  Feeds the same m_liveTex slot
	// as Spout does, so every effect gets moving footage without knowing.
	// Spout wins if both are given: it is the live feed, the file is not.
	static QString	s_videoPath;        ///< Path to a video file used as a live image source (CLI -v); ignored if Spout input is also enabled.

	// Human-readable names of the currently active / cross-fading effects (debug overlay).
	/** @brief Builds a human-readable multi-line summary of the currently active/cross-fading texture effect and combine (debug overlay). @return "TEX ...\nCOMB ..." text, including the incoming shader name and cross-fade percentage while a fade is in progress. */
	QString activeShaderInfo() const;
	// Absolute setters (e.g. MIDI knobs map a 0..1 value to the full range).
	static void  setReactivity( float v ) { s_reactivity  = clampParam(v, 0.f, 3.0f); }   ///< @brief Sets the global audio-reactivity gain to an absolute value @p v (clamped to [0, 3]; e.g. from a MIDI knob).
	static void  setTrails     ( float v ) { s_trailAmount = clampParam(v, 0.f, 0.95f); }  ///< @brief Sets the feedback-trail-length knob to an absolute value @p v (clamped to [0, 0.95]).
	static void  setMood       ( float v ) { s_moodStrength= clampParam(v, 0.f, 2.5f); }   ///< @brief Sets the global mood-grade strength to an absolute value @p v (clamped to [0, 2.5]).

	// Persist / restore the look parameters above (+ render scale) across runs.
	// loadSettings() is called at startup BEFORE the command line is parsed, so
	// explicit flags (e.g. -s) still override the saved values.
	/** @brief Restores the live-tunable look parameters, render scale and per-shader taste weights from the settings INI. Must be called before the command line is parsed so explicit CLI flags can still override. */
	static void  loadSettings();
	/** @brief Persists the live-tunable look parameters and render scale to the settings INI. */
	static void  saveSettings();
	/** @brief Performs a full (re)build of this instance's GL state: shader programs, image and FBO textures, and all framebuffers, sized for the given display resolution. @param width Display width in pixels. @param height Display height in pixels. */
	void reinit(int width, int height); // full (re)build: shaders, image + FBO textures, FBOs

	// Lightweight resize: re-allocate ONLY the off-screen FBO colour textures to
	// the new size, reusing their texture IDs and FBOs.  Keeps the loaded image
	// textures and shader programs untouched and allocates no new GL objects, so
	// it can be called on every window resize without leaking or reloading images.
	/**
	 * @brief Re-allocates only the off-screen FBO colour/depth textures for a new display size.
	 *
	 * Reuses existing texture ids and FBOs (no glGen()/glCreate() calls, hence no leak), so it is
	 * safe to call on every window resize without reloading images or shader programs.
	 * @param width New display width in pixels.
	 * @param height New display height in pixels.
	 */
	void resize(int width, int height);

	// Baut Trails/StereoMix + delegiert Present/Bloom an den PresentPass.
	/** @brief Builds the feedback/trail ping-pong buffers and the stereo cross-mix shader, and sets up the PresentPass (final tone-mapping/bloom/present target). Called once from reinit(). */
	void setupSafety();


	// Mood-based selection bias: accept a candidate effect with a probability that
	// depends on how well its complexity matches the current arousal (calm music →
	// simple effects, energetic → busy).  Safe: callers retry, then fall back.
	/**
	 * @brief Queries and prints any pending OpenGL error, tagged with a call-site label.
	 * @note Currently short-circuited (unconditional early `return;` at the top of the
	 *       definition in RenderPipeline.cpp) — GL error checking is disabled for normal
	 *       runs; the check code below the early return is dead unless that guard is removed.
	 * @param label Short tag identifying the call site, printed together with the error.
	 */
	void checkGLErrors( const char *label ); // check and print gl errors to stderr


	/** @brief Stores the configuration for this instance ahead of start(): the image directory to scan and the min/max solo/cross-fade durations for the background photo cycle. @param filename Root directory to recursively scan for .png/.jpg images. @param timeTextureSoloMin Minimum seconds an image stays solo before starting to cross-fade. @param timeTextureSoloMax Maximum seconds an image stays solo before starting to cross-fade. @param timeTextureInterpolationMin Minimum seconds an image cross-fade takes. @param timeTextureInterpolationMax Maximum seconds an image cross-fade takes. */
	void init( const QString &filename, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax, unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax );


	/** @brief Builds (first call) or resizes (subsequent calls) the GL state for this instance. First call: scans the image directory, installs fallback shaders if the configuration had none, attaches the SceneScheduler, spawns the ImageLoader thread and calls reinit(). Later calls (revisiting a configuration) just delegate to resize(), which avoids leaking GL objects and spawning a duplicate loader thread. @param width Display width in pixels. @param height Display height in pixels. */
	void start( int width, int height );
	/** @brief Tears down this instance's GL resources and background thread: terminates and deletes the ImageLoader, then releases textures and shader programs. Deliberately does NOT release the global Spout sender/receiver (see the definition for why). */
	void stop();

	/** @brief Registers a combine-effect (overlay) shader with this instance (ownership passes to RenderPipeline). @param shader Combine-effect shader to add. */
	void addFxShader( EffectShader * shader );
	/** @brief Registers a texture-effect shader with this instance (ownership passes to RenderPipeline). @param shader Texture-effect shader to add. */
	void addTextureShader( EffectShader * shader );
	/** @brief Registers a scene-transition shader (Transitions/) with this instance (ownership passes to RenderPipeline). @param shader Transition shader to add. */
	void addTransitionShader( EffectShader * shader );


    bool        m_triggerImageload;      ///< Set by the render thread to request the next background photo from the ImageLoader thread; cleared by ImageLoader once m_nextImage is filled.
    bool        m_waitForImageToLoad;    ///< True between requesting a new image and consuming it in paint() via loadNewTexture().
    QImage      m_nextImage;             ///< The freshly loaded/prepared photo, written by ImageLoader::run(), consumed by loadNewTexture().


	QStringList 	m_imageList;                          ///< Flat list of all image file paths found under the configured image directory (see traverse()).
	QStringList::const_iterator m_imageListIterator;      ///< Current position in m_imageList for the next photo to load.

	// Live mood snapshot for the ImageLoader's mood-matched image choice
	// (written once per frame in paint(), read on the loader thread).
	std::atomic<float> m_moodValence { 0.5f };   ///< Live snapshot of the music's valence (0..1), for the loader thread's mood-matched image choice.
	std::atomic<float> m_moodArousal { 0.5f };   ///< Live snapshot of the music's arousal (0..1), for the loader thread's mood-matched image choice.
	std::atomic<float> m_moodAmbient { 0.f };    ///< Live snapshot of the music's ambient factor (0..1), for the loader thread's mood-matched image choice.

private:

	// Initialise a framebuffer object; depthRb != nullptr additionally creates
	// and attaches a depth renderbuffer (needed by the 3D scene effects).
	/**
	 * @brief Creates (or re-attaches, on re-entry) a framebuffer object with a colour texture attachment.
	 * @param fboEffect FBO id, reused if already non-zero, otherwise created here.
	 * @param texIDEffect Colour texture to attach at m_attachmentpoint.
	 * @param depthRb If non-null, also (re)creates and attaches a depth TEXTURE (not a renderbuffer, despite the parameter name — the combine stage needs to read it) at the id it points to; needed by the 3D scene effects. Null for plain 2D effects.
	 */
	void initFBO(GLuint &fboEffect, GLuint &texIDEffect, GLuint *depthRb = nullptr);
	/**
	 * @brief (Re)creates the shared multisample scratch FBO used to anti-alias 3D scene draws, at the given render resolution.
	 *
	 * One shared MS colour+depth target, reused for whichever 3D scene is
	 * currently drawing (texture1's pass, then texture2's, sequentially --
	 * never both at once, so one scratch target is enough). Soft-fails (does
	 * nothing, leaves m_msaaReady false) if glTexImage2DMultisample wasn't
	 * loaded or GL_MAX_SAMPLES is 0; every 3D draw call site checks
	 * m_msaaReady and falls back to drawing straight into the regular
	 * (unaliased) FBO exactly as before this existed.
	 * @param w Render-resolution width.
	 * @param h Render-resolution height.
	 */
	void ensureMsaaTargets( int w, int h );
	/**
	 * @brief Resolves the shared multisample scratch FBO (colour + depth) into a destination FBO of the same size via glBlitFramebuffer.
	 * @param dstFbo Destination FBO, already sized and attached to match (w, h) exactly.
	 * @param w Width shared by both FBOs.
	 * @param h Height shared by both FBOs.
	 */
	void resolveMsaa( GLuint dstFbo, int w, int h );
	/** @brief Generates (if needed) and configures an FBO colour texture via setupFBOTexture(). @param texID Texture id, reused if already non-zero, otherwise created here. */
	void createFBOTexture( GLuint &texID );
	/** @brief Configures an existing texture id as an FBO colour target: linear filtering, mirrored-repeat wrap, storage sized to m_width x m_height. @param texID Texture id to configure. */
	void setupFBOTexture( const GLuint texID );
	/** @brief Creates the two background "photo" textures (m_actTex/m_nextTex) and uploads their initial images (or the procedural fallback if the image list is empty). */
	void createTexture();  // create and setup textures
	/** @brief Uploads a prepared QImage into an existing texture id, with mipmaps. @param texID Destination texture id. @param image Source image; must already be GL-ready (see prepareImage()) — every RenderPipeline caller passes a 1024x1024 ARGB32 image, which is why later uploads can reuse glTexSubImage2D (see the definition). */
	void setupTexture( const GLuint texID, const QImage &image ); // needed by createTextures()
public:
	// Procedural texture used when the image directory is missing/empty (robustness).
	/** @brief Generates a procedural colourful fallback image, used when the configured image directory is missing or empty. @return A 256x256 ARGB32 image with a sinusoidal colour pattern. */
	static QImage fallbackImage();
private:
	/** @brief Loads and links the legacy outer combine shader program (FxPlain.frag) and resolves its uniform locations. */
	void initGLSL(); // initialize GLSL - shader programs
	/** @brief Legacy fixed-function 3D mesh preview (perspective projection + m_mesh->draw()); see loadObj(). Not called from the active render path in the current build (see paint()'s commented-out "render pass 1" block). @param rotMatrix Column-major rotation matrix for the mesh. @param tx X translation. @param ty Y translation. @param tz Z translation. */
	void drawScene(const float *rotMatrix, float tx, float ty, float tz);
	/** @brief Clears the currently bound framebuffer and draws the shared fullscreen triangle (core-profile-safe: binds the shared empty VAO first). Used by every fullscreen shader pass in this file. */
	void drawWindow();
	/** @brief Deletes the outer combine shader program and asks every registered texture/combine EffectShader to delete its own programs. */
	void cleanShaderPrograms();
	/** @brief Deletes the four effect/combine FBOs and the two background "photo" textures. */
	void cleanTextures();

	/** @brief Checks the currently bound framebuffer's completeness status and prints a diagnostic on failure. @note Currently short-circuited (unconditional early `return true;`) — the check below is dead unless that guard is removed. @return true if complete (always, while short-circuited); false otherwise. */
	bool checkFramebufferStatus(); // framebuffer status to stdout

	/** @brief Recursively scans a directory for .png/.jpg files and appends their paths to @p imageList. @param dirname Directory to scan (recurses into subdirectories). @param imageList Output list; matching file paths are appended. */
	void traverse( const QString& dirname, QStringList& imageList );
	/** @brief Uploads the pending next photo (m_nextImage, filled by ImageLoader) into @p texID. @param texID Destination texture id (m_actTex or m_nextTex after a swap). */
	void loadNewTexture( GLuint &texID );


	Mesh			*m_mesh;   ///< Legacy OBJ mesh for the (currently unused) drawScene() preview path; see loadObj().


	bool			m_npot_supported;   ///< non power of two textures supportet (or not) — set only inside the disabled NPOT-check block in reinit(), so effectively unused in the current build.
	unsigned int	m_width;   ///< texture width — internal render width in pixels (= display width x s_renderScale).
	unsigned int	m_height;   ///< texture height — internal render height in pixels (= display height x s_renderScale).

	GLenum			m_texInternalFormat; ///< Internal GL format used for the effect/combine FBO textures (GL_RGBA8).
	GLenum			m_texFormat;         ///< GL pixel-transfer format matching m_texInternalFormat (GL_RGBA).
	GLenum			m_texType;           ///< GL pixel-transfer data type matching m_texInternalFormat (GL_UNSIGNED_BYTE).
	// Zero-initialised so create*/init* can safely REUSE existing ids instead of
	// generating fresh ones (leak-proof if a rebuild path is ever re-entered).
	GLuint			m_fboEffectTexture1 = 0; ///< FBO of the active texture-effect pass.
	GLuint			m_fboEffectTexture2 = 0; ///< FBO of the incoming (cross-fading) texture-effect pass.
	GLuint			m_fboEffectFx1 = 0; ///< FBO of the active combine-effect pass.
	GLuint			m_fboEffectFx2 = 0; ///< FBO of the incoming (cross-fading) combine-effect pass.
	GLuint			m_fboTransition = 0;     ///< FBO of the scene-transition pass (blends scene A/B during a fade; skipped while solo).
	GLuint			m_depthFbo = 0;          ///< Reserved depth-only FBO id; not assigned by the code in this file (the shadow map has its own m_shadowFbo).
	GLenum			m_attachmentpoint;   ///< where to attach framebuffer objects — colour attachment point used for every FBO colour texture (GL_COLOR_ATTACHMENT0).
	GLuint			m_texID1 = 0;   ///< texture ids of read/write Textures — legacy read/write texture id; unused in the current build (only ever set in the constructor initializer list).
	GLuint			m_texID2 = 0;   ///< Legacy read/write texture id; unused in the current build (only ever set in the constructor initializer list).
	GLuint			m_texIDFBOEffectTexture1 = 0;  ///< Colour texture attached to m_fboEffectTexture1.
	GLuint			m_texIDFBOEffectTexture2 = 0;  ///< Colour texture attached to m_fboEffectTexture2.
	GLuint			m_texIDFBOEffectFx1 = 0;  ///< Colour texture attached to m_fboEffectFx1.
	GLuint			m_texIDFBOEffectFx2 = 0;  ///< Colour texture attached to m_fboEffectFx2.
	GLuint			m_texIDFBOTransition = 0;      ///< Colour texture attached to m_fboTransition (the finished, blended scene the overlays read).

	// Target framebuffer for the final on-screen pass (QOpenGLWidget's FBO, not 0).
	GLuint			m_defaultFBO = 0;   ///< Target framebuffer for the final on-screen pass; see setDefaultFBO().

	// True once start() has built the GL resources, so revisiting a configuration
	// only resizes instead of rebuilding (which leaked programs/textures/FBOs and
	// spawned a duplicate ImageLoader).
	bool			m_started = false;   ///< True once start() has built the GL resources for this instance (see start()).

	// Manual / novelty-driven early scene change + its rate-limit cooldown.

	// ---- Review mode (Test* presets): alphabetical 8 s sequence ----
	// Last-seen analyzer section counter (verse/chorus/bridge detector); a
	// single +1 step forces an early, short cross-fade to the next shader.
	// Last-seen analyzer drop counter (EDM drop detector): +1 = immediate cut.

	// ---- Song-structure memory ----
	// Per analyzer section id: which effect/combine played it and the effect's
	// rolled parameter values.  A RETURNING section (chorus #2) replays the
	// exact same look; a NEW section's fresh look is stored after the switch.

	// Per-transition blend styles (0 linear, 1 wipe, 2 kaleido, 3 zoom),
	// rolled when a change fires; linear stays the most common.

	// Beat-quantised IMAGE change (like the shader changes: pending until the
	// next downbeat, with a timeout + no-music escape).
	bool			m_pendingImgChange = false;   ///< True while a background-photo cross-fade is pending, waiting to be released on the next downbeat (or timeout/no-music escape).
	float			m_pendingImgAge    = 0.f;     ///< Seconds since m_pendingImgChange was set; forces release after ~2.5 s even without a downbeat.

	// Latest mood state for moodAccept (tag-based shader selection).

	// Finaler Present (Limiter, AutoExposure, Bloom, Titel-Reveal, Stereo):
	// komplett im PresentPass gekapselt.
	PresentPass		m_present;   ///< Final present stage: brightness limiter, auto-exposure, bloom, title reveal, stereo packing — fully encapsulated in PresentPass.
	OverlayFrame	m_overlay;   ///< Lyrics/Künstlerbild, pro Frame von GLwidget gesetzt — lyrics/artist-image overlay state for the current frame, set by GLwidget via setOverlayFrame().

	// ---- Track-title reveal state (see showTitle) ----
	QImage			m_titlePending;          ///< Rendered "title / artist" text image awaiting GL upload (consumed and cleared at the top of the next paint()).

	// Virtual camera + Zeit-Regie (drop-rewind, break-scrub, echo, letterbox,
	// shockwave) state now lives in m_audioConditioner (see AudioConditioner.h);
	// paint() reads it back via camZoom()/camRot()/rewindBack()/... after
	// calling update().


	// ---- Feedback / trails (phosphor-style ping-pong) ----
	GLuint			m_fboTrail[2]   = { 0, 0 };   ///< Ping-pong FBOs for the phosphor-style feedback/trails pass.
	GLuint			m_texTrail[2]   = { 0, 0 };   ///< Ping-pong colour textures backing m_fboTrail (mipmapped: the present pass reads them).

	// 2D CAMERA RIG scratch targets (one per effect slot; lazily created and
	// size-checked EVERY use, so RenderPipeline::resize() needs no extra case).
	// rig2Transform() renders src through Engine/Rig2D.frag when the effect
	// has active rig2 formulas and returns the texture the combine should
	// bind instead; src unchanged otherwise.
	GLuint			m_rig2Fbo[2]    = { 0, 0 };   ///< Per-slot scratch FBOs for the 2D camera rig transform (rig2Transform()).
	GLuint			m_rig2Tex[2]    = { 0, 0 };   ///< Per-slot scratch colour textures backing m_rig2Fbo.
	int				m_rig2W = 0, m_rig2H = 0;     ///< Size the m_rig2Fbo/m_rig2Tex scratch targets were last (re)allocated at; re-checked on every rig2Transform() call.
	/**
	 * @brief Applies a scene's 2D camera-rig transform (roll/zoom/pan) to a finished effect frame, if it declares one.
	 *
	 * Renders @p srcTex through Engine/Rig2D.frag into a per-slot scratch texture and returns
	 * that texture id; @p srcTex itself is left untouched. Returns @p srcTex unchanged (zero
	 * extra cost) when @p fx has no active rig2 formulas.
	 * @param fx Effect shader whose rig2() formulas (if any) drive the transform.
	 * @param srcTex Source colour texture (the effect's rendered output).
	 * @param slot Which scratch target to use (0 = active effect slot, 1 = incoming effect slot).
	 * @return The transformed texture id, or @p srcTex unchanged if no rig2 transform applies.
	 */
	GLuint			rig2Transform( EffectShader *fx, GLuint srcTex, int slot );
	int				m_trailIdx      = 0;    ///< Ping-pong index (0/1) of the trail buffer written this frame; the other holds the previous frame.
	GLuint			m_trailProgId   = 0;    ///< Feedback/trails shader program (Engine/Feedback.frag).
	GLint			m_trailCurUni   = -1;   ///< Uniform location of "texCur" (this frame's rendered image) in m_trailProgId.
	GLint			m_trailPrevUni  = -1;   ///< Uniform location of "texPrev" (previous trail buffer) in m_trailProgId.
	GLint			m_trailResUni   = -1;   ///< Uniform location of "resolution" in m_trailProgId.
	GLint			m_trailDecayUni = -1;   ///< Uniform location of "decay" (trail persistence) in m_trailProgId.
	GLint			m_trailZoomUni  = -1;   ///< echo-warp: per-frame zoom — uniform location of "warpZoom" in m_trailProgId.
	GLint			m_trailRotUni   = -1;   ///< echo-warp: rotation (radians/frame) — uniform location of "warpRot" in m_trailProgId.
	GLint			m_trailHueUni   = -1;   ///< echo-warp: hue drift of the echoes — uniform location of "hueDrift" in m_trailProgId.
	GLint			m_trailDepthUni = -1;   ///< depth-aware trails (3D scenes) — uniform location of "depth3D" in m_trailProgId.
	float			m_trailDepth3D  = 0.f;  ///< slewed 0..1 "a 3D scene is up" — drives depth-aware trails and camera zoom headroom.
	// Spatial warp field (MilkDrop-style liquid feedback).
	GLint			m_trailRipAmpUni  = -1, m_trailRipPhUni  = -1;   ///< Uniform locations of "rippleAmp"/"ripplePhase" (MilkDrop-style warp-field ripple) in m_trailProgId.
	GLint			m_trailSwirlUni   = -1, m_trailFlowAmpUni = -1;  ///< Uniform locations of "swirlAmp"/"flowAmp" (warp-field swirl and flow amplitude) in m_trailProgId.
	GLint			m_trailFlowPhUni  = -1;                          ///< Uniform location of "flowPhase" (warp-field flow phase) in m_trailProgId.
	float			m_warpRipplePhase = 0.f, m_warpFlowPhase = 0.f;  ///< Accumulated phases (radians-equivalent) driving the ripple and flow components of the warp field; integrated per frame to avoid flicker.
	bool			m_feedbackReady = false;   ///< True once the feedback/trail pipeline (PresentPass + trail FBOs + shader) is fully set up; gates the trails pass in paint().
	bool			m_spoutStarted  = false;   ///< True once the Spout output sender has been successfully initialised.
	GLuint			m_liveTex       = 0;   ///< Spout-in texture (0 = photos) — live input texture (Spout receive or video-in frame) that replaces the photo source this frame.

	// Depth renderbuffers for the two effect FBOs (3D scene effects).
	// Depth attachments of the two texture-effect FBOs.  Textures, not
	// renderbuffers, so the combine stage can READ what the 3D scene wrote
	// ("texDepth0"/"texDepth1", units 29/30).
	GLuint			m_depthTexEffect1 = 0, m_depthTexEffect2 = 0;   ///< Depth textures attached to m_fboEffectTexture1/2 (readable by the combine stage as texDepth0/texDepth1, units 29/30).

	// ---- MSAA scratch target for 3D scene draws (see ensureMsaaTargets()) ----
	static const int kMsaaSamples = 4;   ///< Fixed sample count for the 3D-scene anti-aliasing pass; clamped down to GL_MAX_SAMPLES if the driver reports fewer.
	GLuint			m_msaaFbo      = 0;   ///< Shared multisample FBO, reused by whichever 3D scene (texture1's pass, then texture2's) is currently drawing.
	GLuint			m_msaaColorTex = 0;   ///< GL_TEXTURE_2D_MULTISAMPLE colour attachment (GL_RGBA8, matching m_texInternalFormat).
	GLuint			m_msaaDepthTex = 0;   ///< GL_TEXTURE_2D_MULTISAMPLE depth attachment.
	int				m_msaaW = 0, m_msaaH = 0;   ///< Current size of the MSAA scratch target; ensureMsaaTargets() reallocates on mismatch.
	int				m_msaaActualSamples = 0;   ///< Sample count actually used (<= kMsaaSamples, clamped to GL_MAX_SAMPLES); 0 = not yet created.
	bool			m_msaaTried = false;   ///< True once creation has been attempted (attempted only once; glTexImage2DMultisample missing is a permanent soft-fail, not retried every frame).
	bool			m_msaaReady = false;   ///< True once the MSAA scratch FBO exists and is complete; every 3D draw call site checks this and falls back to the regular (unaliased) FBO when false.

	// ---- shadow map ----
	// A single depth-only target, shared by whichever 3D scene wants it.
	// Created on first use: a scene opts in by declaring "texShadow", and most
	// never do.
	static const int kShadowSize = 2048;    ///< Width/height of the (square) shadow map, in texels.
	GLuint			m_shadowFbo = 0;    ///< Depth-only FBO for the shadow map (created lazily by ensureShadowMap()).
	GLuint			m_shadowTex = 0;    ///< Depth texture backing m_shadowFbo; sampled with hardware percentage-closer filtering.
	// Second, independent shadow-casting light -- same shape of state, entirely
	// separate FBO/texture/matrix so it can move on its own path. A scene opts
	// in via EffectShader::usesShadow2() (declares "texShadow2").
	GLuint			m_shadowFbo2 = 0;   ///< Depth-only FBO for the second shadow map.
	GLuint			m_shadowTex2 = 0;   ///< Depth texture backing m_shadowFbo2.
	AudioFeatures	m_lastAudioFx;   ///< this frame's features, for the shadow pass — cached so renderShadowPass()/renderOitPass() can re-apply them outside the main uniform-setting flow.
	/**
	 * @brief Lazily creates a shadow map's depth-only FBO/texture on first use (shared implementation for both lights).
	 * @param fbo In/out FBO id (created here if 0).
	 * @param tex In/out depth-texture id (created here if 0).
	 * @return true if the shadow map is ready (already existed or was just created successfully); false if creation failed (shadows disabled for this light).
	 */
	bool			ensureShadowMapGeneric( GLuint &fbo, GLuint &tex );
	/**
	 * @brief Recomputes an orthographic light's view-projection matrix and direction for the current time (shared implementation for both lights).
	 * @param t Current global time in seconds, driving the slow light-direction orbit.
	 * @param angleOffset Radians added to the orbit phase, so a second light doesn't move in lockstep with the first.
	 * @param tiltY Base upward tilt of the light direction (>0 = from above); lets the second light read as a cooler, lower fill/rim instead of a second overhead sun.
	 * @param outM Column-major 4x4 view-projection matrix to write (16 floats).
	 * @param outDir Light direction to write (3 floats).
	 */
	void			updateLightMatrixGeneric( float t, float angleOffset, float tiltY, float *outM, float *outDir );
	/**
	 * @brief Renders one 3D scene's geometry into a shadow map, depth only (shared implementation for both lights).
	 * @param fx Scene to render into the shadow map.
	 * @param fbo Target shadow FBO (ensureShadowMapGeneric()'d first).
	 * @param tex Depth texture backing @p fbo, bound to @p texUnit afterward.
	 * @param texUnit Texture unit the shader-side sampler expects this light's map on (31 for light 1, 32 for light 2).
	 * @param passFlag EffectShader::s_shadowPass or s_shadowPass2 -- set to 1 for the draw, restored to 0 after, so the scene's own shaders know which light's depth pass this is.
	 */
	void			renderShadowPassGeneric( EffectShader *fx, GLuint &fbo, GLuint tex, int texUnit, float &passFlag );
	/** @brief Light 1 (the "sun"): lazily creates its shadow map. @return See ensureShadowMapGeneric(). */
	bool			ensureShadowMap() { return ensureShadowMapGeneric( m_shadowFbo, m_shadowTex ); }
	/** @brief Light 1 (the "sun"): recomputes EffectShader::s_lightM/s_lightDir. @param t Current global time in seconds. */
	void			updateLightMatrix(float t) { updateLightMatrixGeneric( t, 0.f, 0.f, EffectShader::s_lightM, EffectShader::s_lightDir ); }
	/** @brief Light 1 (the "sun"): renders @p fx into the shadow map. @param fx Scene to render. */
	void			renderShadowPass(EffectShader *fx) { renderShadowPassGeneric( fx, m_shadowFbo, m_shadowTex, 31, EffectShader::s_shadowPass ); }
	/** @brief Light 2 (cool rim/fill): lazily creates its shadow map. @return See ensureShadowMapGeneric(). */
	bool			ensureShadowMap2() { return ensureShadowMapGeneric( m_shadowFbo2, m_shadowTex2 ); }
	/** @brief Light 2 (cool rim/fill): recomputes EffectShader::s_lightM2/s_lightDir2, offset in phase and tilted lower/cooler than light 1. @param t Current global time in seconds. */
	void			updateLightMatrix2(float t) { updateLightMatrixGeneric( t, 2.4f, 0.35f, EffectShader::s_lightM2, EffectShader::s_lightDir2 ); }
	/** @brief Light 2 (cool rim/fill): renders @p fx into its shadow map. @param fx Scene to render. */
	void			renderShadowPass2(EffectShader *fx) { renderShadowPassGeneric( fx, m_shadowFbo2, m_shadowTex2, 32, EffectShader::s_shadowPass2 ); }

	// ---- order-independent transparency (weighted blended) ----
	// Two extra targets the transparent geometry accumulates into, sharing the
	// scene's depth buffer so transparency is still occluded by opaque solids.
	// Created on first use, like the shadow map.
	GLuint			m_oitFbo = 0;        ///< FBO for the weighted-blended order-independent-transparency (OIT) pass (created lazily by ensureOitTargets()).
	GLuint			m_oitAccum = 0;     ///< RGBA16F: premultiplied colour, weighted — accumulation target summing all transparent layers.
	GLuint			m_oitReveal = 0;    ///< R16F: how much background still shows — revealage target after all transparent layers.
	GLuint			m_oitResolveProg = 0;   ///< Shader program (Engine/OitResolve.frag) that composites m_oitAccum/m_oitReveal back over the opaque frame.
	/** @brief Lazily creates the OIT accumulation/revealage targets and resolve shader on first use. @return true if the OIT targets are ready; false if creation failed (transparent pass disabled). */
	bool			ensureOitTargets();
	/** @brief Draws a scene's transparent geometry into the OIT accumulation targets (sharing @p depthTex for occlusion by opaque solids), then resolves/composites the result back over @p targetFbo. @param fx Scene whose transparent geometry to render. @param depthTex Depth texture from the scene's opaque pass, reused so transparency is still occluded correctly. @param targetFbo Framebuffer to composite the resolved transparency back onto. */
	void			renderOitPass(EffectShader *fx, GLuint depthTex, GLuint targetFbo);
	// FPS EMA for the cube-scene detail budget (see paint()).
	float			m_cubeFpsEma = 60.f;   ///< Exponential moving average of the frame rate, driving Scene3DShader::s_cubeBudget (drops detail below ~45 fps, restores it above ~57 fps).
	// TRUE-STEREO state (real per-eye rendering of a solo 3D scene):
	// hold = a 3D scene is solo while SBS/TB stereo is on (freezes combine
	// switching); now = additionally the combine is solo -> the scene renders
	// per-eye, the combine pass is bypassed and present passthroughs.
	bool			m_trueStereoHold = false;   ///< True while a solo 3D scene is on screen with SBS/TB stereo active; freezes combine cross-fade starts.
	bool			m_trueStereoNow  = false;   ///< True when m_trueStereoHold also has the combine solo: the scene renders per-eye and the combine pass is bypassed (present passthrough).
	// packed = the on-screen frame is eye-packed (solo OR a 3D<->3D texture
	// cross-fade with the combine solo) -> per-eye rendering, plain mixing,
	// trail-warp suppression and present passthrough.
	bool			m_trueStereoPacked = false;   ///< True whenever the on-screen frame is eye-packed (m_trueStereoNow, or a 3D<->3D texture cross-fade with the combine solo): disables combine/trail warps that would smear content across the eye boundary.
	// Plain cross-mix program for packed 3D<->3D cross-fades.
	GLuint			m_stereoMixProgId  = 0;    ///< Plain per-pixel cross-mix shader (Engine/StereoMix.frag) for packed 3D<->3D texture cross-fades.
	GLint			m_stereoMixTexAUni = -1;   ///< Uniform location of "texA" in m_stereoMixProgId.
	GLint			m_stereoMixTexBUni = -1;   ///< Uniform location of "texB" in m_stereoMixProgId.
	GLint			m_stereoMixResUni  = -1;   ///< Uniform location of "resolution" in m_stereoMixProgId.
	GLint			m_stereoMixWUni    = -1;   ///< Uniform location of "interpolation" (cross-fade weight) in m_stereoMixProgId.
	// Fixed-function copy of a texture into the bound FBO (combine bypass).
	/** @brief Draws @p tex into the currently bound framebuffer unchanged (fixed-function-style blit via a tiny dedicated shader). Used by the true-stereo path to pass an eye-packed 3D frame straight through the combine stage. @param tex Source texture to copy. */
	void			blitTexture( GLuint tex );




	ComputeFX		m_cfx;                     ///< GL 4.3 compute-shader sims — generic; effects opt in via their cfxMask().


	// GPU-/Host-Simulationen (RD, Fluid, Smoke3D, Physarum, SSM, Spectro):
	// komplett in GpuSims gekapselt; paint() meldet nur den Bedarf.
	GpuSims			m_sims;   ///< Older GPU/host simulations (reaction-diffusion, fluid, smoke3D, Physarum, self-similarity matrix, spectrogram): fully encapsulated in GpuSims; paint() only reports demand.
	// Szenen-/Combine-Wahl, Trigger, Review, Song-Struktur: SceneScheduler.
	SceneScheduler	m_scheduler;   ///< Scene/combine selection, triggers (novelty/section/drop), review mode and song-structure memory: fully encapsulated in SceneScheduler.
	// Audio-Konditionierung (Envelopes, Slews, integrierte Phasen, Beat-PLL,
	// virtuelle Kamera, Zeit-Regie): komplett in AudioConditioner gekapselt.
	AudioConditioner m_audioConditioner;   ///< Turns each frame's raw AudioFeatures into the anti-flicker copy + camera/Zeit-Regie signals paint() reads back; fully encapsulated in AudioConditioner.

	// Live-tunable look parameters (static → one shared setting across all configs).
	static float	s_reactivity;    ///< audio-motion master gain (default 1.0) — shared across all loaded configurations.
	static float	s_trailAmount;   ///< feedback trail length 0..0.95 (default 0.6).
	static float	s_moodStrength;  ///< global mood-grade strength (default 1.0).
	static float	s_lightShow;     ///< 0 = corner lamps/light-show off (default), 1 = on.
	static float	s_latencyLead;   ///< display-phase lead in seconds (default 0.05).
	static bool		s_blackout;      ///< VJ blackout target (smoothed per instance) — actual fade is smoothed in PresentPass.
	static bool		s_freeze;        ///< VJ freeze: hold the picture — forces frame time to 0.
	static bool		s_pinned;        ///< VJ pin: no effect/combine switches.
	float			m_breakSmooth = 0.f;   ///< slewed DJ-stop hold (freezes motion) — dampens frame-time advance during a DJ stop.

	// ---- Taste learning (persistent, PER PRESET + shader FILE basename) ----
	// Selection-weight factors in [0.3, 2.5], default 1.0, keyed
	// "<PresetName>/<file>" — skipping a shader in Club leaves its standing
	// in Ambient untouched.  A skip shortly after activation multiplies by
	// 0.8, a favourite by 1.25; each app start decays every factor toward
	// 1.0 so old grudges fade.  Soft bias only — moodAccept keeps a floor,
	// no shader is ever excluded.  Storage is shared (static) across the
	// instances; the keys carry the preset namespace.
	static QHash<QString, float> s_taste;   ///< Persistent per-"<Preset>/<file>" selection-weight factors, in [0.3, 2.5], default 1.0; shared (static) across all instances, loaded/saved via loadSettings()/bumpTaste().
	QString			m_presetName;              ///< set by Configuration after load — this instance's preset name, namespacing its taste-learning keys; see setPresetName().
	/** @brief Looks up the persistent taste weight for a fragment file, namespaced by m_presetName. @param fragPath Fragment shader path (only the basename is used as the key). @return The learned weight (default 1.0 if never adjusted). */
	float			tasteFor( const char *fragPath ) const;
	/** @brief Multiplies and persists the taste weight for a fragment file (clamped to [0.3, 2.5]) and writes it to the settings INI immediately. @param fragPath Fragment shader path (only the basename is used as the key). @param mul Multiplier applied to the current weight (e.g. 0.8 for a skip, 1.25 for a favourite). */
	void			bumpTaste( const char *fragPath, float mul );
	/** @brief Clamps @p v to the inclusive range [@p lo, @p hi]. @param v Value to clamp. @param lo Lower bound. @param hi Upper bound. @return The clamped value. */
	static float	clampParam( float v, float lo, float hi )
	{ return v < lo ? lo : (v > hi ? hi : v); }

	// Internal render resolution = display resolution × s_renderScale.  All the
	// expensive offscreen passes use m_width/m_height (= render res); only the final
	// present pass upscales to the display resolution (m_displayW/m_displayH).  Set
	// s_renderScale < 1 to run smoothly on weak GPUs at high display resolutions.
	int				m_displayW = 100;   ///< Display (window) width in pixels, as passed to reinit()/resize().
	int				m_displayH = 100;   ///< Display (window) height in pixels, as passed to reinit()/resize().
	static float	s_renderScale;           ///< 0.25 .. 2.0 (1.0 = native; set via -s) — internal render scale relative to display resolution.
public:
	/** @brief Sets the internal render scale (clamped to [0.25, 2.0]) used by every subsequent reinit()/resize(). @param s Desired render scale (1.0 = native display resolution). */
	static void setRenderScale( float s )
	{ s_renderScale = (s < 0.25f) ? 0.25f : (s > 2.0f ? 2.0f : s); }
	/** @brief Returns the current internal render scale. @return Render scale, 0.25..2.0. */
	static float renderScale() { return s_renderScale; }
private:

	// GLSL vars

		// time since initialization
	QElapsedTimer m_time;   ///< Wall-clock timer running since init/start; not read elsewhere in the active render path (m_nanotimer drives per-frame dt instead).




	//Combination of FBOs
	GLuint			m_sh_prog_id_fx;    ///< Legacy outer "combine of combines" shader program (FxPlain.frag): cross-fades the two combine-effect outputs into the final present source.
	GLuint			m_texPointFxUni1;   ///< Uniform location of "tex0" in m_sh_prog_id_fx (bound to texture unit 5 = m_texIDFBOEffectFx1's output).
	GLuint			m_texPointFxUni2;   ///< Uniform location of "tex1" in m_sh_prog_id_fx (bound to texture unit 6 = m_texIDFBOEffectFx2's output).
	GLuint			m_texSizeRcpFxUni;  ///< Uniform location of "resolution" in m_sh_prog_id_fx.
	GLuint			m_timeFxUni;        ///< Uniform location of "time" in m_sh_prog_id_fx.
    GLuint			m_interpolationFxUni;   ///< Uniform location of "interpolation" (fxTex1/fxTex2 cross-fade weight) in m_sh_prog_id_fx.


    float			m_interpolationFx;   ///< Between 0 and 1 — legacy combine-of-combines cross-fade weight; unused in the current build (only referenced inside a commented-out code block in paint()) — m_scheduler.fxInterp() is used instead.


	QElapsedTimer		m_timeTexture;                       ///< Timer driving the background-photo solo/cross-fade state machine (see m_stateTexture).
	float       m_timeTextureSolo;                          ///< Rolled duration (seconds) an image stays solo before a cross-fade becomes pending.
	float		m_timeTextureInterpolation;                  ///< Rolled duration (seconds) an image cross-fade takes.
	float		m_interpolationTexture;                      ///< Current image cross-fade weight, 1.0 = fully on m_actTex, decreasing toward 0 as m_nextTex fades in.
	unsigned int		m_stateTexture;                      ///< Background-photo state: 1 = solo (showing m_actTex only), 0 = cross-fading toward m_nextTex.
	unsigned int		m_timeTextureInterpolationMin;       ///< Minimum rolled cross-fade duration (seconds), set via init().
	unsigned int		m_timeTextureInterpolationMax;       ///< Maximum rolled cross-fade duration (seconds), set via init().
	unsigned int		m_timeTextureSoloMin;                ///< Minimum rolled solo duration (seconds), set via init().
	unsigned int		m_timeTextureSoloMax;                ///< Maximum rolled solo duration (seconds), set via init().
	GLuint      m_actTex  = 0;    ///< Currently displayed background-photo texture.
	GLuint		m_nextTex = 0;    ///< Incoming background-photo texture (cross-fade target / next solo image).
	int			m_state;          ///< Declared but not read/written anywhere in RenderPipeline.cpp — unused leftover (distinct from m_stateTexture, which is the field actually driving the image state machine).

    float       m_lastTime;      ///< Declared and initialised but otherwise only referenced inside a commented-out debug printf in paint() — effectively unused in the current build.
	float		m_globaltime;     ///< Accumulated wall time (seconds, paused while frozen) driving every time-based shader uniform; advanced once per frame in paint().



	//EffectShader *m_effectTextures[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMinTimeSolo[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMaxTimeSolo[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMinTimeInterpolation[NR_EFFECTS_TEXTURE];
	//unsigned int  m_effectTextureMaxTimeInterpolation[NR_EFFECTS_TEXTURE];

	std::vector<EffectShader *> m_effectTextures;   ///< All configured texture-effect shaders for this preset (registered via addTextureShader()); indexed by the SceneScheduler.


	unsigned int m_effectTextureTimeInterpolation;   ///< Declared but not referenced anywhere in RenderPipeline.cpp — unused leftover from before timing moved to SceneScheduler/EffectShader.
	//unsigned int m_effectTextureMinTimeInterpolation;
	//unsigned int m_effectTextureMaxTimeInterpolation;






	std::vector<EffectShader *> m_effectFx;   ///< All configured combine-effect (overlay) shaders for this preset (registered via addFxShader()); indexed by the SceneScheduler.
	std::vector<EffectShader *> m_effectTransitions;   ///< All configured scene-transition shaders (Transitions/) for this preset (registered via addTransitionShader()); one is rolled per scene fade.


	unsigned int m_effectFxTimeInterpolation;   ///< Declared but not referenced anywhere in RenderPipeline.cpp — unused leftover from before timing moved to SceneScheduler/EffectShader.

    // Dynamic timing scale from AudioAnalyzer (via AudioFeatures::timingScale).
    // < 1.0 → all times scaled longer (ambient mode)
    // > 1.0 → all times scaled shorter (energetic beat music)
    float m_timingScale = 1.f;   ///< Smoothed dynamic timing-scale multiplier (from AudioFeatures::timingScale, gated by musicPresence): <1.0 stretches scene/image durations (ambient), >1.0 shortens them (energetic).

    // Audio-reactive motion integration, slew-limited envelopes, the beat PLL
    // and the colour-chase phase all now live in m_audioConditioner (see
    // AudioConditioner.h) — paint() reads m_audioConditioner.downbeatTick()/
    // gate()/chasePhase() back where it used to read these directly.
    // Beat-quantised scene changes: when a change becomes due it is held PENDING
    // until the next downbeat (or a timeout / no music), so cuts land on the "1".
	//unsigned int m_effectCombineMinTimeInterpolation;
	//unsigned int m_effectCombineMaxTimeInterpolation;


	NanoTimer	m_nanotimer;   ///< debug — per-frame wall-clock timer; its elapsed() drives timeSinceLastFrameSec at the top of paint().
	unsigned int m_nrTextureUploads;   ///< Count of glTexImage2D uploads issued so far for the background-photo textures; the first two (initial m_actTex/m_nextTex) use glTexImage2D, every later photo load reuses that storage via glTexSubImage2D (safe because prepareImage() always returns a fixed 1024x1024 image).

	QString		m_imageDirectory;   ///< Root directory configured for the background-photo scan (see init(), traverse()).

	ImageLoader	*m_imageLoader;   ///< Background thread that decodes/prepares the next photo off the render thread; see ImageLoader.
};


/**
 * @brief Background thread that loads and prepares background-photo images off the render thread.
 *
 * Runs a tight poll loop: whenever the owning RenderPipeline sets m_triggerImageload, it picks
 * the next image (mood-matched: probes a few random candidates and scores them against the
 * live music mood via cached brightness/colourfulness thumbnail stats), decodes and GL-prepares
 * it into m_shader->m_nextImage, and clears the trigger flag. Idles with a short sleep otherwise.
 * One instance is owned per RenderPipeline, started in start() and terminated in stop().
 */
class ImageLoader : public QThread
{
public:
    /** @brief Constructs an ImageLoader bound to its owning RenderPipeline (not yet running; call start()). @param shader Owning RenderPipeline whose m_triggerImageload/m_nextImage/m_imageList/mood snapshot fields this thread reads and writes. */
    explicit ImageLoader( RenderPipeline *shader );
    //explicit Writer(const QString& mark) : mark_(mark) {}

    /** @brief Thread entry point: polls m_shader->m_triggerImageload and, when set, mood-matches and loads the next background photo into m_shader->m_nextImage. Loops forever until the thread is terminated (see RenderPipeline::stop(), which calls QThread::terminate() — a hard kill, not a cooperative exit request). */
    void run();
private:
    RenderPipeline *m_shader;   ///< Owning RenderPipeline; see the constructor.

    // Mood-matched image choice: cached tiny-thumbnail stats per image path
    // (brightness, colourfulness) — loader-thread only, no locking needed.
    /** @brief Computes mean brightness and mean colourfulness (saturation x value) from a fast 32x32-scaled decode of an image. @param path Image file path. @return {meanBrightness, meanColourfulness}, or {0.5, 0.5} if the image could not be decoded. */
    static QPair<float,float> imageStats( const QString &path );
    QHash<QString, QPair<float,float>> m_stats;   ///< Per-path cache of imageStats() results; loader-thread-only, so no locking is needed.
};

#endif

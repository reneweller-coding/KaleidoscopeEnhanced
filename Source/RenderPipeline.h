//---------------------------------------------------------------------------
//                              RenderPipeline
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Declares RenderPipeline, the central per-frame render/present pipeline of one loaded preset (texture-effect +
 *  combine-effect scheduling, cross-fade compositing, feedback/trails, shadow and OIT passes, 2D camera rig, stereo
 *  output, track-title reveal) and its background ImageLoader helper thread.
 *
 *  @author René Weller
 */

#ifndef RENDERPIPELINE_H
#define RENDERPIPELINE_H

#include <set>
#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>
#include <map>
#include <vector>
#include <atomic>
#include <QtCore/QHash>
#include <QtCore/QSet>
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
#include "CueReceiver.h"

class ImageLoader; ///< Forward declaration; background image-loading thread, defined at the bottom of this file.

/** @class RenderPipeline
 *
 * Owns and drives the whole per-frame render/present pipeline of one loaded preset.
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
 **/
class RenderPipeline
{
public:
    /**  Constructs a RenderPipeline with all GL object ids zeroed ("not yet created"); call init() then start()
     * before painting.
     **/
    RenderPipeline();
    /** Releases every GL texture/program owned by this instance and deletes the legacy mesh. */
    ~RenderPipeline();
    /**  Loads/links the GLSL runtime programs needed up front (currently just the legacy outer combine program via
     * initGLSL()); the per-effect and per-combine programs themselves compile lazily on first use.
     **/
    void loadShader(); // load shader from file, compile and link them to programs, get variable locations
    /**  Loads a legacy Wavefront OBJ mesh for the fixed-function drawScene() preview path.
     *
     * @param filename  Path to the .obj file to load. (in)
     *
     * @return
     *   true on success; false (with a stderr message) if the mesh failed to load.
     *
     * @note
     *   drawScene()/loadObj() are legacy: in the current build drawScene() is only referenced from a fully
     *   commented-out block inside paint(), and loadObj() has no active caller (glwidget.cpp keeps only a
     *   commented-out call) — kept for reference / possible reuse.
     **/
    bool loadObj( const char *filename );
    /**  Renders and presents exactly one frame of the visualizer.
     *
     * @param rotMatrix  Column-major 4x4 (or 3x3-in-16, see drawScene()) rotation matrix for the legacy mesh
     *                   preview path. (in)
     * @param tx         X translation for the legacy mesh preview path. (in)
     * @param ty         Y translation for the legacy mesh preview path. (in)
     * @param tz         Z translation for the legacy mesh preview path. (in)
     * @param audio      Optional audio analysis result.  Pass a default-constructed AudioFeatures{} (all zero) to
     *                   disable audio reactivity. Audio-driven motion is integrated into continuous phase offsets
     *                   here (see m_audioRotPhase / m_audioAdvance) so that changing the audio never jumps the
     *                   visual. (in)
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
     **/
    void paint( const float *rotMatrix, float tx, float ty, float tz,
                const AudioFeatures &audio = AudioFeatures{} );

    /**  Sets the framebuffer the final image must be drawn into.
     *
     * @param fbo  Target FBO id (QOpenGLWidget::defaultFramebufferObject() under QOpenGLWidget; 0 for a plain
     *             default framebuffer). (in)
     *
     * Under QOpenGLWidget the visible buffer is NOT 0 but QOpenGLWidget::defaultFramebufferObject(); the widget
     * passes it here every frame before paint().  Defaults to 0.
     **/
    void setDefaultFBO( GLuint fbo ) { m_defaultFBO = fbo; }

    /**  Sets the preset name that namespaces the persistent taste-learning factors.
     *
     * @param n  Preset name (used as the "<PresetName>/<file>" key prefix in tasteFor()/bumpTaste()). (in)
     *
     * Set by Configuration after loading the XML, so likes/dislikes are learned PER PRESET.
     **/
    void setPresetName( const QString &n ) { m_presetName = n; }

    /**  Renders "title / artist" text into a texture for the present pass's kaleidoscopic reveal.
     *
     * @param title   Track title (font auto-shrinks to fit, falling back to eliding only if even the smallest size
     *                doesn't; drawn large and bold). (in)
     * @param artist  Track artist (same auto-shrink/elide fallback; drawn smaller below the title, omitted if
     *                empty). (in)
     *
     * The present pass unfolds the text out of a kaleidoscopic swirl, holds it readable and dissolves it toward the
     * viewer (~8 s).  Called by the widget on a track change (replaces the old QPainter lower third).
     *
     * Only rasterises the text with QPainter into m_titlePending here; the actual GL upload and
     * mood-matched reveal-style pick happen at the next paint() call, where a GL context is current.
     **/
    void showTitle( const QString &title, const QString &artist );

    /** Per-frame state for the lyrics/artist-image overlay, computed by GLwidget and passed through to PresentPass. */
    struct OverlayFrame
    {
        float lyricsAlpha = 0.f;   ///< Lyrics overlay opacity, 0 (hidden) .. 1 (fully visible).
        float lyricsScrollV = 0.f; ///< Vertical scroll offset of the lyrics text block.
        float lyricsAspect = 1.f;  ///< Aspect ratio of the lyrics texture (for correct on-screen scaling).
        // Kinetics: seconds since the active karaoke line changed (slam-in of
        // the fresh line); large = no slam.
        float lyricsLineAge = 999.f; ///< Seconds since the active karaoke line changed; large = no "slam" entrance
                                     ///< animation.
        // Cover palette: two dominant colours of the artist image + strength.
        float paletteAmt = 0.f; ///< Strength with which the cover-art palette colours tint the frame, 0..1.
        float paletteA[3] = { 0.f, 0.f, 0.f }; ///< First dominant cover-art colour (RGB, 0..1).
        float paletteB[3] = { 0.f, 0.f, 0.f }; ///< Second dominant cover-art colour (RGB, 0..1).
        float lyricsHlV0 = -1.f;    ///< Start vertical position of the current word/line highlight sweep (-1 = none).
        float lyricsHlV1 = -1.f;    ///< End vertical position of the current word/line highlight sweep (-1 = none).
        float lyricsHlProg = 0.f;   ///< Progress of the highlight sweep between lyricsHlV0 and lyricsHlV1, 0..1.
        float lyricsUScale = 1.f;   ///< Nominal texture width / actual texture width (<=1); rescales sampling so an
                                    ///< overflow-widened texture doesn't shrink every line's apparent size.
        float lyricsFocusV0 = -1.f; ///< Vertical band of the line currently being read (both scroll and karaoke mode;
                                    ///< -1 = none) -- the one the horizontal marquee below applies to.
        float lyricsFocusV1 = -1.f;            ///< End of the focused line's vertical band.
        float lyricsScrollU = 0.f; ///< Current horizontal marquee offset (texture-U units) for the focused line, 0 if
                                   ///< it fits without scrolling.
        float artistAlpha = 0.f;               ///< Artist-image overlay opacity, 0 (hidden) .. 1 (fully visible).
        float artistAspect = 1.f;              ///< Aspect ratio of the artist-image texture.
    };
    /**  Stores this frame's lyrics/artist overlay state (read back by paint()/PresentPass).
     *
     * @param o  Overlay state computed by the caller (GLwidget). (in)
     **/
    void setOverlayFrame( const OverlayFrame &o ) { m_overlay = o; }
    /**  Spatial spread of the last measured frame -- 0 means a flat surface.
     *
     * @return
     *   Spatial spread of the last measured frame -- 0 means a flat surface.
     **/
    float liveStructure() const { return m_present.liveStructure(); }
    /**  Mean absolute change against the previously measured frame.
     *
     * @return
     *   Mean absolute change against the previously measured frame.
     **/
    float liveMotion() const { return m_present.liveMotion(); }
    /**  Uploads the current lyrics-line texture to the present pass.
     *
     * @param rgba  Packed RGBA8 pixel data. (in)
     * @param w     Image width in pixels. (in)
     * @param h     Image height in pixels. (in)
     **/
    void setLyricsTexture( const void *rgba, int w, int h ) { m_present.setLyricsImage( rgba, w, h ); }
    /**  Uploads the current artist-image texture to the present pass.
     *
     * @param rgba  Packed RGBA8 pixel data. (in)
     * @param w     Image width in pixels. (in)
     * @param h     Image height in pixels. (in)
     **/
    void setArtistTexture( const void *rgba, int w, int h ) { m_present.setArtistImage( rgba, w, h ); }
    /**  Overrides the artist-image corner slot with an externally-owned GL texture (a music-video PiP frame); 0
     * clears the override.
     *
     * @param texId  GL texture id, owned by the caller. (in)
     **/
    void setArtistExternalTexture( GLuint texId ) { m_present.setArtistExternalTexture( texId ); }

    /**  Requests an early cross-fade to the next texture effect (key 'n', MIDI pad, web remote, a track change).
     *
     * @param userSkip  The viewer skipped the scene (true) rather than the music changing (false, no learning). (in)
     *
     * Honoured at the next opportunity; ignored while PIN or FREEZE is active (a message explains why on stderr).
     * TASTE LEARNING, for a skip only: if the current effect has been on screen less than 10 s, skipping it counts
     * as "don't like it" and its persistent taste weight is multiplied down (see bumpTaste()) -- a slowly decaying
     * malus. A track change is no verdict on the scene and learns nothing.
     **/
    void requestSceneChange( bool userSkip = true );
    /**  Video export: waits, in real time and at most @p maxMs, until the model of a fade's incoming scene is loaded.
     *
     * @param maxMs  Longest wait in milliseconds. (in)
     *
     * Live, a fade waiting for its model is held in show time (paint()); an export waits in render time instead, so
     * the fade runs as it would on a machine that loads instantly.
     **/
    void awaitIncomingMesh( int maxMs );

    /**  Lists the preset's texture-effect shader names (bare file names, no path/extension), for a remote scene
     * browser.
     *
     * @return
     *   One name per configured texture effect, in registration order.
     *
     * The browser can jump DIRECTLY to one of them (instant, unquantised, respects pin/freeze).
     **/
    QStringList sceneNames() const;
    /**  Jumps directly to texture effect @p idx (instant, unquantised cut).
     *
     * @param idx  Index into the texture-effect list, as returned by sceneNames(). (in)
     *
     * Ignored while PIN or FREEZE is active, or if @p idx is out of range.
     **/
    void forceScene( int idx );
    /**  Fraction of the frame the active scene's model covered, or -1 when it is not a mesh scene or nothing was
     * measured.
     *
     * @return
     *   Fraction of the frame the active scene's model covered, or -1 when it is not a mesh scene or nothing was
     *   measured.
     *
     * Counted with an occlusion query around the mesh draw (KALEIDO_COVER_LOG).
     * The contact sheets suggested the stations fill about a tenth of the
     * frame; this replaces the impression with a number.
     **/
    float activeCoverage() const;
    /**  Names of the configured combine-effect (overlay) shaders, in list order.
     *
     * @return
     *   One basename per FX, without the .frag suffix.
     **/
    QStringList fxNames() const;
    /**  Force the next overlay to @p idx, bypassing budget/mood/mesh filters (FX sweep).
     *
     * @param idx  Index into fxNames(). (in)
     **/
    void forceFx( int idx );
    /**  Index of the currently active texture effect, into the same list as sceneNames().
     *
     * @return
     *   An index into sceneNames(), or -1 if none is active yet.
     **/
    int activeSceneIndex() const
    {
        return m_effectTextures.empty() ? -1 : static_cast<int>( m_scheduler.actTexture() );
    }
    /**  Whether a scene cross-fade is currently in flight (mid-transition frames blend two scenes, so callers wanting
     * a clean single-scene snapshot should skip them).
     *
     * @return
     *   True while two scenes are blended.
     **/
    bool sceneTransitioning() const { return m_scheduler.texState() != 0; }

    /**  Enables/disables review mode (alphabetical fixed-length walk through every scene, for systematic viewing).
     *
     * @param on  true to enable review mode, false to return to normal mood/taste-driven selection. (in)
     *
     * Review mode (Test* presets): scenes run alphabetically, 25 s each, 'n' steps to the next in order.  No
     * mood/taste filtering, no beat quantisation — a systematic viewing bench.
     **/
    void setReviewMode( bool on ) { m_scheduler.setReviewMode( on ); }
    /**  Preset-wide floor on scene fades (seconds); see SceneScheduler::setSceneFadeMin().
     *
     * @param secs  Shortest scene fade in seconds. (in)
     **/
    void setSceneFadeMin( float secs )
    {
        m_scheduler.setSceneFadeMin( secs );
    }
    /**  The walking chain labs' share of the screen time (preset attribute labShare); see
     * SceneScheduler::setLabShare().
     *
     * @param share  0..1; 0 leaves the labs ordinary entries. (in)
     **/
    void setLabShare( float share ) { m_scheduler.setLabShare( share ); }

    /**  Eagerly compiles every texture-effect and combine-effect shader of this configuration (validation aid; GL
     * context must be current).
     *
     * Enabled by KALEIDO_COMPILE_ALL=1: the log then holds one Compilation/Linking verdict per shader.
     **/
    void compileAllShaders();

    /** Taste learning, positive side (key 'f'): boost the CURRENT effect's
     *  persistent selection weight ("Favorit"). */
    // ---- scene marking ----
    // A shortlist built while WATCHING, then written out as a preset. Separate
    // from taste on purpose: taste biases the scheduler by degrees and decays,
    // whereas a mark is a binary "look at this one again later" that must
    // survive across sessions unchanged. Kept in kaleidoscope_settings.ini
    // under [marked] so an inspection pass can span several runs.
    /**  Marks or unmarks the scene currently on screen.
     *
     * @return
     *   true if it is marked afterwards.
     **/
    bool toggleMarkCurrentScene();
    /**  Whether the scene currently on screen is marked (drives the on-screen indicator).
     *
     * @return
     *   True if it is marked.
     **/
    bool currentSceneMarked() const;
    /**  How many scenes are marked in total.
     *
     * @return
     *   The number of marked scenes.
     **/
    int markedCount() const { return M_Marked.size(); }
    /**  Writes every marked scene to Presets/Marked.xml as a playable preset.
     *
     * @param outPath  Receives the written path (may be null). (out)
     *
     * @return
     *   false if nothing is marked or the file could not be written.
     *
     * Copies each scene's REAL `<TextureShader>` node out of Komplett.xml rather
     * than synthesising a tag, so geom kind and preset parameters survive --
     * a synthesised tag silently drops both and renders the scene wrongly.
     **/
    bool saveMarkedPreset( QString *outPath = nullptr );

    /** Boosts the currently active texture effect's persistent taste weight ("favourite", key 'f'). */
    void favoriteCurrentEffect();
    /**  Cue memory: remember "THIS scene, at THIS point of THIS track" (favourite while a track is identified).
     *
     * @param trackKey  Identity of the playing track (artist and title). (in)
     * @param posSec    Playback position in seconds; negative means unknown, and nothing is stored. (in)
     *
     * Persisted under [cues] in the settings ini.
     **/
    void rememberCue( const QString &trackKey, double posSec );
    /**  Cue memory: per frame -- when the identified track reaches a remembered point (within 2.5 s), force that
     * scene once per playback.
     *
     * @param trackKey  Identity of the playing track (artist and title). (in)
     * @param posSec    Playback position in seconds; negative means unknown. (in)
     **/
    void tickCues( const QString &trackKey, double posSec );
    /**  Index in m_effectTextures of the scene whose base filename is @p base, or -1.
     *
     * @param base  File name without directory and extension, as tasteBase() gives it. (in)
     *
     * @return
     *   The index, or -1 if no scene has that name.
     **/
    int sceneIndexByBase( const QString &base ) const;

    /**  Recompiles every texture-effect/combine-effect program whose fragment file matches @p bareName (dev
     * hot-reload aid; GL context must be current).
     *
     * @param bareName  Bare fragment file name to match (case-insensitive), e.g. "Voyager.frag". (in)
     **/
    void reloadFragment( const QString &bareName );

    // ---- Live-tunable look parameters (shared across all configs; set by hotkeys) ----
    /**  Adjusts the global audio-reactivity gain by @p d (clamped to [0, 3]).
     *
     * @param d  Signed step added to the current gain. (in)
     *
     * @sideeffects
     *   Changes M_Reactivity.
     **/
    static void adjustReactivity( float d )
    {
        M_Reactivity = clampParam( M_Reactivity + d, 0.f, 3.0f );
    }
    /**  Adjusts the feedback-trail-length knob by @p d (clamped to [0, 0.95]).
     *
     * @param d  Signed step added to the current trail amount. (in)
     *
     * @sideeffects
     *   Changes M_TrailAmount.
     **/
    static void adjustTrails( float d )
    {
        M_TrailAmount = clampParam( M_TrailAmount + d, 0.f, 0.95f );
    }
    /**  Adjusts the global mood-grade strength by @p d (clamped to [0, 2.5]).
     *
     * @param d  Signed step added to the current strength. (in)
     *
     * @sideeffects
     *   Changes M_MoodStrength.
     **/
    static void adjustMood( float d )
    {
        M_MoodStrength = clampParam( M_MoodStrength + d, 0.f, 2.5f );
    }
    /**  Returns the current global audio-reactivity gain.
     *
     * @return
     *   The current global audio-reactivity gain.
     **/
    static float reactivity() { return M_Reactivity; }
    /**  Returns the current feedback-trail-length knob.
     *
     * @return
     *   The current feedback-trail-length knob.
     **/
    static float trails() { return M_TrailAmount; }
    /**  Returns the current global mood-grade strength.
     *
     * @return
     *   The current global mood-grade strength.
     **/
    static float mood() { return M_MoodStrength; }

    // Latency compensation: loopback capture + analysis + render + display add
    // up to ~40-80 ms, so phase-locked visuals land slightly AFTER the heard
    // beat.  This leads the DISPLAY phase (tempo pulse, beat/bar phase) by the
    // given seconds; detection envelopes can't be led, but the phase-driven
    // rhythm feel dominates.  Keys ; and ' adjust it in 10 ms steps.
    /**  Adjusts the display-phase latency-compensation lead by @p d seconds (clamped to [0, 0.25]).
     *
     * @param d  Signed step in seconds added to the current lead. (in)
     *
     * @sideeffects
     *   Changes M_LatencyLead.
     **/
    static void adjustLatency( float d )
    {
        M_LatencyLead = clampParam( M_LatencyLead + d, 0.f, 0.25f );
    }
    /**  Sets the display-phase latency-compensation lead to @p v seconds (clamped to [0, 0.25]).
     *
     * @param v  New lead in seconds. (in)
     *
     * @sideeffects
     *   Changes M_LatencyLead.
     **/
    static void setLatency( float v )
    {
        M_LatencyLead = clampParam( v, 0.f, 0.25f );
    }
    /**  Returns the current display-phase latency-compensation lead, in seconds.
     *
     * @return
     *   The current display-phase latency-compensation lead, in seconds.
     **/
    static float latency()
    {
        return M_LatencyLead;
    }

    // Stage "lamps" (corner spotlight cones + haze/mirror-ball/gobo light show).
    // Off by default; toggled with key 'l' and persisted.
    /**  Toggles the stage-lamps light show on/off (key 'l').
     *
     * @sideeffects
     *   Changes M_LightShow.
     **/
    static void toggleLightShow()
    {
        M_LightShow = ( M_LightShow > 0.5f ) ? 0.f : 1.f;
    }
    /**  Sets the stage-lamps light show on/off.
     *
     * @param on  true to enable the corner-lamp light show. (in)
     *
     * @sideeffects
     *   Changes M_LightShow.
     **/
    static void setLightShow( bool on )
    {
        M_LightShow = on ? 1.f : 0.f;
    }
    /**  Returns whether the stage-lamps light show is currently on.
     *
     * @return
     *   True if the stage-lamps light show is currently on.
     **/
    static bool lightShow()
    {
        return M_LightShow > 0.5f;
    }

    // ---- Stereoscopic output (CLI -3 sbs|tb|ana; key 'z' cycles, c/m depth) --
    // The mono frame is DEPTH-REPROJECTED in the present pass: a pseudo-depth
    // (smoothed brightness pops bright structures forward, the radial term
    // sinks the tunnel centre) drives a small horizontal disparity per eye.
    // Side-by-side / top-bottom feed 3D projectors and HMD video viewers
    // (Virtual Desktop, Bigscreen, ...); red-cyan anaglyph works on any
    // screen.  No native OpenXR — deliberately a display-format feature.
    static int   M_StereoMode;  ///< Stereoscopic output mode: 0 off, 1 SBS, 2 top-bottom, 3 anaglyph.
    static float M_StereoDepth; ///< Stereo disparity strength, 0..2 (default 1).
    /**  Cycles to the next stereoscopic output mode (key 'z').
     *
     * @sideeffects
     *   Changes M_StereoMode.
     **/
    static void cycleStereo()
    {
        M_StereoMode = ( M_StereoMode + 1 ) & 3;
    }
    /**  Returns the current stereoscopic output mode.
     *
     * @return
     *   The current stereoscopic output mode.
     **/
    static int stereoMode() { return M_StereoMode; }
    /**  Adjusts the stereo disparity strength by @p d (clamped to [0, 2]).
     *
     * @param d  Signed step added to the current strength. (in)
     *
     * @sideeffects
     *   Changes M_StereoDepth.
     **/
    static void adjustStereoDepth( float d )
    {
        M_StereoDepth = clampParam( M_StereoDepth + d, 0.f, 2.f );
    }
    /**  Returns the current stereo disparity strength.
     *
     * @return
     *   The current stereo disparity strength.
     **/
    static float stereoDepth() { return M_StereoDepth; }
    /**  Sets the stereo disparity strength to an absolute value (clamped to [0, 2]) -- the web remote's slider, next
     * to the keyboard's relative 'c'/'m'.
     *
     * @param v  Disparity strength, clamped to 0..2. (in)
     *
     * @sideeffects
     *   Changes M_StereoDepth.
     **/
    static void setStereoDepth( float v ) { M_StereoDepth = clampParam( v, 0.f, 2.f ); }
    /**  Selects a stereoscopic output mode directly (0 off, 1 SBS, 2 top-bottom, 3 anaglyph) -- the web remote picks
     * one, the keyboard's 'z' cycles.
     *
     * @param m  0 off, 1 side by side, 2 top-bottom, 3 anaglyph; negative values count as 0. (in)
     *
     * @sideeffects
     *   Changes M_StereoMode.
     **/
    static void setStereoMode( int m ) { M_StereoMode = ( m < 0 ) ? 0 : ( m & 3 ); }

    // ---- VJ handbrakes ----
    // Blackout (key 'b'): fade the OUTPUT to black (window, Spout, recording —
    // it multiplies the present pass's brightness scale) and back.
    /**  Toggles VJ blackout (fades the final output to/from black; key 'b').
     *
     * @sideeffects
     *   Changes M_Blackout.
     **/
    static void toggleBlackout()
    {
        M_Blackout = !M_Blackout;
    }
    /**  Returns whether VJ blackout is currently engaged.
     *
     * @return
     *   True if VJ blackout is currently engaged.
     **/
    static bool blackout() { return M_Blackout; }
    // Freeze (key 'e'): hold the picture — the frame time is forced to 0 (all
    // phase integration and envelope motion stops) and the activation clocks
    // are re-armed so no scheduled switch fires behind the frozen image.
    /**  Toggles VJ freeze (holds the picture by forcing frame time to 0; key 'e').
     *
     * @sideeffects
     *   Changes M_Freeze.
     **/
    static void toggleFreeze()
    {
        M_Freeze = !M_Freeze;
    }
    /**  Returns whether VJ freeze is currently engaged.
     *
     * @return
     *   True if VJ freeze is currently engaged.
     **/
    static bool frozen() { return M_Freeze; }
    /**  KALEIDO_FREEZE_TIME=SECONDS (comparison runs): the scene at that time, with silent audio, frozen once it has
     * faded in (5 s) -- two runs with KALEIDO_SEED and KALEIDO_FIXED_PHOTO then give the same frame, pixel for
     * pixel, from the moment it freezes (600 fixed steps of 1/120 s; the log says "FREEZE engaged").
     *
     * @return
     *   The frozen scene time, or a negative value when unset.
     **/
    static float freezeTime();
    // Pin (key 'u'): keep the CURRENT effect/combine on screen — scheduled and
    // forced switches (section/drop/novelty) are suppressed until unpinned.
    /**  Toggles VJ pin (suppresses scheduled/forced effect and combine switches; key 'u').
     *
     * @sideeffects
     *   Changes M_Pinned.
     **/
    static void togglePin()
    {
        M_Pinned = !M_Pinned;
    }
    /**  Returns whether VJ pin is currently engaged.
     *
     * @return
     *   True if VJ pin is currently engaged.
     **/
    static bool pinned() { return M_Pinned; }

    // Spout output (CLI -o): publish the displayed frame as sender "Kaleidoscope".
    static bool M_SpoutEnabled; ///< Whether the Spout output sender ("Kaleidoscope") is enabled (CLI -o).

    /** Video export (VideoExport.h): every frame is exactly this long, in seconds; 0 = a live show on the wall clock.
     *
     * Set once, before the first frame. Besides fixing the frame step it switches off what only makes sense live
     * (the fps-driven cube budget, writing the scene memory) and scales the per-frame trail decay and simulation
     * steps by frameStepScale(), so a 24 or 60 fps export moves like the live show at LiveRefHz.
     **/
    static float M_FrameStep;
    /** The display rate the look was tuned on (Hz): a per-frame trail decay or simulation step means what it means at
     * this rate.
     **/
    static constexpr float LiveRefHz = 120.f;
    /**  How many live frames at LiveRefHz one frame stands for.
     *
     * @return
     *   M_FrameStep * LiveRefHz in a video export (5 at 24 fps, 2 at 60 fps), 1 in a live show.
     **/
    static float frameStepScale() { return M_FrameStep > 0.f ? M_FrameStep * LiveRefHz : 1.f; }

    /** Spout INPUT (CLI -i <sender|any>): a Spout sender's live texture (OBS, Resolume, a webcam through OBS, ...)
     * replaces the photo as the source image of the whole pipeline — the audience becomes the mandala.
     *
     * While no sender runs, the photos are the fallback.
     **/
    static bool M_SpoutInEnabled; ///< Whether Spout input is enabled (CLI -i): a live sender texture replaces the photo
                                  ///< source.
    static QString M_SpoutInSender; ///< Name of the Spout sender to receive from, or "any" (CLI -i argument).
    // Native video as an image source (CLI -v).  Feeds the same m_liveTex slot
    // as Spout does, so every effect gets moving footage without knowing.
    // Spout wins if both are given: it is the live feed, the file is not.
    static QString M_VideoPath; ///< Path to a video file used as a live image source (CLI -v); ignored if Spout input
                                ///< is also enabled.

    static QString M_WarmLabel; ///< What the per-frame lazy warm-up did last frame; diagnostics only
                                ///< (KALEIDO_FRAME_LOG).

    /**  Keeps only a small working set of mesh scenes resident in GL memory.
     *
     * Called once per frame from beginFrame(). Stamps the active and incoming
     * scenes as used and gives back the vertex buffers of the least recently
     * seen mesh scenes beyond the budget (KALEIDO_MESH_BUDGET, default 16).
     **/
    void trimMeshResidency();

private:
    QHash<EffectShader *, qint64> m_meshLastUse; ///< Last frame stamp at which a mesh scene was active or fading in.
    qint64                        m_meshUseClock = 0; ///< Monotonic frame counter behind m_meshLastUse.

public:
    /**  Label of the last warm-up step ("glsl <file>", "mesh <file>", "fx <file>" or empty).
     *
     * @return
     *   Label of the last warm-up step ("glsl <file>", "mesh <file>", "fx <file>" or empty). Diagnostics only.
     **/
    static const QString &lastWarmLabel() { return M_WarmLabel; }

    /** @name Photo-source directory
     *  Where the background photos come from, resolved in init().  Three
     *  layers, most specific first: the CLI `-f <dir>`, then `imageDirectory`
     *  in kaleidoscope_settings.ini, then the preset's own ImageDirectory
     *  attribute (which ships pointing at the bundled Images/ folder).
     *
     *  The ini layer exists because the presets are GENERATED by
     *  Tools/make_genre_configs.py -- a user who edited the XML to point at
     *  their own pictures would silently lose that on the next regeneration,
     *  so the persistent per-user answer must live outside those files.
     *  @{ */
    static QString M_ImageDirCli;  ///< CLI `-f <dir>` photo-source override; empty when not given.
    static QString M_ImageDirUser; ///< `imageDirectory` from kaleidoscope_settings.ini; empty means "use the preset's".
    /** @} */

    // Human-readable names of the currently active / cross-fading effects (debug overlay).
    /**  Builds a human-readable multi-line summary of the currently active/cross-fading texture effect and combine
     * (debug overlay).
     *
     * @return
     *   "TEX ...\nCOMB ..." text, including the incoming shader name and cross-fade percentage while a fade is in
     *   progress.
     **/
    QString activeShaderInfo() const;
    // Absolute setters (e.g. MIDI knobs map a 0..1 value to the full range).
    /**  Sets the global audio-reactivity gain to an absolute value @p v (clamped to [0, 3]; e.g. from a MIDI knob).
     *
     * @param v  New gain. (in)
     *
     * @sideeffects
     *   Changes M_Reactivity.
     **/
    static void setReactivity( float v )
    {
        M_Reactivity = clampParam( v, 0.f, 3.0f );
    }
    /**  Sets the feedback-trail-length knob to an absolute value @p v (clamped to [0, 0.95]).
     *
     * @param v  New trail amount. (in)
     *
     * @sideeffects
     *   Changes M_TrailAmount.
     **/
    static void setTrails( float v )
    {
        M_TrailAmount = clampParam( v, 0.f, 0.95f );
    }
    /**  Sets the global mood-grade strength to an absolute value @p v (clamped to [0, 2.5]).
     *
     * @param v  New strength. (in)
     *
     * @sideeffects
     *   Changes M_MoodStrength, M_RenderScale, M_RenderScaleMax.
     **/
    static void setMood( float v )
    {
        M_MoodStrength = clampParam( v, 0.f, 2.5f );
    }

    // Persist / restore the look parameters above (+ render scale) across runs.
    // loadSettings() is called at startup BEFORE the command line is parsed, so
    // explicit flags (e.g. -s) still override the saved values.
    /**  Restores the live-tunable look parameters, render scale and per-shader taste weights from the settings INI.
     *
     * Must be called before the command line is parsed so explicit CLI flags can still override.
     *
     * @sideeffects
     *   Changes EffectShader::M_ChainSS, EffectShader::M_ChainScale, EffectShader::M_ClassNovelty,
     *   EffectShader::M_ClassSeen, EffectShader::M_ClassTaste, M_CalmMotion, M_ChainScaleIni, M_ImageDirUser,
     *   M_LatencyLead, M_MoodStrength, M_Reactivity, M_StereoDepth, M_StereoMode, M_Taste, M_TrailAmount.
     **/
    static void loadSettings();
    /** Persists the live-tunable look parameters and render scale to the settings INI. */
    static void saveSettings();
    /**  Performs a full (re)build of this instance's GL state: shader programs, image and FBO textures, and all
     * framebuffers, sized for the given display resolution.
     *
     * @param width   Display width in pixels. (in)
     * @param height  Display height in pixels. (in)
     **/
    void reinit( int width, int height ); // full (re)build: shaders, image + FBO textures, FBOs

    // Lightweight resize: re-allocate ONLY the off-screen FBO colour textures to
    // the new size, reusing their texture IDs and FBOs.  Keeps the loaded image
    // textures and shader programs untouched and allocates no new GL objects, so
    // it can be called on every window resize without leaking or reloading images.
    /**  Re-allocates only the off-screen FBO colour/depth textures for a new display size.
     *
     * @param width   New display width in pixels. (in)
     * @param height  New display height in pixels. (in)
     *
     * Reuses existing texture ids and FBOs (no glGen()/glCreate() calls, hence no leak), so it is
     * safe to call on every window resize without reloading images or shader programs.
     **/
    void resize( int width, int height );

    // Builds trails/stereo mix + delegates present/bloom to the PresentPass.
    /**  Builds the feedback/trail ping-pong buffers and the stereo cross-mix shader, and sets up the PresentPass
     * (final tone-mapping/bloom/present target).
     *
     * Called once from reinit().
     **/
    void setupSafety();


    // Mood-based selection bias: accept a candidate effect with a probability that
    // depends on how well its complexity matches the current arousal (calm music →
    // simple effects, energetic → busy).  Safe: callers retry, then fall back.
    /**  Queries and prints any pending OpenGL error, tagged with a call-site label.
     *
     * @param label  Short tag identifying the call site, printed together with the error. (in)
     *
     * @note
     *   Currently short-circuited (unconditional early `return;` at the top of the definition in
     *   RenderPipeline.cpp) — GL error checking is disabled for normal runs; the check code below the early return
     *   is dead unless that guard is removed.
     **/
    void checkGLErrors( const char *label ); // check and print gl errors to stderr


    /**  Stores the configuration for this instance ahead of start(): the image directory to scan and the min/max
     * solo/cross-fade durations for the background photo cycle.
     *
     * @param directory                    Root directory to recursively scan for .png/.jpg images. (in)
     * @param timeTextureSoloMin           Minimum seconds an image stays solo before starting to cross-fade. (in)
     * @param timeTextureSoloMax           Maximum seconds an image stays solo before starting to cross-fade. (in)
     * @param timeTextureInterpolationMin  Minimum seconds an image cross-fade takes. (in)
     * @param timeTextureInterpolationMax  Maximum seconds an image cross-fade takes. (in)
     **/
    void init( const QString &directory, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax,
               unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax );


    /**  Builds (first call) or resizes (subsequent calls) the GL state for this instance.
     *
     * @param width   Display width in pixels. (in)
     * @param height  Display height in pixels. (in)
     *
     * First call: scans the image directory, installs fallback shaders if the configuration had none, attaches the
     * SceneScheduler, spawns the ImageLoader thread and calls reinit(). Later calls (revisiting a configuration) just
     * delegate to resize(), which avoids leaking GL objects and spawning a duplicate loader thread.
     **/
    void start( int width, int height );
    /**  Tears down this instance's GL resources and background thread: terminates and deletes the ImageLoader, then
     * releases textures and shader programs.
     *
     * Deliberately does NOT release the global Spout sender/receiver (see the definition for why).
     **/
    void stop();

    /**  Registers a combine-effect (overlay) shader with this instance (ownership passes to RenderPipeline).
     *
     * @param shader  Combine-effect shader to add. (in)
     **/
    void addFxShader( EffectShader *shader );
    /**  Registers a texture-effect shader with this instance (ownership passes to RenderPipeline).
     *
     * @param shader  Texture-effect shader to add. (in)
     **/
    void addTextureShader( EffectShader *shader );
    /**  Registers a scene-transition shader (Transitions/) with this instance (ownership passes to RenderPipeline).
     *
     * @param shader  Transition shader to add. (in)
     **/
    void addTransitionShader( EffectShader *shader );


private:
    friend class ImageLoader; // the loader thread fills m_nextImage and reads the mood snapshot

    bool m_triggerImageload;   ///< Set by the render thread to request the next background photo from the ImageLoader
                               ///< thread; cleared by ImageLoader once m_nextImage is filled.
    bool m_waitForImageToLoad; ///< True between requesting a new image and consuming it in paint() via
                               ///< loadNewTexture().
    QImage m_nextImage;        ///< The freshly loaded/prepared photo, written by ImageLoader::run(), consumed by
                               ///< loadNewTexture().


    QStringList m_imageList; ///< Flat list of all image file paths found under the configured image directory (see
                             ///< traverse()).
    QStringList::const_iterator m_imageListIterator; ///< Current position in m_imageList for the next photo to load.

    // Live mood snapshot for the ImageLoader's mood-matched image choice
    // (written once per frame in paint(), read on the loader thread).
    std::atomic<float> m_moodValence{ 0.5f }; ///< Live snapshot of the music's valence (0..1), for the loader thread's
                                              ///< mood-matched image choice.
    std::atomic<float> m_moodArousal{ 0.5f }; ///< Live snapshot of the music's arousal (0..1), for the loader thread's
                                              ///< mood-matched image choice.
    std::atomic<float> m_moodAmbient{ 0.f };  ///< Live snapshot of the music's ambient factor (0..1), for the loader
                                              ///< thread's mood-matched image choice.

private:
    // Initialise a framebuffer object; depthRb != nullptr additionally creates
    // and attaches a depth renderbuffer (needed by the 3D scene effects).
    /**  Creates (or re-attaches, on re-entry) a framebuffer object with a colour texture attachment.
     *
     * @param fboEffect           FBO id, reused if already non-zero, otherwise created here. (in,out)
     * @param texIDEffectTexture  Colour texture to attach at m_attachmentpoint. (in,out)
     * @param depthRb             If non-null, also (re)creates and attaches a depth TEXTURE (not a renderbuffer,
     *                            despite the parameter name — the combine stage needs to read it) at the id it
     *                            points to; needed by the 3D scene effects. Null for plain 2D effects. (in)
     **/
    void initFBO( GLuint &fboEffect, GLuint &texIDEffectTexture, GLuint *depthRb = nullptr );
    /**  (Re)creates the shared multisample scratch FBO used to anti-alias 3D scene draws, at the given render
     * resolution.
     *
     * @param w  Render-resolution width. (in)
     * @param h  Render-resolution height. (in)
     *
     * One shared MS colour+depth target, reused for whichever 3D scene is
     * currently drawing (texture1's pass, then texture2's, sequentially --
     * never both at once, so one scratch target is enough). Soft-fails (does
     * nothing, leaves m_msaaReady false) if glTexImage2DMultisample wasn't
     * loaded or GL_MAX_SAMPLES is 0; every 3D draw call site checks
     * m_msaaReady and falls back to drawing straight into the regular
     * (unaliased) FBO exactly as before this existed.
     **/
    void ensureMsaaTargets( int w, int h );
    /**  Resolves the shared multisample scratch FBO (colour + depth) into a destination FBO of the same size via
     * glBlitFramebuffer.
     *
     * @param dstFbo  Destination FBO, already sized and attached to match (w, h) exactly. (in)
     * @param w       Width shared by both FBOs. (in)
     * @param h       Height shared by both FBOs. (in)
     **/
    void resolveMsaa( GLuint dstFbo, int w, int h ) const;
    /**  Generates (if needed) and configures an FBO colour texture via setupFBOTexture().
     *
     * @param texID  Texture id, reused if already non-zero, otherwise created here. (in,out)
     **/
    void createFBOTexture( GLuint &texID );
    /**  Configures an existing texture id as an FBO colour target: linear filtering, mirrored-repeat wrap, storage
     * sized to m_width x m_height.
     *
     * @param texID  Texture id to configure. (in)
     **/
    void setupFBOTexture( const GLuint texID ) const;
    /**  Creates the two background "photo" textures (m_actTex/m_nextTex) and uploads their initial images (or the
     * procedural fallback if the image list is empty).
     **/
    void createTexture(); // create and setup textures
    /**  Uploads a prepared QImage into an existing texture id, with mipmaps.
     *
     * @param texID  Destination texture id. (in)
     * @param image  Source image; must already be GL-ready (see prepareImage()) — every RenderPipeline caller
     *               passes a 1024x1024 ARGB32 image, which is why later uploads can reuse glTexSubImage2D (see the
     *               definition). (in)
     **/
    void setupTexture( const GLuint texID, const QImage &image ); // needed by createTextures()
public:
    // Procedural texture used when the image directory is missing/empty (robustness).
    /**  Generates a procedural colourful fallback image, used when the configured image directory is missing or
     * empty.
     *
     * @return
     *   A 256x256 ARGB32 image with a sinusoidal colour pattern.
     **/
    static QImage fallbackImage();

private:
    /** Loads and links the legacy outer combine shader program (FxPlain.frag) and resolves its uniform locations. */
    void initGLSL(); // initialize GLSL - shader programs
    /**  Legacy fixed-function 3D mesh preview (perspective projection + m_mesh->draw()); see loadObj().
     *
     * @param rotMatrix  Column-major rotation matrix for the mesh. (in)
     * @param tx         X translation. (in)
     * @param ty         Y translation. (in)
     * @param tz         Z translation. (in)
     *
     * Not called from the active render path in the current build (see paint()'s commented-out "render pass 1" block).
     **/
    void drawScene( const float *rotMatrix, float tx, float ty, float tz );
    /**  Clears the currently bound framebuffer and draws the shared fullscreen triangle (core-profile-safe: binds the
     * shared empty VAO first).
     *
     * Used by every fullscreen shader pass in this file.
     **/
    void drawWindow();
    /**  Deletes the outer combine shader program and asks every registered texture/combine EffectShader to delete its
     * own programs.
     **/
    void cleanShaderPrograms();
    /** Deletes the four effect/combine FBOs and the two background "photo" textures. */
    void cleanTextures();

    /**  Checks the currently bound framebuffer's completeness status and prints a diagnostic on failure.
     *
     * @return
     *   true if complete (always, while short-circuited); false otherwise.
     *
     * @note
     *   Currently short-circuited (unconditional early `return true;`) — the check below is dead unless that guard
     *   is removed.
     **/
    bool checkFramebufferStatus(); // framebuffer status to stdout

    /**  Recursively scans a directory for .png/.jpg files and appends their paths to @p imageList.
     *
     * @param dirname    Directory to scan (recurses into subdirectories). (in)
     * @param imageList  Output list; matching file paths are appended. (out)
     **/
    void traverse( const QString &dirname, QStringList &imageList );
    /**  Uploads the pending next photo (m_nextImage, filled by ImageLoader) into @p texID.
     *
     * @param texID  Destination texture id (m_actTex or m_nextTex after a swap). (in,out)
     **/
    void loadNewTexture( GLuint &texID );


    Mesh *m_mesh; ///< Legacy OBJ mesh for the (currently unused) drawScene() preview path; see loadObj().


    bool m_npotSupported;  ///< non power of two textures supportet (or not) — set only inside the disabled NPOT-check
                           ///< block in reinit(), so effectively unused in the current build.
    unsigned int m_width;  ///< texture width — internal render width in pixels (= display width x M_RenderScale).
    unsigned int m_height; ///< texture height — internal render height in pixels (= display height x M_RenderScale).

    GLenum m_texInternalFormat; ///< Internal GL format used for the effect/combine FBO textures (GL_RGBA8).
    GLenum m_texFormat;         ///< GL pixel-transfer format matching m_texInternalFormat (GL_RGBA).
    GLenum m_texType;           ///< GL pixel-transfer data type matching m_texInternalFormat (GL_UNSIGNED_BYTE).
    // Zero-initialised so create*/init* can safely REUSE existing ids instead of
    // generating fresh ones (leak-proof if a rebuild path is ever re-entered).
    GLuint m_fboEffectTexture1 = 0;      ///< FBO of the active texture-effect pass.
    GLuint m_fboEffectTexture2 = 0;      ///< FBO of the incoming (cross-fading) texture-effect pass.
    GLuint m_fboEffectFx1 = 0;           ///< FBO of the active combine-effect pass.
    GLuint m_fboEffectFx2 = 0;           ///< FBO of the incoming (cross-fading) combine-effect pass.
    GLuint m_fboTransition = 0; ///< FBO of the scene-transition pass (blends scene A/B during a fade; skipped while
                                ///< solo).
    GLuint m_depthFbo = 0;    ///< Reserved depth-only FBO id; not assigned by the code in this file (the shadow map has
                              ///< its own m_shadowFbo).
    GLenum m_attachmentpoint; ///< where to attach framebuffer objects — colour attachment point used for every FBO
                              ///< colour texture (GL_COLOR_ATTACHMENT0).
    GLuint m_texID1 = 0; ///< texture ids of read/write Textures — legacy read/write texture id; unused in the current
                         ///< build (only ever set in the constructor initializer list).
    GLuint m_texID2 = 0; ///< Legacy read/write texture id; unused in the current build (only ever set in the
                         ///< constructor initializer list).
    GLuint m_texIDFBOEffectTexture1 = 0; ///< Colour texture attached to m_fboEffectTexture1.
    GLuint m_texIDFBOEffectTexture2 = 0; ///< Colour texture attached to m_fboEffectTexture2.
    GLuint m_texIDFBOEffectFx1 = 0;      ///< Colour texture attached to m_fboEffectFx1.
    GLuint m_texIDFBOEffectFx2 = 0;      ///< Colour texture attached to m_fboEffectFx2.
    GLuint m_texIDFBOTransition = 0; ///< Colour texture attached to m_fboTransition (the finished, blended scene the
                                     ///< overlays read).
    std::set<GLuint> m_sceneMipTex; ///< Scene textures currently switched to mipmapped filtering for an FX that samples
                                    ///< them with textureLod (see renderOverlayPass()); reset to GL_LINEAR once no such
                                    ///< FX is on screen.

    // Target framebuffer for the final on-screen pass (QOpenGLWidget's FBO, not 0).
    GLuint m_defaultFBO = 0; ///< Target framebuffer for the final on-screen pass; see setDefaultFBO().

    // True once start() has built the GL resources, so revisiting a configuration
    // only resizes instead of rebuilding (which leaked programs/textures/FBOs and
    // spawned a duplicate ImageLoader).
    bool  m_started = false;       ///< True once start() has built the GL resources for this instance (see start()).
    float m_expoFadeTail = 0.f;    ///< Seconds left of the post-fade exposure grace window; see runPresentPass().
    bool  m_expoWasFading = false; ///< Previous frame's strict-fade state; the falling edge triggers the exposure's
                                   ///< measurement snap.
    GLuint m_fadeInTex = 0; ///< The incoming scene's composite while a fade runs (this frame), else 0; the exposure
                            ///< measures it instead of the mix.

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
    bool m_pendingImgChange = false; ///< True while a background-photo cross-fade is pending, waiting to be released on
                                     ///< the next downbeat (or timeout/no-music escape).
    float m_pendingImgAge = 0.f; ///< Seconds since m_pendingImgChange was set; forces release after ~2.5 s even without
                                 ///< a downbeat.

    // Latest mood state for moodAccept (tag-based shader selection).

    // Finaler Present (Limiter, AutoExposure, Bloom, Titel-Reveal, Stereo):
    // komplett im PresentPass gekapselt.
    PresentPass m_present;  ///< Final present stage: brightness limiter, auto-exposure, bloom, title reveal, stereo
                            ///< packing — fully encapsulated in PresentPass.
    OverlayFrame m_overlay; ///< Lyrics/artist-image overlay state for the current frame, set by GLwidget via
                            ///< setOverlayFrame().

    // ---- Track-title reveal state (see showTitle) ----
    QImage m_titlePending; ///< Rendered "title / artist" text image awaiting GL upload (consumed and cleared at the top
                           ///< of the next paint()).

    // Virtual camera + Zeit-Regie (drop-rewind, break-scrub, echo, letterbox,
    // shockwave) state now lives in m_audioConditioner (see AudioConditioner.h);
    // paint() reads it back via camZoom()/camRot()/rewindBack()/... after
    // calling update().


    // ---- Feedback / trails (phosphor-style ping-pong) ----
    GLuint m_fboTrail[2] = { 0, 0 }; ///< Ping-pong FBOs for the phosphor-style feedback/trails pass.
    GLuint m_texTrail[2] = { 0, 0 }; ///< Ping-pong colour textures backing m_fboTrail (mipmapped: the present pass
                                     ///< reads them).

    // 2D CAMERA RIG scratch targets (one per effect slot; lazily created and
    // size-checked EVERY use, so RenderPipeline::resize() needs no extra case).
    // rig2Transform() renders src through Engine/Rig2D.frag when the effect
    // has active rig2 formulas and returns the texture the combine should
    // bind instead; src unchanged otherwise.
    GLuint       m_rig2Fbo[2] = { 0, 0 }; ///< Per-slot scratch FBOs for the 2D camera rig transform (rig2Transform()).
    GLuint       m_rig2Tex[2] = { 0, 0 }; ///< Per-slot scratch colour textures backing m_rig2Fbo.
    unsigned int m_rig2W = 0, /**< Width (pixels) the m_rig2Fbo/m_rig2Tex scratch targets were last (re)allocated at; 0
                                 = not yet created. */
        m_rig2H = 0;          ///< Size the m_rig2Fbo/m_rig2Tex scratch targets were last (re)allocated at;
                              ///< re-checked on every rig2Transform() call.
    /**  Applies a scene's 2D camera-rig transform (roll/zoom/pan) to a finished effect frame, if it declares one.
     *
     * @param fx      Effect shader whose rig2() formulas (if any) drive the transform. (in)
     * @param srcTex  Source colour texture (the effect's rendered output). (in)
     * @param slot    Which scratch target to use (0 = active effect slot, 1 = incoming effect slot). (in)
     *
     * @return
     *   The transformed texture id, or @p srcTex unchanged if no rig2 transform applies.
     *
     * Renders @p srcTex through Engine/Rig2D.frag into a per-slot scratch texture and returns
     * that texture id; @p srcTex itself is left untouched. Returns @p srcTex unchanged (zero
     * extra cost) when @p fx has no active rig2 formulas.
     **/
    GLuint rig2Transform( EffectShader *fx, GLuint srcTex, int slot );
    int m_trailIdx = 0; ///< Ping-pong index (0/1) of the trail buffer written this frame; the other holds the previous
                        ///< frame.
    GLuint m_trailProgId = 0;    ///< Feedback/trails shader program (Engine/Feedback.frag).
    GLint  m_trailCurUni = -1;   ///< Uniform location of "texCur" (this frame's rendered image) in m_trailProgId.
    GLint  m_trailPrevUni = -1;  ///< Uniform location of "texPrev" (previous trail buffer) in m_trailProgId.
    GLint  m_trailResUni = -1;   ///< Uniform location of "resolution" in m_trailProgId.
    GLint  m_trailDecayUni = -1; ///< Uniform location of "decay" (trail persistence) in m_trailProgId.
    GLint  m_trailStepsUni = -1; ///< Uniform location of "decaySteps" (live frames per frame, frameStepScale()) in
                                 ///< m_trailProgId.
    GLint m_trailZoomUni = -1;   ///< echo-warp: per-frame zoom — uniform location of "warpZoom" in m_trailProgId.
    GLint m_trailRotUni = -1; ///< echo-warp: rotation (radians/frame) — uniform location of "warpRot" in m_trailProgId.
    GLint m_trailHueUni = -1; ///< echo-warp: hue drift of the echoes — uniform location of "hueDrift" in m_trailProgId.
    GLint m_trailDepthUni = -1;  ///< depth-aware trails (3D scenes) — uniform location of "depth3D" in m_trailProgId.
    float m_trailDepth3D = 0.f;  ///< slewed 0..1 "a 3D scene is up" — drives depth-aware trails and camera zoom
                                 ///< headroom.
    float m_meshUp = 0.f; ///< slewed 0..1 "a loaded-model scene is up" — damps the time echo, whose scaled ghost reads
                          ///< as a fault on a solid object.
    float m_meshHoldSecs = 0.f; ///< How long the current fade has been held waiting for an async mesh warm-up; releases
                                ///< at 5 s so a stuck load can never wedge the show.
    // Spatial warp field (MilkDrop-style liquid feedback).
    GLint m_trailRipAmpUni = -1,   /**< Uniform location of "rippleAmp" (warp-field ripple amplitude, uv units) in
                                      m_trailProgId; -1 = absent. */
        m_trailRipPhUni = -1;      ///< Uniform locations of "rippleAmp"/"ripplePhase"
                                   ///< (MilkDrop-style warp-field ripple) in m_trailProgId.
    GLint m_trailSwirlUni = -1,    /**< Uniform location of "swirlAmp" (warp-field swirl, rad/s) in m_trailProgId; -1 =
                                      absent. */
        m_trailFlowAmpUni = -1;    ///< Uniform locations of "swirlAmp"/"flowAmp" (warp-field swirl
                                   ///< and flow amplitude) in m_trailProgId.
    GLint m_trailFlowPhUni = -1;   ///< Uniform location of "flowPhase" (warp-field flow phase) in m_trailProgId.
    float m_warpRipplePhase = 0.f, /**< Accumulated ripple phase (radians), advanced per frame at 2..7 rad/s depending
                                      on the smoothed beat; uploaded as "ripplePhase". */
        m_warpFlowPhase = 0.f;     ///< Accumulated phases (radians-equivalent) driving the
                                   ///< ripple and flow components of the warp field; integrated
                                   ///< per frame to avoid flicker.
    bool m_feedbackReady = false;  ///< True once the feedback/trail pipeline (PresentPass + trail FBOs + shader) is
                                   ///< fully set up; gates the trails pass in paint().
    bool   m_spoutStarted = false; ///< True once the Spout output sender has been successfully initialised.
    GLuint m_liveTex = 0; ///< Spout-in texture (0 = photos) — live input texture (Spout receive or video-in frame) that
                          ///< replaces the photo source this frame.

    // Depth renderbuffers for the two effect FBOs (3D scene effects).
    // Depth attachments of the two texture-effect FBOs.  Textures, not
    // renderbuffers, so the combine stage can READ what the 3D scene wrote
    // ("texDepth0"/"texDepth1", units 29/30).
    GLuint m_depthTexEffect1 = 0, /**< Depth texture attached to m_fboEffectTexture1 (readable by the combine stage as
                                     texDepth0, unit 29); 0 = not created. */
        m_depthTexEffect2 = 0;    ///< Depth textures attached to m_fboEffectTexture1/2 (readable
                                  ///< by the combine stage as texDepth0/texDepth1, units 29/30).

    // ---- MSAA scratch target for 3D scene draws (see ensureMsaaTargets()) ----
    static const int MsaaSamples = 4; ///< Fixed sample count for the 3D-scene anti-aliasing pass; clamped down to
                                      ///< GL_MAX_SAMPLES if the driver reports fewer.
    GLuint m_msaaFbo = 0; ///< Shared multisample FBO, reused by whichever 3D scene (texture1's pass, then texture2's)
                          ///< is currently drawing.
    GLuint m_msaaColorTex = 0;        ///< GL_TEXTURE_2D_MULTISAMPLE colour attachment (GL_RGBA8, matching
                                      ///< m_texInternalFormat).
    GLuint m_msaaDepthTex = 0;        ///< GL_TEXTURE_2D_MULTISAMPLE depth attachment.
    int    m_msaaW = 0,
           /**< Current width (pixels) of the MSAA scratch target; 0 = not yet created. */ m_msaaH =
               0;                ///< Current size
                                 ///< of the MSAA
                                 ///< scratch
                                 ///< target;
                                 ///< ensureMsaaTargets()
                                 ///< reallocates on
                                 ///< mismatch.
    int m_msaaActualSamples = 0; ///< Sample count actually used (<= MsaaSamples, clamped to GL_MAX_SAMPLES); 0 = not
                                 ///< yet created.
    bool m_msaaTried = false; ///< True once creation has been attempted (attempted only once; glTexImage2DMultisample
                              ///< missing is a permanent soft-fail, not retried every frame).
    bool m_msaaReady = false; ///< True once the MSAA scratch FBO exists and is complete; every 3D draw call site checks
                              ///< this and falls back to the regular (unaliased) FBO when false.

    // ---- shadow map ----
    // A single depth-only target, shared by whichever 3D scene wants it.
    // Created on first use: a scene opts in by declaring "texShadow", and most
    // never do.
    static const int ShadowSize = 2048; ///< Width/height of the (square) shadow map, in texels.
    GLuint           m_shadowFbo = 0;   ///< Depth-only FBO for the shadow map (created lazily by ensureShadowMap()).
    GLuint m_shadowTex = 0; ///< Depth texture backing m_shadowFbo; sampled with hardware percentage-closer filtering.
    // Second, independent shadow-casting light -- same shape of state, entirely
    // separate FBO/texture/matrix so it can move on its own path. A scene opts
    // in via EffectShader::usesShadow2() (declares "texShadow2").
    GLuint        m_shadowFbo2 = 0; ///< Depth-only FBO for the second shadow map.
    GLuint        m_shadowTex2 = 0; ///< Depth texture backing m_shadowFbo2.
    AudioFeatures m_lastAudioFx;    ///< this frame's features, for the shadow pass — cached so
                                    ///< renderShadowPass()/renderOitPass() can re-apply them outside the main
                                    ///< uniform-setting flow.
    /**  Lazily creates a shadow map's depth-only FBO/texture on first use (shared implementation for both lights).
     *
     * @param fbo  In/out FBO id (created here if 0). (in,out)
     * @param tex  In/out depth-texture id (created here if 0). (in,out)
     *
     * @return
     *   true if the shadow map is ready (already existed or was just created successfully); false if creation
     *   failed (shadows disabled for this light).
     **/
    bool ensureShadowMapGeneric( GLuint &fbo, GLuint &tex );
    /**  Recomputes an orthographic light's view-projection matrix and direction for the current time (shared
     * implementation for both lights).
     *
     * @param t            Current global time in seconds, driving the slow light-direction orbit. (in)
     * @param angleOffset  Radians added to the orbit phase, so a second light doesn't move in lockstep with the
     *                     first. (in)
     * @param tiltY        Base upward tilt of the light direction (>0 = from above); lets the second light read as
     *                     a cooler, lower fill/rim instead of a second overhead sun. (in)
     * @param outM         Column-major 4x4 view-projection matrix to write (16 floats). (in)
     * @param outDir       Light direction to write (3 floats). (in)
     **/
    void updateLightMatrixGeneric( float t, float angleOffset, float tiltY, float *outM, float *outDir );
    /**
     * @brief Renders one 3D scene's geometry into a shadow map, depth only (shared implementation for both lights).
     * @param fx Scene to render into the shadow map.
     * @param fbo Target shadow FBO (ensureShadowMapGeneric()'d first).
     * @param tex Depth texture backing @p fbo, bound to @p texUnit afterward.
     * @param texUnit Texture unit the shader-side sampler expects this light's map on (31 for light 1, 32 for light 2).
     * @param passFlag EffectShader::M_ShadowPass or M_ShadowPass2 -- set to 1 for the draw, restored to 0 after, so the
     * scene's own shaders know which light's depth pass this is.
     */
    // tex MUST be a reference, like fbo above it. It was passed by value, and
    // ensureShadowMapGeneric() then wrote the freshly created texture name into
    // the CALL-SITE COPY: the member stayed 0 forever, ensure early-returned on
    // the non-zero fbo every frame after the first, and the post-pass bind
    // bound texture 0 -- EMPTYING the shadow unit each frame. The seven shadow
    // scenes therefore sampled an unbound unit: thousands of driver warnings,
    // and no working shadows at all past frame one.
    void renderShadowPassGeneric( EffectShader *fx, GLuint &fbo, GLuint &tex, int texUnit, float &passFlag );
    /**  Light 1 (the "sun"): lazily creates its shadow map.
     *
     * @return
     *   See ensureShadowMapGeneric().
     **/
    bool ensureShadowMap() { return ensureShadowMapGeneric( m_shadowFbo, m_shadowTex ); }
    /**  Light 1 (the "sun"): recomputes EffectShader::M_LightM/M_LightDir.
     *
     * @param t  Current global time in seconds. (in)
     **/
    void updateLightMatrix( float t )
    {
        updateLightMatrixGeneric( t, 0.f, 0.f, EffectShader::M_LightM, EffectShader::M_LightDir );
    }
    /**  Light 1 (the "sun"): renders @p fx into the shadow map.
     *
     * @param fx  Scene to render. (in)
     **/
    void renderShadowPass( EffectShader *fx )
    {
        renderShadowPassGeneric( fx, m_shadowFbo, m_shadowTex, 31, EffectShader::M_ShadowPass );
    }
    /**  Light 2 (cool rim/fill): lazily creates its shadow map.
     *
     * @return
     *   See ensureShadowMapGeneric().
     **/
    bool ensureShadowMap2() { return ensureShadowMapGeneric( m_shadowFbo2, m_shadowTex2 ); }
    /**  Light 2 (cool rim/fill): recomputes EffectShader::M_LightM2/M_LightDir2, offset in phase and tilted
     * lower/cooler than light 1.
     *
     * @param t  Current global time in seconds. (in)
     **/
    void updateLightMatrix2( float t )
    {
        updateLightMatrixGeneric( t, 2.4f, 0.35f, EffectShader::M_LightM2, EffectShader::M_LightDir2 );
    }
    /**  Light 2 (cool rim/fill): renders @p fx into its shadow map.
     *
     * @param fx  Scene to render. (in)
     **/
    void renderShadowPass2( EffectShader *fx )
    {
        renderShadowPassGeneric( fx, m_shadowFbo2, m_shadowTex2, 32, EffectShader::M_ShadowPass2 );
    }


    // ---- paint() stages -------------------------------------------------
    // paint() was a single 878-line function. It is now the ordered list of
    // calls below, one per stage; the bodies moved out VERBATIM, and each
    // helper's parameters deliberately carry the same names the locals had.
    // The order of these calls is the render order and is load-bearing --
    // almost every stage integrates state or leaves GL bindings the next one
    // relies on, so they are not independently reorderable.

    /**  Per-frame prologue: publishes the mood snapshot the ImageLoader thread reads, and compiles ONE
     * not-yet-compiled shader (lazy warm-up).
     *
     * @param audio  This frame's raw features. (in)
     *
     * @sideeffects
     *   Changes M_WarmLabel.
     **/
    void beginFrame( const AudioFeatures &audio );
    /**  Receives a Spout (-i) or video (-v) frame into m_liveTex, which then replaces BOTH photo slots for this
     * frame.
     **/
    void updateLiveInput();
    /**  Slews m_timingScale toward the audio's suggested scene-duration multiplier (gated by musicPresence).
     *
     * @param audio  This frame's raw features. (in)
     **/
    void updateTimingScale( const AudioFeatures &audio );

    /** One frame's two time bases, both MEASURED in a live show; a video export fixes both at M_FrameStep. */
    struct FrameTiming
    {
        float dt;     ///< Scene time step, later scaled by freeze/DJ-stop.
        float dtWall; ///< Wall-clock step, immune to freeze -- overlays and fades keep moving over a frozen picture.
    };
    /**  Reads the frame timer and updates the fps-driven cube detail budget (a video export: the fixed frame step,
     * budget untouched).
     *
     * @return
     *   This frame's scene and wall-clock time steps.
     *
     * @sideeffects
     *   Changes Scene3DShader::M_CubeBudget.
     **/
    FrameTiming readFrameClock();
    /**  Applies VJ freeze ('e'), VJ pin ('u') and the DJ-stop break-hold to the scene time step.
     *
     * @param audio                  This frame's raw features. (in)
     * @param timeSinceLastFrameSec  Scene time step, modified in place. (in,out)
     * @param dtWall                 Wall-clock step (drives the break slew, which must run even while frozen). (in)
     *
     * @sideeffects
     *   Changes EffectShader::M_FreezeTime, EffectShader::M_Frozen, M_Freeze.
     **/
    void applyTransportModifiers( const AudioFeatures &audio, float &timeSinceLastFrameSec, float dtWall );
    /**  Uploads a pending track-title image (GL context is current here), rolls a mood-matched reveal style, and
     * otherwise advances the reveal clock.
     *
     * @param audio   This frame's raw features (picks the style pool). (in)
     * @param dtWall  Wall-clock step. (in)
     **/
    void updateTitleReveal( const AudioFeatures &audio, float dtWall );
    /**  Runs AudioConditioner exactly once per frame, in frame order (every signal in it is an integrator or slew
     * limiter).
     *
     * @param audio                  This frame's raw features. (in)
     * @param timeSinceLastFrameSec  Scene time step. (in)
     *
     * @return
     *   The anti-flicker feature copy the shaders receive.
     **/
    AudioFeatures conditionAudio( const AudioFeatures &audio, float timeSinceLastFrameSec );
    /**  Drives the photo cross-fade state machine and requests the next image load.
     *
     * @param timeSinceLastFrameSec  Scene time step. (in)
     **/
    void updateImageState( float timeSinceLastFrameSec );
    /**  Fills the scheduler tick and runs the scene half of it (the combine half, tickFx(), must stay after the
     * effect passes -- it needs m_trueStereoHold).
     *
     * @param audio                  This frame's raw features. (in)
     * @param timeSinceLastFrameSec  Scene time step. (in)
     *
     * @return
     *   The tick, reused for tickFx() later in the frame.
     *
     * @sideeffects
     *   Changes EffectShader::M_CueDrops, EffectShader::M_CueLive, EffectShader::M_CueSections.
     **/
    SceneScheduler::Tick buildSchedulerTick( const AudioFeatures &audio, float timeSinceLastFrameSec );
    /**  Steps only the simulations a visible effect actually samples (GpuSims, ComputeFX, Mandelbrot) and binds their
     * outputs, plus last frame's composited image.
     *
     * @param audio                  This frame's raw features. (in)
     * @param timeSinceLastFrameSec  Scene time step. (in)
     * @param audioFx                The conditioned features. (in)
     **/
    void stepSimulations( const AudioFeatures &audio, float timeSinceLastFrameSec, const AudioFeatures &audioFx );
    /** Restores the viewport and binds the two photo slots (or the live frame) to units 0 and 1. */
    void bindSceneInputs();
    /** Recomputes m_trueStereoHold / m_trueStereoPacked / m_trueStereoNow for this frame. */
    void updateTrueStereoState();
    /**  Renders one 3D scene twice into the SBS/TB halves of the bound FBO, scissored so each eye's clear stays
     * inside its half.
     *
     * @param fx  The 3D scene to render per eye. (in)
     **/
    void renderSceneStereo( EffectShader *fx ) const;
    /**  Renders the ACTIVE scene: shadow maps, optional MSAA target, the scene itself, MSAA resolve and the OIT pass.
     *
     * @param audioFx  The conditioned features. (in)
     *
     * @sideeffects
     *   Changes EffectShader::M_DepthValid, EffectShader::M_ShadowExtent.
     **/
    void renderActiveScenePass( const AudioFeatures &audioFx );
    /**  Renders the INCOMING scene, but only while a cross-fade is running (its output is weighted by
     * (1-interpolation), so it is invisible otherwise).
     *
     * @param audioFx  The conditioned features. (in)
     *
     * @sideeffects
     *   Changes EffectShader::M_DepthValid.
     **/
    void renderNextScenePass( const AudioFeatures &audioFx );
    /**  The 2D camera rig, the transition pass and both combine/overlay passes.
     *
     * @param audioFx  The conditioned features. (in)
     **/
    void renderFxStage( const AudioFeatures &audioFx );
    /**  Applies the 2D camera rig (rig2*) to both scene slots and binds them, plus their depth buffers, to units 3/4
     * and 29/30.
     *
     * @return
     *   The texture the transition pass must treat as the outgoing scene.
     **/
    GLuint prepareFxInputs();
    /**  Packed 3D<->3D cross-fade: a plain per-pixel mix of the two eye-packed frames, guaranteed warp-free (any warp
     * would fold content across the eye boundary).
     **/
    void renderStereoMixPass();
    /**  Blends the outgoing and incoming scene with the rolled Transitions/ shader, but only while a scene fade is
     * running.
     *
     * @param audioFx  The conditioned features. (in)
     * @param fxTex1   The outgoing scene, used unchanged when no fade is running. (in)
     *
     * @return
     *   The FINISHED scene the overlay pass must read.
     **/
    GLuint renderTransitionPass( const AudioFeatures &audioFx, GLuint fxTex1 );
    /**  Draws the active combine/overlay shader over the finished scene (both units carry it and interpolation is
     * pinned to 1.0, so overlays never see a half-blended pair).
     *
     * @param audioFx   The conditioned features. (in)
     * @param sceneTex  The finished scene from renderTransitionPass(). (in)
     **/
    void renderOverlayPass( const AudioFeatures &audioFx, GLuint sceneTex );
    /**  Draws the INCOMING combine, but only while combines are cross-fading (the final blend weights it by
     * (1-interpolation), so it is invisible otherwise).
     *
     * @param audioFx  The conditioned features. (in)
     **/
    void renderNextOverlayPass( const AudioFeatures &audioFx );
    /** Blends the two combine outputs into the safety FBO (or straight to screen). */
    void renderFinalBlend();
    /**  The feedback/trails ping-pong with its MilkDrop-style warp field.
     *
     * @param audio                  This frame's raw features. (in)
     * @param audioFx                The conditioned features. (in)
     * @param timeSinceLastFrameSec  Scene time step. (in)
     * @param dtWall                 Wall-clock step. (in)
     *
     * @return
     *   The texture the present pass must display.
     *
     * @sideeffects
     *   Changes s_calm.
     **/
    GLuint renderTrailsPass( const AudioFeatures &audio, const AudioFeatures &audioFx, float timeSinceLastFrameSec,
                             float dtWall );
    /**  Fills PresentPass::Inputs (photosensitivity safety, Zeit-Regie, lyrics/artist overlays, stereo) and runs it.
     *
     * @param presentSource          The texture renderTrailsPass() selected for display. (in)
     * @param audio                  This frame's raw features. (in)
     * @param audioFx                The conditioned features. (in)
     * @param timeSinceLastFrameSec  Scene time step. (in)
     * @param dtWall                 Wall-clock step. (in)
     **/
    void runPresentPass( GLuint presentSource, const AudioFeatures &audio, const AudioFeatures &audioFx,
                         float timeSinceLastFrameSec, float dtWall );

    // ---- order-independent transparency (weighted blended) ----
    // Two extra targets the transparent geometry accumulates into, sharing the
    // scene's depth buffer so transparency is still occluded by opaque solids.
    // Created on first use, like the shadow map.
    GLuint m_oitFbo = 0; ///< FBO for the weighted-blended order-independent-transparency (OIT) pass (created lazily by
                         ///< ensureOitTargets()).
    GLuint m_oitAccum = 0;  ///< RGBA16F: premultiplied colour, weighted — accumulation target summing all transparent
                            ///< layers.
    GLuint m_oitReveal = 0; ///< R16F: how much background still shows — revealage target after all transparent layers.
    GLuint m_oitResolveProg = 0; ///< Shader program (Engine/OitResolve.frag) that composites m_oitAccum/m_oitReveal
                                 ///< back over the opaque frame.
    /**  Lazily creates the OIT accumulation/revealage targets and resolve shader on first use.
     *
     * @return
     *   true if the OIT targets are ready; false if creation failed (transparent pass disabled).
     **/
    bool ensureOitTargets();
    /**  Draws a scene's transparent geometry into the OIT accumulation targets (sharing @p depthTex for occlusion by
     * opaque solids), then resolves/composites the result back over @p targetFbo.
     *
     * @param fx         Scene whose transparent geometry to render. (in)
     * @param depthTex   Depth texture from the scene's opaque pass, reused so transparency is still occluded
     *                   correctly. (in)
     * @param targetFbo  Framebuffer to composite the resolved transparency back onto. (in)
     *
     * @sideeffects
     *   Changes EffectShader::M_OitPass.
     **/
    void renderOitPass( EffectShader *fx, GLuint depthTex, GLuint targetFbo );
    // FPS EMA for the cube-scene detail budget (see paint()).
    float m_cubeFpsEma = 60.f; ///< Exponential moving average of the frame rate, driving Scene3DShader::M_CubeBudget
                               ///< (drops detail below ~45 fps, restores it above ~57 fps).
    // TRUE-STEREO state (real per-eye rendering of a solo 3D scene):
    // hold = a 3D scene is solo while SBS/TB stereo is on (freezes combine
    // switching); now = additionally the combine is solo -> the scene renders
    // per-eye, the combine pass is bypassed and present passthroughs.
    bool m_trueStereoHold = false; ///< True while a solo 3D scene is on screen with SBS/TB stereo active; freezes
                                   ///< combine cross-fade starts.
    bool m_trueStereoNow = false;  ///< True when m_trueStereoHold also has the combine solo: the scene renders per-eye
                                   ///< and the combine pass is bypassed (present passthrough).
    // packed = the on-screen frame is eye-packed (solo OR a 3D<->3D texture
    // cross-fade with the combine solo) -> per-eye rendering, plain mixing,
    // trail-warp suppression and present passthrough.
    bool m_trueStereoPacked = false; ///< True whenever the on-screen frame is eye-packed (m_trueStereoNow, or a 3D<->3D
                                     ///< texture cross-fade with the combine solo): disables combine/trail warps that
                                     ///< would smear content across the eye boundary.
    // Plain cross-mix program for packed 3D<->3D cross-fades.
    GLuint m_stereoMixProgId = 0;  ///< Plain per-pixel cross-mix shader (Engine/StereoMix.frag) for packed 3D<->3D
                                   ///< texture cross-fades.
    GLint m_stereoMixTexAUni = -1; ///< Uniform location of "texA" in m_stereoMixProgId.
    GLint m_stereoMixTexBUni = -1; ///< Uniform location of "texB" in m_stereoMixProgId.
    GLint m_stereoMixResUni = -1;  ///< Uniform location of "resolution" in m_stereoMixProgId.
    GLint m_stereoMixWUni = -1;    ///< Uniform location of "interpolation" (cross-fade weight) in m_stereoMixProgId.
    // Fixed-function copy of a texture into the bound FBO (combine bypass).
    /**  Draws @p tex into the currently bound framebuffer unchanged (fixed-function-style blit via a tiny dedicated
     * shader).
     *
     * @param tex  Source texture to copy. (in)
     *
     * Used by the true-stereo path to pass an eye-packed 3D frame straight through the combine stage.
     **/
    void blitTexture( GLuint tex );




    ComputeFX m_cfx;                     ///< GL 4.3 compute-shader sims — generic; effects opt in via their cfxMask().
    GLuint    m_cfxLast[CFX_COUNT] = {}; ///< Texture each compute sim published last (bound again while frozen).


    // GPU/host simulations (RD, fluid, Smoke3D, Physarum, SSM, spectro): fully
    // encapsulated in GpuSims; paint() only reports the demand.
    GpuSims m_sims; ///< Older GPU/host simulations (reaction-diffusion, fluid, smoke3D, Physarum, self-similarity
                    ///< matrix, spectrogram): fully encapsulated in GpuSims; paint() only reports demand.
    // Szenen-/Combine-Wahl, Trigger, Review, Song-Struktur: SceneScheduler.
    SceneScheduler m_scheduler; ///< Scene/combine selection, triggers (novelty/section/drop), review mode and
                                ///< song-structure memory: fully encapsulated in SceneScheduler.
    ScoreCueBridge m_cueBridge; ///< Carries the section/drop counters across the switch between the score cues and the
                                ///< audio analysis (CueReceiver.h); one per pipeline, beside the scheduler it feeds.
    // Audio-Konditionierung (Envelopes, Slews, integrierte Phasen, Beat-PLL,
    // virtuelle Kamera, Zeit-Regie): komplett in AudioConditioner gekapselt.
    AudioConditioner m_audioConditioner; ///< Turns each frame's raw AudioFeatures into the anti-flicker copy +
                                         ///< camera/Zeit-Regie signals paint() reads back; fully encapsulated in
                                         ///< AudioConditioner.

    // Live-tunable look parameters (static → one shared setting across all configs).
    static float M_Reactivity; ///< audio-motion master gain (default 1.0) — shared across all loaded configurations.
    static float M_TrailAmount;      ///< feedback trail length 0..0.95 (default 0.6).
    static bool M_CalmMotion; ///< settings key calmMotion (default true): no beat-driven whole-frame motion anywhere in
                              ///< the host (virtual camera, rewind, shockwave, trail beat-warp). Rule V7d; Rene has
                              ///< gaming sickness.
    static float M_MoodStrength;     ///< global mood-grade strength (default 1.0).
    static float M_LightShow;        ///< 0 = corner lamps/light-show off (default), 1 = on.
    static float M_LatencyLead;      ///< display-phase lead in seconds (default 0.05).
    static bool  M_Blackout; ///< VJ blackout target (smoothed per instance) — actual fade is smoothed in PresentPass.
    static bool  M_Freeze;           ///< VJ freeze: hold the picture — forces frame time to 0.
    static float M_ChainScaleIni; ///< chainScale as the ini has it (the session's value may be lowered by the quality
                                  ///< profile).
    static bool M_Pinned;            ///< VJ pin: no effect/combine switches.
    float m_breakSmooth = 0.f; ///< slewed DJ-stop hold (freezes motion) — dampens frame-time advance during a DJ stop.

    // ---- Taste learning (persistent, PER PRESET + shader FILE basename) ----
    // Selection-weight factors in [0.3, 2.5], default 1.0, keyed
    // "<PresetName>/<file>" — skipping a shader in Club leaves its standing
    // in Ambient untouched.  A skip shortly after activation multiplies by
    // 0.8, a favourite by 1.25; each app start decays every factor toward
    // 1.0 so old grudges fade.  Soft bias only — moodAccept keeps a floor,
    // no shader is ever excluded.  Storage is shared (static) across the
    // instances; the keys carry the preset namespace.
    static QSet<QString> M_Marked; ///< Base filenames ("Ocean.frag") of scenes marked for review; persisted under
                                   ///< [marked] in the settings ini.
    static QHash<QString, float> M_Taste; ///< Persistent per-"<Preset>/<file>" selection-weight factors, in [0.3, 2.5],
                                          ///< default 1.0; shared (static) across all instances, loaded/saved via
                                          ///< loadSettings()/bumpTaste().
    static QHash<QString, QList<QPair<double, QString>>> M_Cues; ///< Cue memory: track key -> (position in s, scene
                                                                 ///< base file). Loaded from [cues] in the ini.
    QString   m_cueTrack;   ///< Track key the fired-set below belongs to; a new track resets it.
    QSet<int> m_cuesFired;  ///< Cues (indices into M_Cues[m_cueTrack]) already fired during this playback.
    QString   m_presetName; ///< set by Configuration after load — this instance's preset name, namespacing its
                            ///< taste-learning keys; see setPresetName().
    /**  Looks up the persistent taste weight for a fragment file, namespaced by m_presetName.
     *
     * @param fragPath  Fragment shader path (only the basename is used as the key). (in)
     *
     * @return
     *   The learned weight (default 1.0 if never adjusted).
     **/
    float tasteFor( const char *fragPath ) const;
    /**  Multiplies and persists the taste weight for a fragment file (clamped to [0.3, 2.5]) and writes it to the
     * settings INI immediately.
     *
     * @param fragPath  Fragment shader path (only the basename is used as the key). (in)
     * @param mul       Multiplier applied to the current weight (e.g. 0.8 for a skip, 1.25 for a favourite). (in)
     *
     * @sideeffects
     *   Changes M_Taste.
     **/
    void bumpTaste( const char *fragPath, float mul );
    /**  Stores the scheduler's no-repeat memory in the settings file (group history, key: the preset name), and the
     * chain classes seen since the last call (group classSeen).
     *
     * @param names  The memory, oldest first (shader file names). (in)
     *
     * Called by the scheduler whenever a scene has come on screen (about once a minute), so a restart -- or a crash
     * -- loses at most the scene on screen.
     *
     * @sideeffects
     *   Clears EffectShader::M_ClassSeenDirty.
     **/
    void saveHistory( const std::vector<std::string> &names ) const;
    /**  Clamps @p v to the inclusive range [@p lo, @p hi].
     *
     * @param v   Value to clamp. (in)
     * @param lo  Lower bound. (in)
     * @param hi  Upper bound. (in)
     *
     * @return
     *   The clamped value.
     **/
    static float clampParam( float v, float lo, float hi )
    {
        return v < lo ? lo : ( v > hi ? hi : v );
    }

    // Internal render resolution = display resolution × M_RenderScale.  All the
    // expensive offscreen passes use m_width/m_height (= render res); only the final
    // present pass upscales to the display resolution (m_displayW/m_displayH).  Set
    // M_RenderScale < 1 to run smoothly on weak GPUs at high display resolutions.
    int          m_displayW = 100; ///< Display (window) width in pixels, as passed to reinit()/resize().
    int          m_displayH = 100; ///< Display (window) height in pixels, as passed to reinit()/resize().
    static float M_RenderScale; ///< 0.25 .. 2.0 (1.0 = native; set via -s) — internal render scale relative to display
                                ///< resolution.
public:
    /** True only when -s was given on the command line.
     *
     * The adaptive controller is allowed to treat an EXPLICIT -s as a ceiling,
     * but it must not treat the persisted M_RenderScale that way: that value is
     * whatever the controller itself last wrote, so using it as the ceiling makes
     * the adaptation one-way (see GLwidget::updateAdaptiveScale()).
     **/
    static bool  M_RenderScaleFromCli;
    static float M_RenderScaleMax; ///< Ceiling the adaptive scaler may raise to (ini key renderScaleMax); >1.0
                                   ///< supersamples.
    /**  Sets the internal render scale (clamped to [0.25, 2.0]) used by every subsequent reinit()/resize().
     *
     * @param s  Desired render scale (1.0 = native display resolution). (in)
     *
     * @sideeffects
     *   Changes M_RenderScale.
     **/
    static void setRenderScale( float s )
    {
        M_RenderScale = ( s < 0.25f ) ? 0.25f : ( s > 2.0f ? 2.0f : s );
    }

    // Supersampling ceiling. Above 1.0 the scene is rendered larger than the
    // window and downsampled, which is the only anti-aliasing that helps here:
    // MSAA smooths geometric edges but still runs the fragment shader once per
    // pixel, and in a catalogue of 528 procedural shaders most aliasing comes
    // from shader-computed detail, not from polygon edges. It also covers the
    // 292 Scene2D shaders, which get no MSAA at all.
    /**  Sets the upper bound the adaptive scaler may raise the render scale to (1.0 = off, 2.0 = 4x the pixels).
     *
     * @param s  Ceiling, clamped to 0.5..2.0. (in)
     *
     * @sideeffects
     *   Changes M_RenderScaleMax.
     **/
    static void setRenderScaleMax( float s )
    {
        M_RenderScaleMax = ( s < 0.5f ) ? 0.5f : ( s > 2.0f ? 2.0f : s );
    }
    /**  The supersampling ceiling.
     *
     * @return
     *   Ceiling in 0.5..2.0; 1.0 means no supersampling.
     **/
    static float renderScaleMax() { return M_RenderScaleMax; }
    /**  Returns the current internal render scale.
     *
     * @return
     *   Render scale, 0.25..2.0.
     **/
    static float renderScale() { return M_RenderScale; }

private:
    // GLSL vars

    // time since initialization
    QElapsedTimer m_time; ///< Wall-clock timer running since init/start; not read elsewhere in the active render path
                          ///< (m_nanotimer drives per-frame dt instead).




    // Combination of FBOs
    GLuint m_shProgIdFx; ///< Legacy outer "combine of combines" shader program (FxPlain.frag): cross-fades the two
                         ///< combine-effect outputs into the final present source.
    GLuint m_texPointFxUni1;     ///< Uniform location of "tex0" in m_shProgIdFx (bound to texture unit 5 =
                                 ///< m_texIDFBOEffectFx1's output).
    GLuint m_texPointFxUni2;     ///< Uniform location of "tex1" in m_shProgIdFx (bound to texture unit 6 =
                                 ///< m_texIDFBOEffectFx2's output).
    GLuint m_texSizeRcpFxUni;    ///< Uniform location of "resolution" in m_shProgIdFx.
    GLuint m_timeFxUni;          ///< Uniform location of "time" in m_shProgIdFx.
    GLuint m_interpolationFxUni; ///< Uniform location of "interpolation" (fxTex1/fxTex2 cross-fade weight) in
                                 ///< m_shProgIdFx.


    float m_interpolationFx; ///< Between 0 and 1 — legacy combine-of-combines cross-fade weight; unused in the current
                             ///< build (only referenced inside a commented-out code block in paint()) —
                             ///< m_scheduler.fxInterp() is used instead.


    WallClock m_timeTexture; ///< Engine-clock timer driving the background-photo solo/cross-fade state machine (see
                             ///< m_stateTexture).
    float m_timeTextureSolo; ///< Rolled duration (seconds) an image stays solo before a cross-fade becomes pending.
    float m_timeTextureInterpolation;           ///< Rolled duration (seconds) an image cross-fade takes.
    float m_interpolationTexture; ///< Current image cross-fade weight, 1.0 = fully on m_actTex, decreasing toward 0 as
                                  ///< m_nextTex fades in.
    unsigned int m_stateTexture;  ///< Background-photo state: 1 = solo (showing m_actTex only), 0 = cross-fading toward
                                  ///< m_nextTex.
    unsigned int m_timeTextureInterpolationMin; ///< Minimum rolled cross-fade duration (seconds), set via init().
    unsigned int m_timeTextureInterpolationMax; ///< Maximum rolled cross-fade duration (seconds), set via init().
    unsigned int m_timeTextureSoloMin;          ///< Minimum rolled solo duration (seconds), set via init().
    unsigned int m_timeTextureSoloMax;          ///< Maximum rolled solo duration (seconds), set via init().
    GLuint       m_actTex = 0;                  ///< Currently displayed background-photo texture.
    GLuint       m_nextTex = 0; ///< Incoming background-photo texture (cross-fade target / next solo image).

    float m_globaltime; ///< Accumulated wall time (seconds, paused while frozen) driving every time-based shader
                        ///< uniform; advanced once per frame in paint().

    std::vector<EffectShader *> m_effectTextures; ///< All configured texture-effect shaders for this preset (registered
                                                  ///< via addTextureShader()); indexed by the SceneScheduler.

    std::vector<EffectShader *> m_effectFx; ///< All configured combine-effect (overlay) shaders for this preset
                                            ///< (registered via addFxShader()); indexed by the SceneScheduler.
    std::vector<EffectShader *> m_effectTransitions; ///< All configured scene-transition shaders (Transitions/) for
                                                     ///< this preset (registered via addTransitionShader()); one is
                                                     ///< rolled per scene fade.

    // Dynamic timing scale from AudioAnalyzer (via AudioFeatures::timingScale).
    // < 1.0 → all times scaled longer (ambient mode)
    // > 1.0 → all times scaled shorter (energetic beat music)
    float m_timingScale = 1.f; ///< Smoothed dynamic timing-scale multiplier (from AudioFeatures::timingScale, gated by
                               ///< musicPresence): <1.0 stretches scene/image durations (ambient), >1.0 shortens them
                               ///< (energetic).

    // Audio-reactive motion integration, slew-limited envelopes, the beat PLL
    // and the colour-chase phase all now live in m_audioConditioner (see
    // AudioConditioner.h) — paint() reads m_audioConditioner.downbeatTick()/
    // gate()/chasePhase() back where it used to read these directly.
    // Beat-quantised scene changes: when a change becomes due it is held PENDING
    // until the next downbeat (or a timeout / no music), so cuts land on the "1".
    // unsigned int m_effectCombineMinTimeInterpolation;
    // unsigned int m_effectCombineMaxTimeInterpolation;


    NanoTimer m_nanotimer; ///< debug — per-frame wall-clock timer; its elapsed() drives timeSinceLastFrameSec at the
                           ///< top of paint().
    unsigned int m_nrTextureUploads; ///< Count of glTexImage2D uploads issued so far for the background-photo textures;
                                     ///< the first two (initial m_actTex/m_nextTex) use glTexImage2D, every later photo
                                     ///< load reuses that storage via glTexSubImage2D (safe because prepareImage()
                                     ///< always returns a fixed 1024x1024 image).

    QString m_imageDirectory; ///< Root directory configured for the background-photo scan (see init(), traverse()).

    ImageLoader *m_imageLoader = nullptr; ///< Background thread that decodes/prepares the next photo off the render
                                          ///< thread; see ImageLoader. Null while stopped -- start() recreates it, and
                                          ///< it was previously left uninitialised AND dangling after stop().
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    RenderPipeline( const RenderPipeline & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    RenderPipeline &operator=( const RenderPipeline & ) = delete;
};


/** @class ImageLoader
 *
 * Background thread that loads and prepares background-photo images off the render thread.
 *
 * Runs a tight poll loop: whenever the owning RenderPipeline sets m_triggerImageload, it picks
 * the next image (mood-matched: probes a few random candidates and scores them against the
 * live music mood via cached brightness/colourfulness thumbnail stats), decodes and GL-prepares
 * it into m_shader->m_nextImage, and clears the trigger flag. Idles with a short sleep otherwise.
 * One instance is owned per RenderPipeline, started in start() and terminated in stop().
 **/
class ImageLoader : public QThread
{
public:
    /**  Constructs an ImageLoader bound to its owning RenderPipeline (not yet running; call start()).
     *
     * @param shader  Owning RenderPipeline whose m_triggerImageload/m_nextImage/m_imageList/mood snapshot fields
     *                this thread reads and writes. (in)
     **/
    explicit ImageLoader( RenderPipeline *shader );
    // explicit Writer(const QString& mark) : mark_(mark) {}

    /**  Thread entry point: polls m_shader->m_triggerImageload and, when set, mood-matches and loads the next
     * background photo into m_shader->m_nextImage.
     *
     * Loops forever until the thread is terminated (see RenderPipeline::stop(), which calls QThread::terminate() — a
     * hard kill, not a cooperative exit request).
     **/
    void run();

private:
    RenderPipeline *m_shader; ///< Owning RenderPipeline; see the constructor.

    // Mood-matched image choice: cached tiny-thumbnail stats per image path
    // (brightness, colourfulness) — loader-thread only, no locking needed.
    /**  Computes mean brightness and mean colourfulness (saturation x value) from a fast 32x32-scaled decode of an
     * image.
     *
     * @param path  Image file path. (in)
     *
     * @return
     *   {meanBrightness, meanColourfulness}, or {0.5, 0.5} if the image could not be decoded.
     **/
    static QPair<float, float>          imageStats( const QString &path );
    QHash<QString, QPair<float, float>> m_stats; ///< Per-path cache of imageStats() results; loader-thread-only, so no
                                                 ///< locking is needed.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    ImageLoader( const ImageLoader & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    ImageLoader &operator=( const ImageLoader & ) = delete;
};

#endif

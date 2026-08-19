/**
 * @file PreviewWidget.h
 * @brief Live preview widget: renders one texture shader folded through one
 *        combine shader, exactly as the main app's two-pass pipeline does,
 *        but with a single fixed selection and a synthesized (animated) set
 *        of audio uniforms so that audio-reactive shaders still move.
 *
 * Two texture-shader paths live here side by side.  type="normal" keeps the
 * original self-contained pipeline: QOpenGLShaderProgram + QOpenGLFramebuffer-
 * Object + QOpenGLFunctions, no EffectShader.  type="scene3d" hands off to
 * Scene3DPreview, which renders a REAL Scene3DShader (procedural geometry,
 * shadow map, order-independent transparency) through the engine's own Qt-
 * free rendering core.  The two never mix GL bindings in this file — see
 * Scene3DPreview.h for why that would be a silent, hard-to-find bug.
 */
#pragma once

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QOpenGLFunctions>
#include <QtCore/QElapsedTimer>
#include <QtCore/QString>
#include <vector>
#include <memory>

#include "../Source/AudioFeatures.h"
#include "../Source/CfxTypes.h"
#include "ComputeFXPreview.h"
#include "Scene3DPreview.h"

class QOpenGLShaderProgram;
class QOpenGLFramebufferObject;
class QOpenGLTexture;
class QOpenGLVertexArrayObject;
class ExprProgram;

/**
 * @brief Live OpenGL preview pane rendering one texture shader through one combine shader.
 *
 * Owns the whole editor preview pipeline: compiles/links both shaders each
 * time the selection changes (or, for type="scene3d", hands the texture
 * stage off to an owned Scene3DPreview instance), redraws at ~60 fps via a
 * QTimer, and drives every audio-reactive uniform from either a synthesized
 * Beat/Drone profile or a precomputed WAV AudioFeatures timeline, so shaders
 * animate sensibly with no live audio device attached. It also implements
 * the headless probe-render path main.cpp drives via
 * --render/--transcheck/--cfxcheck (paintGL() plus the inherited
 * QOpenGLWidget::grabFramebuffer()), so this one class serves both the
 * interactive GUI and the command-line self-tests.
 */
class PreviewWidget : public QOpenGLWidget, protected QOpenGLFunctions
{
    Q_OBJECT
public:
    /**
     * @brief Construct the preview widget for one project.
     * @param projectRoot Filesystem root every shader/config path is resolved against.
     * @param parent Optional Qt parent widget.
     */
    explicit PreviewWidget(const QString &projectRoot, QWidget *parent = nullptr);
    /// Destroys GL resources (shader programs, FBOs, sample textures, VBO/VAO) with the context current.
    ~PreviewWidget() override;

    /**
     * @brief Select the texture (pass-1) shader to preview.
     *
     * type/geom/stateBytes/shadowExtent only matter for type="scene3d"; the
     * defaults keep every existing call site (self-tests, --render) on the
     * original type="normal" path unchanged.
     *
     * @param fileName Bare .frag filename, resolved against the project root.
     * @param type "normal" (original 2D texture-shader path) or "scene3d".
     * @param geom scene3d geometry kind (points/cubes/ribbon/grid/quads/patches/scatter/...); unused for type="normal".
     * @param stateBytes scene3d persistent-state buffer size in bytes, for compute-driven generators; unused for type="normal".
     * @param shadowExtent scene3d shadow-map world-space half-extent; unused for type="normal".
     */
    void setTextureShader(const QString &fileName, const QString &type = "normal",
                           const QString &geom = QString(), int stateBytes = 0,
                           double shadowExtent = 0.0);
    /**
     * @brief Select the combine (pass-2) shader to preview.
     * @param fileName Bare .frag filename, resolved against the project root.
     */
    void setCombineShader(const QString &fileName);
    /**
     * @brief Reload the two sample images used as tex0/tex1 from a directory.
     * @param dir Directory to scan for images; empty selects the procedural gradient fallback.
     */
    void setImageDirectory(const QString &dir);

    /**
     * @brief Synthesized music profile driving the preview's audio uniforms.
     *
     * Beat  = 120 BPM kicks/onsets, audioAmbient = 0.
     * Drone = no transients, slow swells, audioAmbient = 1.
     * Lets an author check how a shader responds to each kind of music.
     */
    enum MusicMode { Beat = 0, Drone = 1 };
    /**
     * @brief Switch the synthetic audio profile and repaint.
     * @param m New profile (Beat or Drone).
     */
    void setMusicMode(MusicMode m) { m_mode = m; update(); }
    MusicMode musicMode() const { return m_mode; }   ///< @return The currently selected synthetic audio profile.

    /**
     * @brief Install a REAL audio preview: a feature timeline precomputed by the actual AudioAnalyzer from a WAV.
     *
     * One snapshot per 10 ms. While set, it replaces the synthetic music
     * profile; playback loops. An empty vector switches back to the
     * synthetic profile.
     * @param tl Feature snapshots in playback order.
     */
    void setAudioTimeline(std::vector<AudioFeatures> tl);
    bool hasAudioTimeline() const { return !m_timeline.empty(); }   ///< @return True while a WAV timeline installed via setAudioTimeline() is active.

    /// Live per-activation parameter override (editor slider): uniform #name pinned to #value (uploaded as an int when #isInt).
    struct ParamOverride { QString name; float value; bool isInt; };
    /**
     * @brief Install live per-activation parameter overrides (editor sliders).
     *
     * Applied after the built-in defaults each frame, so the sliders tune the actual look.
     * @param ov Overrides to apply; replaces any previously installed set.
     */
    void setParamOverrides(QVector<ParamOverride> ov) { m_overrides = std::move(ov); update(); }

    /**
     * @brief Install the formula-layer entries of the SELECTED preset entry.
     *
     * Uniform name -> formula pairs, incl. audio-mapping overrides
     * (`<expr name="audioKick">`). The 2D path applies them after the
     * synthetic audio uniforms; the scene3d path forwards them into the real
     * Scene3DShader, so the preview follows the same override-by-name order
     * as the shipped engine.
     * @param exprs (uniform name, formula source text) pairs.
     */
    void setSceneExprs(QVector<QPair<QString, QString>> exprs);

    /**
     * @brief Evaluate a compiled formula-layer program against the synthesized Beat/Drone audio profile at the CURRENT preview time.
     *
     * Uses the same variable mapping EffectShader.cpp uses at runtime, so
     * the editor's live formula readout matches what the shipped app would
     * compute. Deliberately always uses the SYNTHETIC profile, even when a
     * WAV timeline is loaded: synthFeatures() is pure/side-effect-free,
     * while timelineFeatures() advances playback envelope state and is only
     * safe to call once per frame — not safe for evaluating several formula
     * rows on every editor timer tick. seed1-3 aren't part of AudioFeatures
     * (EffectShader rolls them once per scene ACTIVATION); fixed constants
     * are used here, since the editor preview has no activation concept to
     * roll them from.
     * @param prog Compiled formula program to evaluate.
     * @return The formula's result at the current preview time.
     */
    float evalExpr(const ExprProgram &prog) const;

    // ---- Transition TEST BENCH ----
    /**
     * @brief Configure the transition test bench.
     *
     * style >= 0: the combine gets transStyle=style and the interpolation is
     * SWEPT slowly (triangle, ~10 s round trip) instead of the fixed 1.0 —
     * slow-motion inspection of one transition.  fixedD in [0,1] pins the
     * progress instead (headless --transcheck). style < 0 = normal preview.
     * @param style Transition style index to exercise, or < 0 to disable the test bench.
     * @param fixedD Pinned progress in [0,1], or < 0 to sweep automatically.
     */
    void setTransTest(int style, float fixedD = -1.f)
    { m_transStyle = style; m_transFixedD = fixedD; update(); }
    /**
     * @brief Pin the preview clock (deterministic frames for --transcheck / --render --time).
     * @param t Fixed time in seconds, or < 0 to use the live wall clock.
     */
    void setFixedTime(float t) { m_fixedTime = t; update(); }

signals:
    /**
     * @brief Emitted whenever the current selection's compile status or log changes.
     * @param text Human-readable status text (compile/link error log, or "<file>  OK").
     */
    void statusChanged(const QString &text);   // compile logs / current selection

protected:
    /// One-time GL setup: functions, clear colour, fullscreen quad VAO/VBO, initial sample images, and Scene3DPreview's glcore function pointers.
    void initializeGL() override;
    /// Renders one frame: (re)compiles any dirty shader, runs the texture pass (2D or scene3d), the 2D camera rig, then the combine pass into the widget's own framebuffer.
    void paintGL() override;
    /**
     * @brief Qt resize notification.
     * @param w New widget width (unused: the render FBO is instead resized lazily in paintGL()).
     * @param h New widget height (unused, see @p w).
     */
    void resizeGL(int w, int h) override;

private:
    /**
     * @brief Compile and link a fullscreen-quad fragment shader against the fixed vertex shader.
     *
     * Shaders live in subfolders since the 2026-07 reorg (Scene / Combine /
     * Blend); bare filenames are resolved by searching them (root last, for
     * throwaway probe shaders).
     * @param fileName Bare .frag filename; searched under Scene2D/, FX/, Engine/, then the project root.
     * @param log Receives the compiler/linker error log on failure (left untouched on success).
     * @return The newly linked program, or nullptr on failure (in which case @p log is set).
     */
    QOpenGLShaderProgram *compile(const QString &fileName, QString &log);
    /**
     * @brief Test-bench interpolation value for the current mode.
     * @return 1.0 in normal preview (texture pass fully visible); otherwise the swept or pinned transition progress.
     */
    float  testInterpolation() const;   // test-bench interpolation (1.0 = normal)
    /**
     * @brief Set every uniform any of the effect shaders might declare.
     *
     * Unused ones resolve to location -1 and are silently ignored, so one
     * call works for all shaders. Editor slider values override the
     * per-activation params (after defaults), and the scene's formula layer
     * is applied last.
     * @param p Program to upload uniforms into; must already be bound.
     */
    void   applyCommonUniforms(QOpenGLShaderProgram *p);
    /**
     * @brief Apply the editor's per-activation slider overrides (see setParamOverrides()) on top of the built-in defaults.
     * @param p Program to upload uniforms into; must already be bound.
     */
    void   applyParamOverrides(QOpenGLShaderProgram *p);
    /**
     * @brief Apply the selected entry's formula layer on top of the synthetic audio uniforms.
     *
     * Mirrors the engine's override-by-name order in
     * EffectShader::applyAudioFeatures, so an `<expr name="audioKick">` shows
     * the same takeover here that it performs in the shipped host.
     * @param p Program to upload uniforms into; must already be bound.
     */
    void   applySceneExprs(QOpenGLShaderProgram *p);
    /**
     * @brief Draw the baked fullscreen NDC quad as a triangle strip.
     * @param p Bound program whose uniforms are assumed already set (unused otherwise — the quad's VAO carries its own attribs).
     */
    void   drawFullscreenQuad(QOpenGLShaderProgram *p);
    void   loadImages();                     // (re)create m_img0/m_img1 (GL thread)
    /**
     * @brief Load an image file into a GL texture, or synthesize a colourful gradient if it can't be loaded.
     * @param path Image file path; empty or unloadable falls back to the procedural gradient.
     * @return The newly created texture's GL object name.
     */
    GLuint makeTexture(const QString &path);  // from file, or gradient fallback
    // A synthetic AudioFeatures snapshot at time t, matching the same Beat/
    // Drone math applyCommonUniforms already uses for the 2D path -- kept as
    // an independent small copy rather than a shared refactor of the proven
    // 2D uniform code (see Scene3DPreview.h's design note).  Only the fields
    // that matter for a typical 3D scene are filled; the rest keep the
    // struct's own neutral defaults (valence/arousal/musicPresence, ...).
    /**
     * @brief Build a synthetic AudioFeatures snapshot at time @p t for the scene3d path.
     * @param t Preview time in seconds.
     * @return A pure, side-effect-free feature snapshot suitable for a single frame at time @p t.
     */
    AudioFeatures synthFeatures(float t) const;
    // WAV-timeline counterpart; advances the m_tl* envelope members (not const).
    /**
     * @brief WAV-timeline counterpart of synthFeatures(): advances the m_tl* envelope/phase members.
     * @return The current smoothed, host-integrated feature snapshot (falls back to synthFeatures() when no timeline is loaded).
     */
    AudioFeatures timelineFeatures();

    QString m_root;      ///< Project root every shader/config path is resolved against.
    QString m_vertSrc;   ///< Fixed fullscreen-quad vertex shader source (kVert).

    QString m_texFile = "Kaleidoscope.frag";   ///< Selected texture (pass-1) shader filename.
    QString m_combFile = "FxPlain.frag";       ///< Selected combine (pass-2) shader filename.
    bool    m_texDirty = true, m_combDirty = true;   ///< Set by setTextureShader()/setCombineShader(); consumed (and cleared) by paintGL()'s lazy recompile.

    // scene3d texture-shader path.
    QString m_texType = "normal";      ///< "normal" (2D texture-shader path) or "scene3d".
    QString m_texGeom;                 ///< scene3d geometry kind, forwarded to Scene3DPreview::setShader().
    int     m_texStateBytes = 0;       ///< scene3d persistent-state buffer size in bytes, forwarded to Scene3DPreview::setShader().
    double  m_texShadowExtent = 0.0;   ///< scene3d shadow-map world-space half-extent, forwarded to Scene3DPreview::setShader().
    Scene3DPreview m_scenePreview;     ///< Owns the real Scene3DShader render path when m_texType == "scene3d".

    QString m_imageDir;              ///< Directory to load tex0/tex1 sample images from; empty means the procedural fallback.
    bool    m_imagesDirty = true;    ///< Set by setImageDirectory(); consumed (and cleared) by loadImages() in paintGL().
    MusicMode m_mode = Beat;         ///< Currently selected synthetic audio profile.

    QOpenGLShaderProgram *m_texProg  = nullptr;   ///< Compiled texture (pass-1) shader program (type="normal" path only).
    QOpenGLShaderProgram *m_combProg = nullptr;   ///< Compiled combine (pass-2) shader program.

    // Compute-FX dispatch for the 2D path (see paintGL): which kinds m_texProg
    // declares (recomputed whenever it's recompiled), and the wall-clock dt/
    // now these stateful sims step on -- independent of m_fixedTime, which
    // pins the shader's "time" uniform for reproducible --render grabs but
    // must not freeze the sims' own phase accumulators (see .cpp).
    ComputeFXPreview m_cfx;            ///< Compute-FX dispatch wrapper for the 2D texture-shader path.
    bool      m_cfxReady = false;      ///< Whether m_cfx.init() has run yet (deferred until a shader first declares a compute-FX sampler).
    unsigned int m_cfxMask = 0;        ///< Bitmask of CfxKind values (1u << k) that m_texProg declares samplers for.
    float     m_cfxPrevTime = -1.f;    ///< Last real wall-clock time (seconds) compute-FX sims were stepped at; < 0 means "not yet stepped".
    QOpenGLFramebufferObject *m_fbo  = nullptr;   ///< Pass-1 (texture-shader) render target, resized to match the widget each frame.
    GLuint  m_img0 = 0, m_img1 = 0;   ///< tex0/tex1 sample image textures.
    GLuint  m_vbo  = 0;               ///< Fullscreen-quad vertex buffer (NDC positions).
    QOpenGLVertexArrayObject *m_quadVAO = nullptr;   // core profile: baked quad attribs

    QElapsedTimer m_clock;   ///< Wall clock driving m_time whenever the preview time is not pinned via setFixedTime().
    float   m_time = 0.f;    ///< Current preview time in seconds (live wall-clock value, or the pinned m_fixedTime).
    int     m_fbW = 0, m_fbH = 0;   ///< Current render framebuffer size in device pixels.

    QVector<ParamOverride> m_overrides;   // editor slider values
    struct SceneExpr { QString name; QString formula; std::shared_ptr<ExprProgram> prog; };   ///< One formula-layer entry: uniform name, source text, and its compiled program (null if the formula failed to compile).
    QVector<SceneExpr> m_sceneExprs;      // formula layer of the selected entry

    // 2D CAMERA RIG preview parity: mirrors RenderPipeline::rig2Transform for
    // the 2D path -- rig2* formulas rotate/zoom/pan the pass-1 frame before
    // the combine samples it.  Returns srcTex unchanged when no rig2 formula
    // is active.
    /**
     * @brief 2D CAMERA RIG preview parity: mirrors RenderPipeline::rig2Transform for the 2D path.
     *
     * rig2* formulas of the selected entry rotate/zoom/pan the pass-1 frame
     * before the combine samples it.
     * @param srcTex Pass-1 colour texture to transform.
     * @param w Framebuffer width in pixels.
     * @param h Framebuffer height in pixels.
     * @return @p srcTex unchanged when no rig2 formula is active; otherwise the transformed texture (m_fboRig's colour attachment).
     */
    GLuint rig2Apply(GLuint srcTex, int w, int h);
    QOpenGLFramebufferObject *m_fboRig  = nullptr;   ///< Render target for rig2Apply()'s transform pass.
    QOpenGLShaderProgram     *m_rigProg = nullptr;   ///< Compiled Rig2D.frag program, lazily compiled on first use (see m_rigProgTried).
    bool  m_rigProgTried = false;   ///< Whether compiling m_rigProg has already been attempted (so a failed compile is not retried every frame).
    float m_rig2Acc[4]  = { 0.f, 0.f, 0.f, 0.f };   ///< Integrated rig2*V (rate-channel) accumulators: roll, zoom, x, y.
    float m_rig2LastT   = -1.0e9f;   ///< Preview time m_rig2Acc was last integrated at.

    // Transition test bench state (see setTransTest/setFixedTime).
    int    m_transStyle  = -1;     ///< Transition style under test, or < 0 for normal preview.
    float  m_transFixedD = -1.f;   ///< Pinned transition progress in [0,1], or < 0 to sweep automatically.
    float  m_fixedTime   = -1.f;   ///< Pinned preview clock in seconds, or < 0 to use the live wall clock.

    // WAV feature timeline playback (real-analyzer preview).
    std::vector<AudioFeatures> m_timeline;   ///< Precomputed per-10ms AudioFeatures snapshots from a WAV; empty means the synthetic profile is active.
    QElapsedTimer m_wavClock;   ///< Wall clock driving timeline playback; restarted by setAudioTimeline().
    float   m_tlPrevT   = 0.f;   ///< for dt
    float   m_tlPhase   = 0.f;   ///< host-style integrated rotation phase
    float   m_tlAdvance = 0.f;   ///< host-style integrated travel
    float   m_tlBeatEnv = 0.f, m_tlBeat = 0.f;      ///< peak-hold + slew
    float   m_tlOnsetEnv = 0.f, m_tlOnset = 0.f;    ///< peak-hold + slew, onset strength
    float   m_tlDownEnv = 0.f, m_tlDown = 0.f;      ///< peak-hold + slew, downbeat accent
    float   m_tlKickEnv = 0.f, m_tlKick = 0.f;      ///< peak-hold + slew, kick onset
    float   m_tlSnareEnv = 0.f, m_tlSnare = 0.f;    ///< peak-hold + slew, snare onset
    float   m_tlHatEnv = 0.f, m_tlHat = 0.f;        ///< peak-hold + slew, hat onset
    float   m_tlLvlFast = 0.f, m_tlLvlSlow = 0.f;   ///< swell
    float   m_tlBeatPhase = 0.f;   ///< integrated beat phase (0..1, wraps once per beat)
};

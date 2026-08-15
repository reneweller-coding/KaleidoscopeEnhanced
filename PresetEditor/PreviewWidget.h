// PreviewWidget.h — live preview of one texture shader folded through one combine
// shader, exactly as the main app's two-pass pipeline does, but with a single
// fixed selection and a synthesized (animated) set of audio uniforms so that
// audio-reactive shaders still move.
//
// Two texture-shader paths live here side by side.  type="normal" keeps the
// original self-contained pipeline: QOpenGLShaderProgram + QOpenGLFramebuffer-
// Object + QOpenGLFunctions, no EffectShader.  type="scene3d" hands off to
// Scene3DPreview, which renders a REAL Scene3DShader (procedural geometry,
// shadow map, order-independent transparency) through the engine's own Qt-
// free rendering core.  The two never mix GL bindings in this file — see
// Scene3DPreview.h for why that would be a silent, hard-to-find bug.
#pragma once

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QOpenGLFunctions>
#include <QtCore/QElapsedTimer>
#include <QtCore/QString>
#include <vector>

#include "../Source/AudioFeatures.h"
#include "Scene3DPreview.h"

class QOpenGLShaderProgram;
class QOpenGLFramebufferObject;
class QOpenGLTexture;
class QOpenGLVertexArrayObject;
class ExprProgram;

class PreviewWidget : public QOpenGLWidget, protected QOpenGLFunctions
{
    Q_OBJECT
public:
    explicit PreviewWidget(const QString &projectRoot, QWidget *parent = nullptr);
    ~PreviewWidget() override;

    // Select the texture / combine .frag (bare filename, resolved against root).
    // type/geom/stateBytes/shadowExtent only matter for type="scene3d"; the
    // defaults keep every existing call site (self-tests, --render) on the
    // original type="normal" path unchanged.
    void setTextureShader(const QString &fileName, const QString &type = "normal",
                           const QString &geom = QString(), int stateBytes = 0,
                           double shadowExtent = 0.0);
    void setCombineShader(const QString &fileName);
    // Reload the two sample images from a directory (empty -> procedural fallback).
    void setImageDirectory(const QString &dir);

    // Synthesized music type driving the preview's audio uniforms:
    //   Beat  = 120 BPM kicks/onsets, audioAmbient = 0
    //   Drone = no transients, slow swells, audioAmbient = 1
    // Lets you check how a shader responds to each kind of music.
    enum MusicMode { Beat = 0, Drone = 1 };
    void setMusicMode(MusicMode m) { m_mode = m; update(); }
    MusicMode musicMode() const { return m_mode; }

    // REAL audio preview: a feature timeline precomputed by the actual
    // AudioAnalyzer from a WAV (one snapshot per 10 ms).  While set, it
    // replaces the synthetic music profile; playback loops.  An empty
    // vector switches back to the synthetic profile.
    void setAudioTimeline(std::vector<AudioFeatures> tl);
    bool hasAudioTimeline() const { return !m_timeline.empty(); }

    // Live per-activation parameter overrides (editor sliders): applied after
    // the built-in defaults each frame, so the sliders tune the actual look.
    struct ParamOverride { QString name; float value; bool isInt; };
    void setParamOverrides(QVector<ParamOverride> ov) { m_overrides = std::move(ov); update(); }

    // Evaluate a compiled formula-layer program against the synthesized
    // Beat/Drone audio profile at the CURRENT preview time -- the same
    // variable mapping EffectShader.cpp uses at runtime, so the editor's
    // live formula readout matches what the shipped app would compute.
    // Deliberately always uses the SYNTHETIC profile, even when a WAV
    // timeline is loaded: synthFeatures() is pure/side-effect-free, while
    // timelineFeatures() advances playback envelope state and is only safe
    // to call once per frame -- not safe for evaluating several formula
    // rows on every editor timer tick. seed1-3 aren't part of AudioFeatures
    // (EffectShader rolls them once per scene ACTIVATION); fixed constants
    // here, since the editor preview has no activation concept to roll
    // them from.
    float evalExpr(const ExprProgram &prog) const;

    // ---- Transition TEST BENCH ----
    // style >= 0: the combine gets transStyle=style and the interpolation is
    // SWEPT slowly (triangle, ~10 s round trip) instead of the fixed 1.0 —
    // slow-motion inspection of one transition.  fixedD in [0,1] pins the
    // progress instead (headless --transcheck).  style < 0 = normal preview.
    void setTransTest(int style, float fixedD = -1.f)
    { m_transStyle = style; m_transFixedD = fixedD; update(); }
    // Pin the preview clock (deterministic frames for --transcheck); < 0 = live.
    void setFixedTime(float t) { m_fixedTime = t; update(); }

signals:
    void statusChanged(const QString &text);   // compile logs / current selection

protected:
    void initializeGL() override;
    void paintGL() override;
    void resizeGL(int w, int h) override;

private:
    QOpenGLShaderProgram *compile(const QString &fileName, QString &log);
    float  testInterpolation() const;   // test-bench interpolation (1.0 = normal)
    void   applyCommonUniforms(QOpenGLShaderProgram *p);
    void   applyParamOverrides(QOpenGLShaderProgram *p);
    void   drawFullscreenQuad(QOpenGLShaderProgram *p);
    void   loadImages();                     // (re)create m_img0/m_img1 (GL thread)
    GLuint makeTexture(const QString &path);  // from file, or gradient fallback
    // A synthetic AudioFeatures snapshot at time t, matching the same Beat/
    // Drone math applyCommonUniforms already uses for the 2D path -- kept as
    // an independent small copy rather than a shared refactor of the proven
    // 2D uniform code (see Scene3DPreview.h's design note).  Only the fields
    // that matter for a typical 3D scene are filled; the rest keep the
    // struct's own neutral defaults (valence/arousal/musicPresence, ...).
    AudioFeatures synthFeatures(float t) const;
    // WAV-timeline counterpart; advances the m_tl* envelope members (not const).
    AudioFeatures timelineFeatures();

    QString m_root;
    QString m_vertSrc;

    QString m_texFile = "Kaleidoscope.frag";
    QString m_combFile = "CombinePlain.frag";
    bool    m_texDirty = true, m_combDirty = true;

    // scene3d texture-shader path.
    QString m_texType = "normal";
    QString m_texGeom;
    int     m_texStateBytes = 0;
    double  m_texShadowExtent = 0.0;
    Scene3DPreview m_scenePreview;

    QString m_imageDir;
    bool    m_imagesDirty = true;
    MusicMode m_mode = Beat;

    QOpenGLShaderProgram *m_texProg  = nullptr;
    QOpenGLShaderProgram *m_combProg = nullptr;
    QOpenGLFramebufferObject *m_fbo  = nullptr;
    GLuint  m_img0 = 0, m_img1 = 0;
    GLuint  m_vbo  = 0;
    QOpenGLVertexArrayObject *m_quadVAO = nullptr;   // core profile: baked quad attribs

    QElapsedTimer m_clock;
    float   m_time = 0.f;
    int     m_fbW = 0, m_fbH = 0;

    QVector<ParamOverride> m_overrides;   // editor slider values

    // Transition test bench state (see setTransTest/setFixedTime).
    int    m_transStyle  = -1;
    float  m_transFixedD = -1.f;
    float  m_fixedTime   = -1.f;

    // WAV feature timeline playback (real-analyzer preview).
    std::vector<AudioFeatures> m_timeline;
    QElapsedTimer m_wavClock;
    float   m_tlPrevT   = 0.f;   // for dt
    float   m_tlPhase   = 0.f;   // host-style integrated rotation phase
    float   m_tlAdvance = 0.f;   // host-style integrated travel
    float   m_tlBeatEnv = 0.f, m_tlBeat = 0.f;      // peak-hold + slew
    float   m_tlOnsetEnv = 0.f, m_tlOnset = 0.f;
    float   m_tlDownEnv = 0.f, m_tlDown = 0.f;
    float   m_tlKickEnv = 0.f, m_tlKick = 0.f;
    float   m_tlSnareEnv = 0.f, m_tlSnare = 0.f;
    float   m_tlHatEnv = 0.f, m_tlHat = 0.f;
    float   m_tlLvlFast = 0.f, m_tlLvlSlow = 0.f;   // swell
    float   m_tlBeatPhase = 0.f;
};

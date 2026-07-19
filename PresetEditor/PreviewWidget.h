// PreviewWidget.h — live preview of one texture shader folded through one combine
// shader, exactly as the main app's two-pass pipeline does, but with a single
// fixed selection and a synthesized (animated) set of audio uniforms so that
// audio-reactive shaders still move.  Self-contained: QOpenGLShaderProgram +
// QOpenGLFramebufferObject + QOpenGLFunctions, no GLee / glu / EffectShader.
#pragma once

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QOpenGLFunctions>
#include <QtCore/QElapsedTimer>
#include <QtCore/QString>
#include <vector>

#include "../AudioFeatures.h"

class QOpenGLShaderProgram;
class QOpenGLFramebufferObject;
class QOpenGLTexture;

class PreviewWidget : public QOpenGLWidget, protected QOpenGLFunctions
{
    Q_OBJECT
public:
    explicit PreviewWidget(const QString &projectRoot, QWidget *parent = nullptr);
    ~PreviewWidget() override;

    // Select the texture / combine .frag (bare filename, resolved against root).
    void setTextureShader(const QString &fileName);
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

signals:
    void statusChanged(const QString &text);   // compile logs / current selection

protected:
    void initializeGL() override;
    void paintGL() override;
    void resizeGL(int w, int h) override;

private:
    QOpenGLShaderProgram *compile(const QString &fileName, QString &log);
    void   applyCommonUniforms(QOpenGLShaderProgram *p);
    void   applyParamOverrides(QOpenGLShaderProgram *p);
    void   drawFullscreenQuad(QOpenGLShaderProgram *p);
    void   loadImages();                     // (re)create m_img0/m_img1 (GL thread)
    GLuint makeTexture(const QString &path);  // from file, or gradient fallback

    QString m_root;
    QString m_vertSrc;

    QString m_texFile = "Kaleidoscope.frag";
    QString m_combFile = "CombinePlain.frag";
    bool    m_texDirty = true, m_combDirty = true;

    QString m_imageDir;
    bool    m_imagesDirty = true;
    MusicMode m_mode = Beat;

    QOpenGLShaderProgram *m_texProg  = nullptr;
    QOpenGLShaderProgram *m_combProg = nullptr;
    QOpenGLFramebufferObject *m_fbo  = nullptr;
    GLuint  m_img0 = 0, m_img1 = 0;
    GLuint  m_vbo  = 0;

    QElapsedTimer m_clock;
    float   m_time = 0.f;
    int     m_fbW = 0, m_fbH = 0;

    QVector<ParamOverride> m_overrides;   // editor slider values

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

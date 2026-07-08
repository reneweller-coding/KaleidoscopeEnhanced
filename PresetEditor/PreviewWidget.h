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

signals:
    void statusChanged(const QString &text);   // compile logs / current selection

protected:
    void initializeGL() override;
    void paintGL() override;
    void resizeGL(int w, int h) override;

private:
    QOpenGLShaderProgram *compile(const QString &fileName, QString &log);
    void   applyCommonUniforms(QOpenGLShaderProgram *p);
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

    QOpenGLShaderProgram *m_texProg  = nullptr;
    QOpenGLShaderProgram *m_combProg = nullptr;
    QOpenGLFramebufferObject *m_fbo  = nullptr;
    GLuint  m_img0 = 0, m_img1 = 0;
    GLuint  m_vbo  = 0;

    QElapsedTimer m_clock;
    float   m_time = 0.f;
    int     m_fbW = 0, m_fbH = 0;
};

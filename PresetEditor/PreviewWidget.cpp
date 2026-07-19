#include "PreviewWidget.h"

#include <QtOpenGL/QOpenGLShaderProgram>
#include <QtOpenGL/QOpenGLFramebufferObject>
#include <QtGui/QImage>
#include <QtGui/QVector2D>
#include <QtGui/QVector3D>
#include <QtCore/QFile>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QTimer>
#include <cmath>

// Trivial fullscreen-quad vertex shader (GLSL 110; the .frag files use
// gl_FragCoord, so no texcoords / matrices are needed).
static const char *kVert =
    "attribute vec2 aPos;\n"
    "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }\n";

PreviewWidget::PreviewWidget(const QString &projectRoot, QWidget *parent)
    : QOpenGLWidget(parent), m_root(projectRoot)
{
    setMinimumSize(320, 240);
    // Redraw at ~60 fps so the synthesized audio animates the shaders.
    QTimer *t = new QTimer(this);
    connect(t, &QTimer::timeout, this, [this]{ update(); });
    t->start(16);
}

PreviewWidget::~PreviewWidget()
{
    makeCurrent();
    delete m_texProg;
    delete m_combProg;
    delete m_fbo;
    if (m_img0) glDeleteTextures(1, &m_img0);
    if (m_img1) glDeleteTextures(1, &m_img1);
    if (m_vbo)  glDeleteBuffers(1, &m_vbo);
    doneCurrent();
}

void PreviewWidget::setTextureShader(const QString &fileName)
{
    m_texFile = fileName; m_texDirty = true; update();
}
void PreviewWidget::setCombineShader(const QString &fileName)
{
    m_combFile = fileName; m_combDirty = true; update();
}
void PreviewWidget::setImageDirectory(const QString &dir)
{
    m_imageDir = dir; m_imagesDirty = true; update();
}

void PreviewWidget::initializeGL()
{
    initializeOpenGLFunctions();
    glClearColor(0.f, 0.f, 0.f, 1.f);

    m_vertSrc = kVert;

    // Fullscreen triangle-strip quad in NDC.
    const float quad[8] = { -1.f,-1.f,  1.f,-1.f,  -1.f,1.f,  1.f,1.f };
    glGenBuffers(1, &m_vbo);
    glBindBuffer(GL_ARRAY_BUFFER, m_vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quad), quad, GL_STATIC_DRAW);
    glBindBuffer(GL_ARRAY_BUFFER, 0);

    m_clock.start();
    loadImages();
}

void PreviewWidget::resizeGL(int, int) { /* FBO re-sized lazily in paintGL */ }

QOpenGLShaderProgram *PreviewWidget::compile(const QString &fileName, QString &log)
{
    QFile f(m_root + "/" + fileName);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
    {
        log = "cannot open " + fileName;
        return nullptr;
    }
    const QString frag = QString::fromUtf8(f.readAll());

    QOpenGLShaderProgram *p = new QOpenGLShaderProgram();
    p->bindAttributeLocation("aPos", 0);
    if (!p->addShaderFromSourceCode(QOpenGLShader::Vertex, m_vertSrc)
        || !p->addShaderFromSourceCode(QOpenGLShader::Fragment, frag)
        || !p->link())
    {
        log = p->log();
        delete p;
        return nullptr;
    }
    log.clear();
    return p;
}

GLuint PreviewWidget::makeTexture(const QString &path)
{
    QImage img;
    if (!path.isEmpty()) img.load(path);
    if (img.isNull())
    {
        // Procedural fallback: a colourful gradient so shaders show something.
        const int N = 256;
        img = QImage(N, N, QImage::Format_RGBA8888);
        for (int y = 0; y < N; ++y)
            for (int x = 0; x < N; ++x)
            {
                float u = x / float(N), v = y / float(N);
                int r = int(127.5f * (1.f + std::sin(u * 12.f)));
                int g = int(127.5f * (1.f + std::sin((u + v) * 9.f)));
                int b = int(127.5f * (1.f + std::cos(v * 15.f)));
                img.setPixel(x, y, qRgb(r, g, b));
            }
    }
    img = img.convertToFormat(QImage::Format_RGBA8888).mirrored(false, true);

    GLuint id = 0;
    glGenTextures(1, &id);
    glBindTexture(GL_TEXTURE_2D, id);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, img.width(), img.height(), 0,
                 GL_RGBA, GL_UNSIGNED_BYTE, img.constBits());
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glBindTexture(GL_TEXTURE_2D, 0);
    return id;
}

void PreviewWidget::loadImages()
{
    if (m_img0) { glDeleteTextures(1, &m_img0); m_img0 = 0; }
    if (m_img1) { glDeleteTextures(1, &m_img1); m_img1 = 0; }

    QStringList files;
    if (!m_imageDir.isEmpty())
    {
        QDir d(m_imageDir);
        const QStringList filt = { "*.jpg", "*.jpeg", "*.png", "*.bmp" };
        files = d.entryList(filt, QDir::Files, QDir::Name);
        for (QString &s : files) s = d.filePath(s);
    }
    m_img0 = makeTexture(files.value(0));
    m_img1 = makeTexture(files.value(files.size() > 1 ? 1 : 0));
    m_imagesDirty = false;
}

// Set every uniform any of the effect shaders might declare.  Unused ones resolve
// to location -1 and are silently ignored, so one call works for all shaders.
void PreviewWidget::setAudioTimeline(std::vector<AudioFeatures> tl)
{
    m_timeline = std::move(tl);
    m_wavClock.restart();
    m_tlPrevT = 0.f;
    m_tlPhase = m_tlAdvance = 0.f;
    m_tlBeatEnv = m_tlBeat = m_tlOnsetEnv = m_tlOnset = 0.f;
    m_tlDownEnv = m_tlDown = 0.f;
    m_tlKickEnv = m_tlKick = m_tlSnareEnv = m_tlSnare = m_tlHatEnv = m_tlHat = 0.f;
    m_tlLvlFast = m_tlLvlSlow = 0.f;
    m_tlBeatPhase = 0.f;
    update();
}

void PreviewWidget::applyCommonUniforms(QOpenGLShaderProgram *p)
{
    // ---- REAL audio preview: play back the analyzer's feature timeline ----
    // Applies a compact version of the host's mapping (FilterShader::paint):
    // peak-hold + slew envelopes, integrated motion phases, fast-vs-slow swell,
    // continuous beat phase.  Loops with the (looped) sound.
    if (!m_timeline.empty())
    {
        const float tp = float(m_wavClock.elapsed()) * 0.001f;
        float dt = tp - m_tlPrevT;
        if (dt < 0.f || dt > 0.25f) dt = 0.016f;
        m_tlPrevT = tp;
        const size_t n   = m_timeline.size();
        const size_t idx = size_t(tp * 100.f) % n;
        const AudioFeatures &f = m_timeline[idx];

        auto slew = [dt](float cur, float target, float rate) {
            float d = target - cur;
            float mx = rate * dt;
            if (d >  mx) d =  mx;
            if (d < -mx) d = -mx;
            return cur + d;
        };
        m_tlBeatEnv  = std::max(m_tlBeatEnv  * std::exp(-dt / 0.30f), f.beatDecay);
        m_tlOnsetEnv = std::max(m_tlOnsetEnv * std::exp(-dt / 0.22f), f.onsetStrength);
        m_tlDownEnv  = std::max(m_tlDownEnv  * std::exp(-dt / 0.45f), f.downbeat);
        m_tlKickEnv  = std::max(m_tlKickEnv  * std::exp(-dt / 0.24f), f.onsetKick);
        m_tlSnareEnv = std::max(m_tlSnareEnv * std::exp(-dt / 0.20f), f.onsetSnare);
        m_tlHatEnv   = std::max(m_tlHatEnv   * std::exp(-dt / 0.14f), f.onsetHat);
        m_tlBeat  = slew(m_tlBeat,  m_tlBeatEnv,  6.f);
        m_tlOnset = slew(m_tlOnset, m_tlOnsetEnv, 7.f);
        m_tlDown  = slew(m_tlDown,  m_tlDownEnv,  5.f);
        m_tlKick  = slew(m_tlKick,  m_tlKickEnv,  7.f);
        m_tlSnare = slew(m_tlSnare, m_tlSnareEnv, 7.f);
        m_tlHat   = slew(m_tlHat,   m_tlHatEnv,   8.f);

        // Integrated motion phases (jump-free) + swell (fast-slow loudness).
        m_tlPhase   += (0.10f + 0.50f * m_tlBeat + 0.30f * f.overallLevel) * dt;
        m_tlAdvance += (0.15f + 1.00f * f.overallLevel) * dt;
        m_tlLvlFast += (f.overallLevel - m_tlLvlFast) * std::min(dt / 1.5f, 1.f);
        m_tlLvlSlow += (f.overallLevel - m_tlLvlSlow) * std::min(dt / 8.0f, 1.f);
        float swell  = std::min(std::max((m_tlLvlFast - m_tlLvlSlow) * 4.f, 0.f), 1.f);
        float bpm    = 40.f + 160.f * f.estimatedBPM;
        m_tlBeatPhase += (f.estimatedBPM > 0.004f ? bpm / 60.f : 0.f) * dt;
        m_tlBeatPhase -= std::floor(m_tlBeatPhase);

        p->setUniformValue("resolution", QVector2D(float(m_fbW), float(m_fbH)));
        p->setUniformValue("time", m_time);
        p->setUniformValue("interpolation", 1.0f);
        p->setUniformValue("tex0", 0);
        p->setUniformValue("tex1", 1);
        p->setUniformValue("texSim", 7);

        p->setUniformValue("audioBeat",      m_tlBeat);
        p->setUniformValue("audioOnset",     m_tlOnset);
        p->setUniformValue("audioDownbeat",  m_tlDown);
        p->setUniformValue("audioKick",      m_tlKick);
        p->setUniformValue("audioSnare",     m_tlSnare);
        p->setUniformValue("audioHat",       m_tlHat);
        p->setUniformValue("audioAmbient",   f.ambientFactor);
        p->setUniformValue("audioSwell",     swell);
        p->setUniformValue("audioLevel",     f.overallLevel);
        p->setUniformValue("audioFlux",      f.spectralFlux);
        p->setUniformValue("audioBass",      f.bassLevel);
        p->setUniformValue("audioSubBass",   f.subBassLevel);
        p->setUniformValue("audioLowMid",    f.lowMidLevel);
        p->setUniformValue("audioMid",       f.midLevel);
        p->setUniformValue("audioUpperMid",  f.upperMidLevel);
        p->setUniformValue("audioHigh",      f.highLevel);
        p->setUniformValue("audioCentroid",  f.spectralCentroid);
        p->setUniformValue("audioValence",   f.valence);
        p->setUniformValue("audioArousal",   f.arousal);
        p->setUniformValue("audioPitch",     f.dominantPitch);
        p->setUniformValue("audioPhase",     m_tlPhase);
        p->setUniformValue("audioAdvance",   m_tlAdvance);
        p->setUniformValue("audioBeatPhase", m_tlBeatPhase);
        p->setUniformValue("audioBarPhase",  tp * 0.25f - std::floor(tp * 0.25f));
        p->setUniformValue("audioChromaHue", f.chromaHue);
        p->setUniformValue("audioMode",      f.musicalMode);
        p->setUniformValue("audioStereo",    f.stereoWidth);
        p->setUniformValue("audioDeltaPitch",f.deltaPitch);
        p->setUniformValue("audioHarmChange",f.harmonicChange);
        p->setUniformValue("audioRoughness", f.roughness);
        p->setUniformValue("audioSharpness", f.sharpness);
        p->setUniformValue("audioRolloff",   f.spectralRolloff);
        p->setUniformValue("audioSpread",    f.spectralSpread);
        p->setUniformValue("audioMusic",     f.musicPresence);
        p->setUniformValue("audioChase",     tp * 0.25f - std::floor(tp * 0.25f));
        p->setUniformValue("audioStereoL", QVector3D(f.stereoLowL, f.stereoMidL, f.stereoHighL));
        p->setUniformValue("audioStereoR", QVector3D(f.stereoLowR, f.stereoMidR, f.stereoHighR));

        int specLoc = p->uniformLocation("audioSpectrum");
        if (specLoc >= 0)
            glUniform1fv(specLoc, 32, f.spectrum);

        // Per-shader config params (same defaults as the synthetic path).
        p->setUniformValue("sides", 6);
        p->setUniformValue("rot", 1);
        p->setUniformValue("rotate", 1);
        p->setUniformValue("red", 1);
        p->setUniformValue("speed", 0.05f);
        p->setUniformValue("speedTunnel", 0.03f);
        p->setUniformValue("power", 2.0f);
        p->setUniformValue("size", 10.0f);
        p->setUniformValue("copies", 6.0f);
        return;
    }

    const float t = m_time;
    auto sw = [](float x){ return 0.5f + 0.5f * std::sin(x); };   // 0..1 sine
    const bool drone = (m_mode == Drone);
    // Beat profile: 120 BPM kicks + onsets, audioAmbient = 0.
    // Drone profile: no transients at all, slow majestic swells, audioAmbient = 1.
    const float beatPhase = t * 2.0f - std::floor(t * 2.0f);      // 120 BPM
    const float beat  = drone ? 0.f : std::exp(-beatPhase * 6.0f);
    const float onset = drone ? 0.f : std::exp(-((t*3.f)-std::floor(t*3.f)) * 7.0f);
    const float barPh = t * 0.5f - std::floor(t * 0.5f);
    const float downbeat = (!drone && (int(std::floor(t * 0.5f)) & 3) == 0) ? beat : 0.f;
    const float ambient = drone ? 1.f : 0.f;
    const float swell   = drone ? (0.35f + 0.35f * std::sin(t * 0.35f)) : (0.15f + 0.15f * sw(t * 0.5f));

    p->setUniformValue("resolution", QVector2D(float(m_fbW), float(m_fbH)));
    p->setUniformValue("time", t);
    p->setUniformValue("interpolation", 1.0f);
    p->setUniformValue("tex0", 0);
    p->setUniformValue("tex1", 1);
    p->setUniformValue("texSim", 7);

    p->setUniformValue("audioBeat", beat);
    p->setUniformValue("audioOnset", onset);
    p->setUniformValue("audioDownbeat", downbeat);
    p->setUniformValue("audioAmbient", ambient);
    p->setUniformValue("audioSwell", swell);
    p->setUniformValue("audioLevel", drone ? (0.30f + 0.20f * sw(t * 0.25f))
                                           : (0.35f + 0.25f * sw(t * 0.7f)));
    p->setUniformValue("audioFlux", drone ? (0.05f + 0.06f * sw(t * 0.4f))
                                          : (0.15f + 0.15f * sw(t * 1.3f)));
    p->setUniformValue("audioBass", drone ? (0.5f + 0.2f * sw(t * 0.3f)) : (0.4f + 0.4f * beat));
    p->setUniformValue("audioSubBass", drone ? (0.5f + 0.2f * sw(t * 0.22f)) : (0.3f + 0.4f * beat));
    p->setUniformValue("audioLowMid", 0.3f + 0.2f * sw(t * 0.9f));
    p->setUniformValue("audioMid", 0.35f + 0.25f * sw(t * 1.1f));
    p->setUniformValue("audioUpperMid", 0.3f + 0.25f * sw(t * 1.7f));
    p->setUniformValue("audioHigh", 0.25f + 0.25f * sw(t * 2.3f));
    p->setUniformValue("audioCentroid", 0.5f + 0.3f * sw(t * 0.11f));
    p->setUniformValue("audioValence", 0.5f + 0.3f * sw(t * 0.07f));
    p->setUniformValue("audioArousal", 0.55f + 0.25f * sw(t * 0.13f));
    p->setUniformValue("audioPitch", 0.5f + 0.4f * sw(t * 0.5f));
    p->setUniformValue("audioPhase", t * 0.3f);
    p->setUniformValue("audioAdvance", t * 0.5f);
    p->setUniformValue("audioBeatPhase", beatPhase);
    p->setUniformValue("audioBarPhase", barPh);
    p->setUniformValue("audioChromaHue", t * 0.02f - std::floor(t * 0.02f));
    p->setUniformValue("audioMode", 0.5f + 0.5f * sw(t * 0.05f));
    p->setUniformValue("audioStereo", 0.3f + 0.3f * sw(t * 0.2f));
    p->setUniformValue("audioDeltaPitch", 0.2f * sw(t * 1.9f));
    p->setUniformValue("audioHarmChange", 0.1f + 0.2f * onset);
    p->setUniformValue("audioRoughness", 0.3f + 0.2f * sw(t * 0.3f));
    p->setUniformValue("audioSharpness", 0.4f + 0.3f * sw(t * 0.6f));
    p->setUniformValue("audioRolloff", 0.5f + 0.3f * sw(t * 0.25f));
    p->setUniformValue("audioSpread", 0.4f + 0.2f * sw(t * 0.4f));
    p->setUniformValue("audioMusic", 1.0f);
    p->setUniformValue("audioChase", t * 0.25f - std::floor(t * 0.25f));
    p->setUniformValue("audioStereoL", QVector3D(0.4f * sw(t*0.9f), 0.3f, 0.25f));
    p->setUniformValue("audioStereoR", QVector3D(0.25f, 0.3f, 0.4f * sw(t*1.2f)));

    // 32-band spectrum array (audioSpectrum[32]) for the analyzer shaders.
    int specLoc = p->uniformLocation("audioSpectrum");
    if (specLoc >= 0)
    {
        float spec[32];
        for (int i = 0; i < 32; ++i)
            spec[i] = 0.15f + 0.7f * sw(t * 2.0f + float(i) * 0.6f)
                            * std::exp(-float(i) / 40.f);
        glUniform1fv(specLoc, 32, spec);
    }

    // Per-shader config params (defaults so Kaleidoscope/Tunnel/Combine* look ok).
    p->setUniformValue("sides", 6);          // int
    p->setUniformValue("rot", 1);            // int
    p->setUniformValue("rotate", 1);         // int
    p->setUniformValue("red", 1);            // int
    p->setUniformValue("speed", 0.05f);
    p->setUniformValue("speedTunnel", 0.03f);
    p->setUniformValue("power", 2.0f);
    p->setUniformValue("size", 10.0f);
    p->setUniformValue("copies", 6.0f);
}

void PreviewWidget::drawFullscreenQuad(QOpenGLShaderProgram *p)
{
    glBindBuffer(GL_ARRAY_BUFFER, m_vbo);
    p->enableAttributeArray(0);
    p->setAttributeBuffer(0, GL_FLOAT, 0, 2);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    p->disableAttributeArray(0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}

void PreviewWidget::paintGL()
{
    m_time = m_clock.elapsed() * 0.001f;

    const qreal dpr = devicePixelRatioF();
    const int w = qMax(1, int(width()  * dpr));
    const int h = qMax(1, int(height() * dpr));
    if (!m_fbo || m_fbW != w || m_fbH != h)
    {
        delete m_fbo;
        m_fbo = new QOpenGLFramebufferObject(w, h);
        m_fbW = w; m_fbH = h;
    }

    if (m_imagesDirty) loadImages();
    QString log;
    if (m_texDirty)  { delete m_texProg;  m_texProg  = compile(m_texFile, log);
                       emit statusChanged(m_texFile + (log.isEmpty() ? "  OK" : "\n" + log));
                       m_texDirty = false; }
    if (m_combDirty) { delete m_combProg; m_combProg = compile(m_combFile, log);
                       m_combDirty = false; }

    // Bind sample images once (units 0, 1 and 7 for texSim stand-in).
    glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, m_img0);
    glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, m_img1);
    glActiveTexture(GL_TEXTURE7); glBindTexture(GL_TEXTURE_2D, m_img0);
    glActiveTexture(GL_TEXTURE0);

    // ---- Pass 1: texture shader -> FBO ----
    if (m_texProg)
    {
        m_fbo->bind();
        glViewport(0, 0, w, h);
        glClear(GL_COLOR_BUFFER_BIT);
        m_texProg->bind();
        applyCommonUniforms(m_texProg);
        drawFullscreenQuad(m_texProg);
        m_texProg->release();
        m_fbo->release();
    }

    // ---- Pass 2: combine shader (samples pass-1 as tex0) -> widget FBO ----
    glBindFramebuffer(GL_FRAMEBUFFER, defaultFramebufferObject());
    glViewport(0, 0, w, h);
    glClear(GL_COLOR_BUFFER_BIT);

    if (m_combProg && m_texProg)
    {
        glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, m_fbo->texture());
        glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, m_img1);
        glActiveTexture(GL_TEXTURE0);
        m_combProg->bind();
        applyCommonUniforms(m_combProg);
        drawFullscreenQuad(m_combProg);
        m_combProg->release();
    }
    else if (m_texProg)
    {
        // Combine failed to compile: show the texture pass straight.
        glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, m_img0);
        m_texProg->bind();
        applyCommonUniforms(m_texProg);
        drawFullscreenQuad(m_texProg);
        m_texProg->release();
    }
}

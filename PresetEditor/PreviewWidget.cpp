#include "PreviewWidget.h"

#include <QtOpenGL/QOpenGLShaderProgram>
#include <QtOpenGL/QOpenGLFramebufferObject>
#include <QtOpenGL/QOpenGLVertexArrayObject>
#include <QtGui/QImage>
#include <QtGui/QVector2D>
#include <QtGui/QVector3D>
#include <QtCore/QFile>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QTimer>
#include <QtCore/QRegularExpression>
#include <cmath>

// For EffectShader::kSceneNear/kSceneFar/kSceneTanHalfFovY only -- these are
// plain static constexpr floats, no GL calls, so unlike glcore.h (see
// Scene3DPreview.h) this include carries no macro-collision risk here.
#include "../Source/EffectShader.h"
#include "../Source/ExprEval.h"

// Trivial fullscreen-quad vertex shader (330 core, matching the migrated
// .frag files; they use gl_FragCoord, so no texcoords / matrices are needed).
static const char *kVert =
    "#version 330 core\n"
    "in vec2 aPos;\n"
    "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }\n";

// Look up the <int>/<float> ranges Komplett.xml registers for one fragment
// file (it registers every shader with sensible min/max values).  An
// independent copy of EditorWindow.cpp's komplettParamsFor(), which only
// feeds the slider panel -- this one feeds Scene3DShader::addUniform()
// directly so a scene3d shader gets a real per-activation roll instead of
// GLSL's zero default, in BOTH the GUI and the headless --render/self-test
// paths that never touch EditorWindow at all.
struct KomplettRange { QString kind, name; float minV, maxV; };
static QVector<KomplettRange> komplettRangesFor(const QString &root, const QString &frag)
{
    QVector<KomplettRange> out;
    QFile f(root + "/Configurations/Komplett.xml");
    if (!f.open(QIODevice::ReadOnly)) return out;
    const QString xml = QString::fromUtf8(f.readAll());
    QRegularExpression entryRe(
        QString("<(?:Texture|Combine)Shader\\b[^>]*file=\"\\.\\.\\\\\\\\(?:\\w+\\\\\\\\)?%1\"[^>]*>(.*?)</(?:Texture|Combine)Shader>")
            .arg(QRegularExpression::escape(frag)),
        QRegularExpression::DotMatchesEverythingOption);
    const QRegularExpressionMatch em = entryRe.match(xml);
    if (!em.hasMatch()) return out;
    QRegularExpression paramRe(
        "<(int|float)\\s+name=\"(\\w+)\"\\s+minValue=\"([\\d\\.\\-]+)\"\\s+maxValue=\"([\\d\\.\\-]+)\"");
    QRegularExpressionMatchIterator it = paramRe.globalMatch(em.captured(1));
    while (it.hasNext())
    {
        const QRegularExpressionMatch m = it.next();
        out.push_back({ m.captured(1), m.captured(2),
                        m.captured(3).toFloat(), m.captured(4).toFloat() });
    }
    return out;
}

PreviewWidget::PreviewWidget(const QString &projectRoot, QWidget *parent)
    : QOpenGLWidget(parent), m_root(projectRoot)
{
    setMinimumSize(320, 240);
    // Redraw at ~60 fps so the synthesized audio animates the shaders.
    QTimer *t = new QTimer(this);
    connect(t, &QTimer::timeout, this, [this]{ update(); });
    t->start(16);
}

// Transition test bench: interpolation for the current mode.  1.0 = normal
// preview (texture pass fully visible); while testing, the progress d is
// either pinned (headless --transcheck) or swept as a slow triangle so a
// single transition can be inspected in slow motion.
float PreviewWidget::testInterpolation() const
{
    if (m_transStyle < 0) return 1.0f;
    float d = m_transFixedD;
    if (d < 0.f)
    {
        float ph = std::fmod(m_time * 0.2f, 2.f);      // ~10 s round trip
        d = (ph < 1.f) ? ph : 2.f - ph;
    }
    return 1.f - d;
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
    delete m_quadVAO;
    doneCurrent();
}

void PreviewWidget::setTextureShader(const QString &fileName, const QString &type,
                                      const QString &geom, int stateBytes,
                                      double shadowExtent)
{
    m_texFile = fileName; m_texType = type; m_texGeom = geom;
    m_texStateBytes = stateBytes; m_texShadowExtent = shadowExtent;
    m_texDirty = true; update();
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

    // Fullscreen triangle-strip quad in NDC.  Attrib 0 is baked into a VAO
    // once — every program binds aPos to location 0 (core profile needs the
    // VAO; the default vertex array does not exist there).
    const float quad[8] = { -1.f,-1.f,  1.f,-1.f,  -1.f,1.f,  1.f,1.f };
    glGenBuffers(1, &m_vbo);
    glBindBuffer(GL_ARRAY_BUFFER, m_vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quad), quad, GL_STATIC_DRAW);

    m_quadVAO = new QOpenGLVertexArrayObject();
    m_quadVAO->create();
    m_quadVAO->bind();
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2 * sizeof(float), nullptr);
    m_quadVAO->release();
    glBindBuffer(GL_ARRAY_BUFFER, 0);

    m_clock.start();
    loadImages();

    // Load glcore's GL 4.3 entry points now, once, with this context current --
    // Scene3DPreview needs them the first time a scene3d shader is picked.
    m_scenePreview.ensureGL();
}

void PreviewWidget::resizeGL(int, int) { /* FBO re-sized lazily in paintGL */ }

QOpenGLShaderProgram *PreviewWidget::compile(const QString &fileName, QString &log)
{
    // Shaders live in subfolders since the 2026-07 reorg (Scene / Combine /
    // Blend); bare filenames are resolved by searching them (root last, for
    // throwaway probe shaders).
    QString path;
    for (const QString &dir : { QString("Scene/"), QString("Combine/"),
                                QString("Blend/"), QString("") })
    {
        if (QFile::exists(m_root + "/" + dir + fileName))
        {
            path = m_root + "/" + dir + fileName;
            break;
        }
    }
    QFile f(path.isEmpty() ? (m_root + "/" + fileName) : path);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
    {
        log = "cannot open " + fileName;
        return nullptr;
    }
    const QString frag = QString::fromUtf8(f.readAll());

    QOpenGLShaderProgram *p = new QOpenGLShaderProgram();
    p->bindAttributeLocation("aPos", 0);
    if (p->addShaderFromSourceCode(QOpenGLShader::Vertex, m_vertSrc)
        && p->addShaderFromSourceCode(QOpenGLShader::Fragment, frag)
        && p->link())
    {
        // Lint aid: surface driver WARNINGS even on successful compiles, so
        // `--render X.frag ...` doubles as a shader linter.
        if (!p->log().trimmed().isEmpty())
            fprintf(stderr, "LINT %s:\n%s\n", qPrintable(fileName),
                    qPrintable(p->log().trimmed()));
        return p;
    }
    log = p->log();
    delete p;
    return nullptr;
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
// Editor slider values override the per-activation params (after defaults).
void PreviewWidget::applyParamOverrides(QOpenGLShaderProgram *p)
{
    for (const ParamOverride &o : m_overrides)
    {
        if (o.isInt) p->setUniformValue(o.name.toLatin1().constData(), int(o.value + 0.5f));
        else         p->setUniformValue(o.name.toLatin1().constData(), o.value);
    }
}

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
        p->setUniformValue("interpolation", testInterpolation());
        p->setUniformValue("transStyle", GLint(m_transStyle >= 0 ? m_transStyle : 0));
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
        applyParamOverrides(p);
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
    p->setUniformValue("interpolation", testInterpolation());
    p->setUniformValue("transStyle", GLint(m_transStyle >= 0 ? m_transStyle : 0));
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
    applyParamOverrides(p);
}

// A synthetic AudioFeatures snapshot for the scene3d path -- see the header
// comment on why this is an independent small copy of applyCommonUniforms'
// Beat/Drone math rather than a shared refactor.  audioKick/Snare/Hat are
// filled here even though the 2D synthetic path never has been: several of
// this session's newest Scene3D shaders (CoralGrowth's stick probability,
// PrismExplode's whole launch impulse, FeatherStorm's vane length, DrumSkin's
// amplitude) are driven almost entirely by audioKick, and leaving it at 0
// would make "Beat" preview mode look static for exactly the shaders this
// feature exists to check.
AudioFeatures PreviewWidget::synthFeatures(float t) const
{
    auto sw = [](float x){ return 0.5f + 0.5f * std::sin(x); };
    const bool drone = (m_mode == Drone);
    const float beatPhase = t * 2.0f - std::floor(t * 2.0f);
    const float beat  = drone ? 0.f : std::exp(-beatPhase * 6.0f);
    const float onset = drone ? 0.f : std::exp(-((t * 3.f) - std::floor(t * 3.f)) * 7.0f);
    const float downbeat = (!drone && (int(std::floor(t * 0.5f)) & 3) == 0) ? beat : 0.f;

    AudioFeatures f;
    f.overallLevel = drone ? (0.30f + 0.20f * sw(t * 0.25f)) : (0.35f + 0.25f * sw(t * 0.7f));
    f.bassLevel    = drone ? (0.5f + 0.2f * sw(t * 0.3f))  : (0.4f + 0.4f * beat);
    f.subBassLevel = drone ? (0.5f + 0.2f * sw(t * 0.22f)) : (0.3f + 0.4f * beat);
    f.lowMidLevel   = 0.3f  + 0.2f  * sw(t * 0.9f);
    f.midLevel      = 0.35f + 0.25f * sw(t * 1.1f);
    f.upperMidLevel = 0.3f  + 0.25f * sw(t * 1.7f);
    f.highLevel     = 0.25f + 0.25f * sw(t * 2.3f);
    f.beatDecay     = beat;
    f.onsetStrength = onset;
    f.downbeat      = downbeat;
    f.onsetKick     = beat;
    f.onsetSnare    = downbeat * 0.6f;
    f.onsetHat      = onset * 0.5f;
    f.ambientFactor = drone ? 1.f : 0.f;
    f.swell = drone ? (0.35f + 0.35f * std::sin(t * 0.35f)) : (0.15f + 0.15f * sw(t * 0.5f));
    f.beatPhase  = beatPhase;
    f.barPhase   = t * 0.5f - std::floor(t * 0.5f);
    f.chromaHue  = t * 0.02f - std::floor(t * 0.02f);
    f.dayPhase   = t * 0.01f - std::floor(t * 0.01f);
    f.audioRotPhase = t * 0.3f;
    f.audioAdvance  = t * 0.5f;
    for (int i = 0; i < AudioFeatures::kSpectrumBands; ++i)
        f.spectrum[i] = 0.15f + 0.7f * sw(t * 2.0f + float(i) * 0.6f) * std::exp(-float(i) / 40.f);
    return f;
}

// Mirrors EffectShader.cpp's per-activation <expr> uniform upload -- same
// AudioFeatures field -> ExprVars::Index mapping, so a formula previewed
// here evaluates the same way it would in the shipped app given the same
// audio state. Fields synthFeatures() never sets (bassRel/midRel/trebRel,
// arousal/valence, musicPresence, ...) keep AudioFeatures' own neutral
// struct defaults, which already read as "nothing unusual happening".
float PreviewWidget::evalExpr(const ExprProgram &prog) const
{
    const AudioFeatures f = synthFeatures(m_time);
    float v[ExprVars::V_COUNT];
    v[ExprVars::V_TIME]     = m_time;
    v[ExprVars::V_BASS]     = f.bassLevel;
    v[ExprVars::V_MID]      = 0.5f * (f.lowMidLevel + f.midLevel);
    v[ExprVars::V_TREB]     = 0.5f * (f.upperMidLevel + f.highLevel);
    v[ExprVars::V_BASSREL]  = f.bassRel;
    v[ExprVars::V_MIDREL]   = f.midRel;
    v[ExprVars::V_TREBREL]  = f.trebRel;
    v[ExprVars::V_SUBBASS]  = f.subBassLevel;
    v[ExprVars::V_HIGH]     = f.highLevel;
    v[ExprVars::V_LEVEL]    = f.overallLevel;
    v[ExprVars::V_KICK]     = f.onsetKick;
    v[ExprVars::V_SNARE]    = f.onsetSnare;
    v[ExprVars::V_HAT]      = f.onsetHat;
    v[ExprVars::V_ONSET]    = f.onsetStrength;
    v[ExprVars::V_BEAT]     = f.beatDecay;
    v[ExprVars::V_BEATPH]   = f.beatPhase;
    v[ExprVars::V_BARPH]    = f.barPhase;
    v[ExprVars::V_DOWNBEAT] = f.downbeat;
    v[ExprVars::V_SWELL]    = f.swell;
    v[ExprVars::V_BUILDUP]  = f.buildUp;
    v[ExprVars::V_DROP]     = f.dropPulse;
    v[ExprVars::V_CHROMA]   = f.chromaHue;
    v[ExprVars::V_CENTROID] = f.spectralCentroid;
    v[ExprVars::V_FLUX]     = f.spectralFlux;
    v[ExprVars::V_AROUSAL]  = f.arousal;
    v[ExprVars::V_VALENCE]  = f.valence;
    v[ExprVars::V_AMBIENT]  = f.ambientFactor;
    v[ExprVars::V_RHYTHM]   = f.rhythmStrength;
    v[ExprVars::V_MUSIC]    = f.musicPresence;
    v[ExprVars::V_ADVANCE]  = f.audioAdvance;
    v[ExprVars::V_PHASE]    = f.audioRotPhase;
    v[ExprVars::V_DAYPHASE] = f.dayPhase;
    v[ExprVars::V_FLATNESS] = f.spectralFlatness;
    v[ExprVars::V_ZCR]      = f.zeroCrossingRate;
    v[ExprVars::V_FADEOUT]  = f.fadeOut;
    v[ExprVars::V_SEED1]    = 0.3f;
    v[ExprVars::V_SEED2]    = 0.6f;
    v[ExprVars::V_SEED3]    = 0.9f;
    return prog.eval(v);
}

// The WAV-timeline counterpart of synthFeatures(): same envelope math as the
// timeline branch of applyCommonUniforms (peak-hold decay, slew, integrated
// phases), an independent copy for the same reason, kept in step by updating
// the SAME m_tl* members.  Those members already tolerate being advanced more
// than once per frame -- applyCommonUniforms itself is called once for the
// texture pass and once for the combine pass whenever both are 2D, and the
// second call's dt is a few microseconds, so its update is a rounding error.
// Adding this third call for the scene3d path relies on exactly that same
// tolerance rather than on any new assumption.
AudioFeatures PreviewWidget::timelineFeatures()
{
    if (m_timeline.empty())
        return synthFeatures(m_time);

    const float tp = float(m_wavClock.elapsed()) * 0.001f;
    float dt = tp - m_tlPrevT;
    if (dt < 0.f || dt > 0.25f) dt = 0.016f;
    m_tlPrevT = tp;
    const size_t n   = m_timeline.size();
    const size_t idx = size_t(tp * 100.f) % n;
    AudioFeatures out = m_timeline[idx];   // the real analyzed frame ...

    auto slew = [dt](float cur, float target, float rate) {
        float d = target - cur;
        float mx = rate * dt;
        if (d >  mx) d =  mx;
        if (d < -mx) d = -mx;
        return cur + d;
    };
    m_tlBeatEnv  = std::max(m_tlBeatEnv  * std::exp(-dt / 0.30f), out.beatDecay);
    m_tlOnsetEnv = std::max(m_tlOnsetEnv * std::exp(-dt / 0.22f), out.onsetStrength);
    m_tlDownEnv  = std::max(m_tlDownEnv  * std::exp(-dt / 0.45f), out.downbeat);
    m_tlKickEnv  = std::max(m_tlKickEnv  * std::exp(-dt / 0.24f), out.onsetKick);
    m_tlSnareEnv = std::max(m_tlSnareEnv * std::exp(-dt / 0.20f), out.onsetSnare);
    m_tlHatEnv   = std::max(m_tlHatEnv   * std::exp(-dt / 0.14f), out.onsetHat);
    m_tlBeat  = slew(m_tlBeat,  m_tlBeatEnv,  6.f);
    m_tlOnset = slew(m_tlOnset, m_tlOnsetEnv, 7.f);
    m_tlDown  = slew(m_tlDown,  m_tlDownEnv,  5.f);
    m_tlKick  = slew(m_tlKick,  m_tlKickEnv,  7.f);
    m_tlSnare = slew(m_tlSnare, m_tlSnareEnv, 7.f);
    m_tlHat   = slew(m_tlHat,   m_tlHatEnv,   8.f);

    // ... but with the smoothed / host-integrated fields overriding the
    // instantaneous sample, exactly as the 2D timeline path does.
    m_tlPhase   += (0.10f + 0.50f * m_tlBeat + 0.30f * out.overallLevel) * dt;
    m_tlAdvance += (0.15f + 1.00f * out.overallLevel) * dt;
    m_tlLvlFast += (out.overallLevel - m_tlLvlFast) * std::min(dt / 1.5f, 1.f);
    m_tlLvlSlow += (out.overallLevel - m_tlLvlSlow) * std::min(dt / 8.0f, 1.f);
    const float swell = std::min(std::max((m_tlLvlFast - m_tlLvlSlow) * 4.f, 0.f), 1.f);
    const float bpm = 40.f + 160.f * out.estimatedBPM;
    m_tlBeatPhase += (out.estimatedBPM > 0.004f ? bpm / 60.f : 0.f) * dt;
    m_tlBeatPhase -= std::floor(m_tlBeatPhase);

    out.beatDecay     = m_tlBeat;
    out.onsetStrength = m_tlOnset;
    out.downbeat      = m_tlDown;
    out.onsetKick      = m_tlKick;
    out.onsetSnare     = m_tlSnare;
    out.onsetHat       = m_tlHat;
    out.swell          = swell;
    out.audioRotPhase  = m_tlPhase;
    out.audioAdvance   = m_tlAdvance;
    out.beatPhase      = m_tlBeatPhase;
    out.barPhase       = tp * 0.25f - std::floor(tp * 0.25f);
    return out;
}

void PreviewWidget::drawFullscreenQuad(QOpenGLShaderProgram *)
{
    m_quadVAO->bind();
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    m_quadVAO->release();
}

void PreviewWidget::paintGL()
{
    m_time = (m_fixedTime >= 0.f) ? m_fixedTime : m_clock.elapsed() * 0.001f;

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
    const bool is3D = (m_texType == "scene3d");
    QString log;
    if (m_texDirty)
    {
        if (is3D)
        {
            // shader_setup.cpp's loader exit(1)s on a REQUIRED file (vert or
            // frag) that is missing -- right for the shipped app, wrong for an
            // editor where the shader may be mid-edit.  Confirm both exist
            // BEFORE ever calling in, so that path is never reached.
            const QString base = QFileInfo(m_texFile).completeBaseName();
            const QString fragAbs = m_root + "/Scene3D/" + m_texFile;
            const QString vertAbs = m_root + "/Scene3D/" + base + ".vert";
            if (!QFile::exists(fragAbs) || !QFile::exists(vertAbs))
            {
                m_scenePreview.clear();
                emit statusChanged(m_texFile + QString("\nmissing %1")
                    .arg(QFile::exists(fragAbs) ? base + ".vert" : m_texFile));
            }
            else
            {
                const QString fragRel = "..\\Scene3D\\" + m_texFile;
                m_scenePreview.setShader(fragRel, m_texGeom, m_texStateBytes,
                                          m_texShadowExtent, log);
                // A fresh Scene3DShader has no per-activation params registered
                // yet -- without this, every camHP/densityP/glowP/... uniform
                // the shader declares sits at GLSL's zero default, which for
                // several scenes (a zeroed eye height, a zeroed extent) breaks
                // the framing outright rather than just looking untuned.
                for (const KomplettRange &r : komplettRangesFor(m_root, m_texFile))
                {
                    if (r.kind == "int")
                        m_scenePreview.addIntRange(r.name, int(r.minV), int(r.maxV));
                    else
                        m_scenePreview.addFloatRange(r.name, r.minV, r.maxV);
                }
                emit statusChanged(m_texFile + (log.isEmpty() ? "  OK" : "\n" + log));
            }
        }
        else
        {
            m_scenePreview.clear();
            delete m_texProg;  m_texProg  = compile(m_texFile, log);
            emit statusChanged(m_texFile + (log.isEmpty() ? "  OK" : "\n" + log));
        }
        m_texDirty = false;
    }
    if (m_combDirty) { delete m_combProg; m_combProg = compile(m_combFile, log);
                       m_combDirty = false; }

    // Bind sample images once (units 0, 1 and 7 for texSim stand-in).
    glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, m_img0);
    glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, m_img1);
    glActiveTexture(GL_TEXTURE7); glBindTexture(GL_TEXTURE_2D, m_img0);
    glActiveTexture(GL_TEXTURE0);

    unsigned sceneColorTex = 0, sceneDepthTex = 0;
    if (is3D && m_scenePreview.active())
    {
        const AudioFeatures feats = m_timeline.empty() ? synthFeatures(m_time)
                                                        : timelineFeatures();
        m_scenePreview.render(w, h, m_time, testInterpolation(), feats,
                               m_img0, m_img1, sceneColorTex, sceneDepthTex);
    }
    else if (!is3D && m_texProg)
    {
        // ---- Pass 1: texture shader -> FBO (unchanged 2D path) ----
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

    const bool haveScene = is3D && sceneColorTex != 0;
    if (m_combProg && (haveScene || m_texProg))
    {
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, haveScene ? sceneColorTex : m_fbo->texture());
        glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, m_img1);
        // A depth-reading combine (fog, AO, sun shafts, the edge/rim/heat-
        // shimmer trio) needs the SAME depthValid/texDepth0/nearFar/tanHalfFov
        // contract the main host gives it.  Bound unconditionally on unit 2,
        // like the main app binds both unconditionally too: a combine that
        // never declares the sampler simply never looks it up.
        glActiveTexture(GL_TEXTURE0 + 2);
        glBindTexture(GL_TEXTURE_2D, haveScene ? sceneDepthTex : 0);
        glActiveTexture(GL_TEXTURE0);
        m_combProg->bind();
        applyCommonUniforms(m_combProg);
        m_combProg->setUniformValue("texDepth0", 2);
        m_combProg->setUniformValue("depthValid", QVector2D(haveScene ? 1.f : 0.f, 0.f));
        m_combProg->setUniformValue("nearFar",
            QVector2D(EffectShader::kSceneNear, EffectShader::kSceneFar));
        m_combProg->setUniformValue("tanHalfFov", EffectShader::kSceneTanHalfFovY);
        drawFullscreenQuad(m_combProg);
        m_combProg->release();
    }
    else if (haveScene)
    {
        // Combine failed to compile: unlike the 2D fallback below (which just
        // re-runs the texture shader), there is no cheap "re-render without a
        // combine" step for a 3D scene here -- render() already produced the
        // frame into its own FBO, and blitting it back out needs machinery
        // this class does not otherwise have.  The compile error is already
        // visible in the status bar (onCombineChanged's log), so this is a
        // visible, not silent, degradation: leave the screen cleared.
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

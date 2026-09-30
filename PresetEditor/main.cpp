/**
 * @file main.cpp
 * @brief Entry point and CLI dispatch for the standalone Preset Editor.
 *
 * PresetEditor — a standalone editor for the visualizer's preset XMLs, with a
 * live preview of each texture/combine shader.  Independent of the main app.
 *
 * main() first checks argv for one of several headless self-test/probe
 * flags (each returns without ever opening the QMainWindow); if none match,
 * it falls through to launching the normal windowed editor (EditorWindow).
 *
 * Usage:
 *   PresetEditor.exe                         launch the editor GUI
 *   PresetEditor.exe --roundtrip in.xml out.xml   headless load+save (self-test)
 *   PresetEditor.exe --validate [preset.xml]      headless completeness check: every
 *                                            preset entry must carry every param its
 *                                            shader declares in Komplett.xml (checks
 *                                            all Presets/ *.xml if no file given)
 *   PresetEditor.exe --render tex.frag comb.frag out.png [W H]   grab one preview
 *                                            frame to a PNG (optional --geom/
 *                                            --stateBytes/--shadowExtent for scene3d,
 *                                            --param name=value, --expr name=formula,
 *                                            --time seconds, --images dir, "drone",
 *                                            --trans d to pin a transition's progress
 *                                            in [0,1] -- comb.frag should then be a
 *                                            folder-qualified "Transitions/X.frag")
 *   PresetEditor.exe --transcheck            verify every shader in Transitions/:
 *                                            exact A at d=0 / exact B at d=1 and
 *                                            no temporal jumps across the sweep
 *   PresetEditor.exe --transprofile          measure how each registered transition
 *                                            distributes its change over the fade
 *                                            (core80, clock flicker, flash; optional
 *                                            --images dir, --steps N, --out file.tsv,
 *                                            --scene Blit.frag for a still A, drone)
 *   PresetEditor.exe --compile <files|@list> compile every shader with the real driver
 *                                            (fullscreen fragments also linked against
 *                                            Engine/Fullscreen.vert); exit code = failures
 *   PresetEditor.exe --cfxcheck              verify the GL 4.3 compute-FX
 *                                            2D shaders don't render solid
 *                                            black (regression guard)
 */
#include <QtWidgets/QApplication>
#include <QtGui/QSurfaceFormat>
#include <QtGui/QImage>
#include <QtGui/QColor>
#include <QtGui/QIcon>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QTimer>
#include <QtCore/QFile>
#include <QtCore/QRegularExpression>
#include <QtGui/QOffscreenSurface>
#include <QtGui/QOpenGLContext>
#include <QtGui/QOpenGLExtraFunctions>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <vector>
#include <algorithm>
#include <functional>
#include <memory>

#include "EditorWindow.h"
#include "PreviewWidget.h"
#include "Preset.h"

/**
 * @brief Locate the visualizer project root directory.
 * @return Absolute path of the first ancestor of the exe dir or the current dir that contains both standard.vert and a presets folder; falls back to the current working directory if none is found.
 *
 * Find the project root (the folder holding standard.vert + Presets) by
 * searching up from the exe dir and the current dir.  Keeps the editor working
 * whether it's run from its own out-dir, the project root, or Release\.
 */
static QString findRoot()
{
    QStringList cands;
    QDir a(QCoreApplication::applicationDirPath());
    for (int i = 0; i < 6; ++i) { cands << a.absolutePath(); if (!a.cdUp()) break; }
    QDir c(QDir::currentPath());
    for (int i = 0; i < 6; ++i) { cands << c.absolutePath(); if (!c.cdUp()) break; }
    for (const QString &p : cands)
        if (QFileInfo::exists(p + "/standard.vert") &&
            (QFileInfo::exists(p + "/Presets") || QFileInfo::exists(p + "/Configurations")))
            return p;
    return QDir::currentPath();
}

/**
 * @brief Program entry point: dispatches to a headless CLI probe mode, or launches the windowed editor.
 * @param argc Argument count (as passed by the OS).
 * @param argv Argument values (as passed by the OS); argv[0] is the exe path.
 * @return Process exit code: 0 on success, non-zero (or a probe's own failure count) on failure; for the GUI/probe modes that run a Qt event loop this is QApplication::exec()'s return value.
 *
 * See the file-level comment above for the CLI contract. Every headless
 * branch below returns before a QApplication with a full GUI is ever shown
 * (the --render/--cfxcheck/--transcheck probes still run a QApplication
 * event loop to drive an offscreen-ish GL widget, but never construct the
 * EditorWindow).
 */
int main(int argc, char *argv[])
{
    QStringList args;
    for (int i = 1; i < argc; ++i) args << QString::fromLocal8Bit(argv[i]);

    // Headless self-test: load a preset and write it back out (no GUI / GL).
    if (args.value(0) == "--roundtrip" && args.size() >= 3)
    {
        QCoreApplication app(argc, argv);
        Preset p; QString err;
        if (!Preset::load(args[1], p, &err)) { fprintf(stderr, "load: %s\n", qPrintable(err)); return 1; }
        if (!p.save(args[2], &err))          { fprintf(stderr, "save: %s\n", qPrintable(err)); return 1; }
        fprintf(stderr, "roundtrip ok: %d entries\n", int(p.entries.size()));
        return 0;
    }

    // Headless completeness check: every preset entry should carry every
    // <bool>/<int>/<float>/<expr>/<interpolator> param its shader declares in
    // Komplett.xml (the exhaustive reference every shader is registered
    // against).  A param may legitimately carry a DIFFERENT value/range per
    // preset -- that is the point of per-preset tuning, not a bug -- but a
    // param that is entirely ABSENT silently rolls that uniform to GLSL's
    // zero default at runtime, which is a real bug (found this way once
    // already: TestShatter.xml's LavaLamp.frag entry was missing sizeP and
    // both <expr> lines every other preset has). This checks presence, never
    // equality, so deliberately different tuning across presets is not flagged.
    //   --validate                 checks every Presets/ *.xml (except
    //                               Komplett.xml itself)
    //   --validate <preset.xml>    checks just that one file
    if (args.value(0) == "--validate")
    {
        QCoreApplication app(argc, argv);
        const QString cfgDir = presetsDir(findRoot());
        Preset komplett; QString err;
        if (!Preset::load(cfgDir + "/Komplett.xml", komplett, &err))
        {
            fprintf(stderr, "validate: cannot load Komplett.xml: %s\n", qPrintable(err));
            return 1;
        }

        QStringList paths;
        if (args.size() >= 2) paths << args[1];
        else for (const QString &f : QDir(cfgDir).entryList({ "*.xml" }, QDir::Files, QDir::Name))
                 if (f != "Komplett.xml") paths << (cfgDir + "/" + f);

        int gaps = 0, checkedFiles = 0;
        for (const QString &path : paths)
        {
            Preset p;
            if (!Preset::load(path, p, &err))
            {
                fprintf(stderr, "validate: %s: %s\n", qPrintable(path), qPrintable(err));
                continue;
            }
            ++checkedFiles;
            for (const PresetEntry &e : p.entries)
            {
                const PresetEntry *ref = nullptr;
                for (const PresetEntry &k : komplett.entries)
                    if (k.file == e.file && k.isCombine == e.isCombine
                        && k.isTransition == e.isTransition
                        // Folder-aware: Scene2D/X.frag and Scene3D/X.frag are
                        // DIFFERENT scenes sharing a bare name (CrystalGrowth)
                        // -- a bare-name match checked one against the other's
                        // params.  Empty folder (legacy) matches anything.
                        && (k.folder.isEmpty() || e.folder.isEmpty()
                            || k.folder.compare(e.folder, Qt::CaseInsensitive) == 0))
                    { ref = &k; break; }
                if (!ref) continue;   // not (or no longer) in Komplett.xml -- nothing to compare against
                for (const ShaderParam &kp : ref->params)
                {
                    // Audio-mapping overrides (<expr name="audioKick"> etc.)
                    // and camera-rig formulas (<expr name="rigRoll"> etc.)
                    // are deliberately PER-PRESET: absence means "raw engine
                    // value" / "rig off", the correct default -- not a
                    // completeness gap.  Requiring them everywhere would
                    // force every preset to copy Komplett's mapping.
                    if (kp.kind == "expr" && (kp.name.startsWith("audio")
                                               || kp.name.startsWith("rig")))
                        continue;
                    // Match on (name, kind): a shader can carry an <expr> AND
                    // a <float> of the same name (formula + declared clamp
                    // range) -- an entry that only has one of the two is
                    // still missing the other.
                    bool have = false;
                    for (const ShaderParam &p2 : e.params)
                        if (p2.name == kp.name && p2.kind == kp.kind) { have = true; break; }
                    if (!have)
                    {
                        fprintf(stderr, "MISSING  %-20s %-28s '%s' (%s)\n",
                                qPrintable(QFileInfo(path).fileName()), qPrintable(e.file),
                                qPrintable(kp.name), qPrintable(kp.kind));
                        ++gaps;
                    }
                }
            }
        }
        if (gaps) fprintf(stderr, "VALIDATE: %d missing param(s) across %d file(s)\n", gaps, checkedFiles);
        else      fprintf(stderr, "VALIDATE: all %d file(s) complete vs. Komplett.xml\n", checkedFiles);
        return gaps ? 1 : 0;
    }

    // Shared GL/app setup for every remaining path below (--render,
    // --cfxcheck, --transcheck, and the normal windowed editor): the
    // --roundtrip and --validate modes above never reach this point since
    // they need no GL context at all.
    QSurfaceFormat fmt;
    // 4.3, matching the main app: several texture shaders (FractalFlame,
    // VolumetricFire, PixelSort/PixelMelt, SpectrumFilter, InkTank, ...) are
    // driven by a GL 4.3 compute pass (see ComputeFX). A 3.3 context made
    // ComputeFX::init() fail its capability check and step() return 0 -- so
    // those shaders rendered solid black here even with the dispatch below.
    fmt.setVersion(4, 3);
    fmt.setProfile(QSurfaceFormat::CoreProfile);
    fmt.setRenderableType(QSurfaceFormat::OpenGL);
    fmt.setSwapBehavior(QSurfaceFormat::DoubleBuffer);
    fmt.setDepthBufferSize(24);
    QSurfaceFormat::setDefaultFormat(fmt);

    QApplication app(argc, argv);
    const QString root = findRoot();
    // Window/taskbar icon of the RUNNING app; the exe's own Explorer icon
    // comes from PresetEditor.rc (Qt doesn't read that resource itself).
    // Resolved against root, not the CWD: main() re-anchors the CWD below.
    app.setWindowIcon(QIcon(root + "/icon.ico"));

    // shader_setup.cpp / textfile.cpp resolve every path relative to the
    // process's CURRENT WORKING DIRECTORY, hard-coded in the "..\Engine\...",
    // "..\standard.vert", "..\Scene3D\..." style the whole engine's configs
    // already use.  The main app gets this for free because its exe lives one
    // level below root (Release\); PresetEditor.exe does not, and until a
    // scene3d shader was added, nothing in this app ever exercised a
    // CWD-relative path (PreviewWidget's own 2D loader resolves everything
    // against `root` explicitly).  Anchoring the CWD here, once, before any
    // shader ever loads, makes those same relative strings resolve correctly
    // regardless of where the exe was launched from.
    QDir::setCurrent( root + "/PresetEditor" );

    // Headless GLSL compile check (Tools/shadercheck.py runs it): every file
    // is compiled by the real driver, exactly as the app loads it (raw source,
    // no preprocessing), with its stage taken from the extension.  Fullscreen
    // fragment shaders (Scene2D, FX, Transitions, Engine) are also LINKED
    // against Engine/Fullscreen.vert like the app does -- that catches
    // in/out mismatches a lone compile does not.  Scene3D stages are compiled
    // only (their pipelines are assembled per preset entry).
    //   --compile <file> ...      files relative to the project root or absolute
    //   --compile @list.txt       one file per line (long lists)
    // Output: "COMPILE FAIL <file>" + the driver log per failure, then a
    // summary line; exit code = number of failed files (capped at 255).
    if (args.value(0) == "--compile")
    {
        QStringList files;
        for (int i = 1; i < args.size(); ++i)
        {
            if (args[i].startsWith('@'))
            {
                QFile lf(args[i].mid(1));
                if (lf.open(QIODevice::ReadOnly | QIODevice::Text))
                    for (const QByteArray &l : lf.readAll().split('\n'))
                        if (!l.trimmed().isEmpty()) files << QString::fromUtf8(l.trimmed());
            }
            else files << args[i];
        }
        QOffscreenSurface surf;
        surf.setFormat(fmt);
        surf.create();
        QOpenGLContext ctx;
        ctx.setFormat(fmt);
        if (!ctx.create() || !ctx.makeCurrent(&surf))
        {
            fprintf(stderr, "COMPILE: no GL %d.%d context\n", fmt.majorVersion(), fmt.minorVersion());
            return 255;
        }
        QOpenGLExtraFunctions *gl = ctx.extraFunctions();
        auto readAll = [](const QString &path, QByteArray &out) {
            QFile f(path);
            if (!f.open(QIODevice::ReadOnly)) return false;
            out = f.readAll();
            return true;
        };
        auto shaderLog = [gl](GLuint s) {
            GLint n = 0; gl->glGetShaderiv(s, GL_INFO_LOG_LENGTH, &n);
            QByteArray b(n > 1 ? n : 1, '\0');
            if (n > 1) gl->glGetShaderInfoLog(s, n, nullptr, b.data());
            return QString::fromLocal8Bit(b.constData()).trimmed();
        };
        auto compile = [&](GLenum type, const QByteArray &src, QString *log) -> GLuint {
            GLuint s = gl->glCreateShader(type);
            const char *p = src.constData();
            const GLint len = GLint(src.size());
            gl->glShaderSource(s, 1, &p, &len);
            gl->glCompileShader(s);
            GLint ok = 0; gl->glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
            if (!ok) { if (log) *log = shaderLog(s); gl->glDeleteShader(s); return 0; }
            return s;
        };
        // The app's shared fullscreen vertex shader, for the link check.
        QByteArray vsSrc; GLuint fsVert = 0;
        if (readAll(root + "/Engine/Fullscreen.vert", vsSrc))
            fsVert = compile(GL_VERTEX_SHADER, vsSrc, nullptr);

        int failed = 0, done = 0;
        for (const QString &f : files)
        {
            const QString path = QFileInfo(f).isAbsolute() ? f : root + "/" + f;
            const QString ext = QFileInfo(path).suffix().toLower();
            GLenum type = 0;
            if (ext == "frag")      type = GL_FRAGMENT_SHADER;
            else if (ext == "vert") type = GL_VERTEX_SHADER;
            else if (ext == "geom") type = GL_GEOMETRY_SHADER;
            else if (ext == "tesc") type = GL_TESS_CONTROL_SHADER;
            else if (ext == "tese") type = GL_TESS_EVALUATION_SHADER;
            else if (ext == "comp") type = GL_COMPUTE_SHADER;
            else continue;
            QByteArray src;
            if (!readAll(path, src)) { fprintf(stderr, "COMPILE FAIL %s\n  cannot read\n", qPrintable(f)); ++failed; continue; }
            ++done;
            QString log;
            GLuint s = compile(type, src, &log);
            const QString rel = QDir(root).relativeFilePath(path).replace('\\', '/');
            const bool fullscreen = type == GL_FRAGMENT_SHADER && !rel.startsWith("Scene3D/", Qt::CaseInsensitive);
            if (s && fullscreen && fsVert)
            {
                GLuint prog = gl->glCreateProgram();
                gl->glAttachShader(prog, fsVert);
                gl->glAttachShader(prog, s);
                gl->glLinkProgram(prog);
                GLint ok = 0; gl->glGetProgramiv(prog, GL_LINK_STATUS, &ok);
                if (!ok)
                {
                    GLint n = 0; gl->glGetProgramiv(prog, GL_INFO_LOG_LENGTH, &n);
                    QByteArray b(n > 1 ? n : 1, '\0');
                    if (n > 1) gl->glGetProgramInfoLog(prog, n, nullptr, b.data());
                    log = "link: " + QString::fromLocal8Bit(b.constData()).trimmed();
                    gl->glDeleteShader(s); s = 0;
                }
                gl->glDeleteProgram(prog);
            }
            if (!s)
            {
                ++failed;
                fprintf(stderr, "COMPILE FAIL %s\n", qPrintable(rel));
                const QStringList lines = log.split('\n');
                for (int i = 0; i < lines.size() && i < 6; ++i)
                    fprintf(stderr, "  %s\n", qPrintable(lines[i].trimmed()));
            }
            else gl->glDeleteShader(s);
        }
        fprintf(stderr, "COMPILE: %d file(s), %d failed\n", done, failed);
        return failed > 255 ? 255 : failed;
    }

    // Headless-ish preview grab: render one frame of a shader pair to a PNG.
    // Optional trailing arg "drone" switches the synthesized music profile.
    // Optional --geom/--stateBytes/--shadowExtent select the scene3d path
    // (tex.frag must then be a Scene3D/ file); their absence keeps the
    // texture shader on the original type="normal" path.
    // Optional --param name=value (repeatable) pins a texture-shader uniform
    // to an exact value -- the same mechanism the editor's live sliders use
    // (PreviewWidget::setParamOverrides) -- so a specific PRESET ENTRY's saved
    // range can actually be rendered and compared, not just guessed at from
    // the numbers.  Optional --time seconds pins the clock (setFixedTime) so
    // two renders at different param values are directly comparable.
    // Optional --expr name=formula (repeatable) injects a formula-layer entry
    // (PreviewWidget::setSceneExprs) -- for audio* names this exercises the
    // REAL override path (EffectShader::applyAudioFeatures + runGenerator's
    // audio pass on scene3d), so an A/B render with --expr audioKick=0 vs =6
    // proves the audio-mapping plumbing end to end.  Unlike --param this
    // reaches the scene3d path too.
    if (args.value(0) == "--render" && args.size() >= 4)
    {
        PreviewWidget *w = new PreviewWidget(root);
        // Only the GUI (EditorWindow) normally listens to this signal, so a
        // headless --render run silently dropped every "missing X.vert" /
        // shader-compile-error message it carries -- a scene3d shader whose
        // fragment/vertex pair could not be found (e.g. --geom used with a
        // path-prefixed filename instead of the bare "X.frag" this CLI
        // expects; see setTextureShader()'s scene3d branch) rendered a plain
        // black frame with zero diagnostic output. Surface it on stderr here
        // so a bad --render invocation is loud instead of silently wrong.
        QObject::connect(w, &PreviewWidget::statusChanged, [](const QString &s) {
            fprintf(stderr, "%s\n", qPrintable(s));
        });
        const int W = args.value(4, "960").toInt();
        const int H = args.value(5, "600").toInt();
        auto flagValue = [&](const QString &flag) -> QString {
            int i = args.indexOf(flag);
            return (i >= 0 && i + 1 < args.size()) ? args[i + 1] : QString();
        };
        const QString geom = flagValue("--geom");
        // --images <dir>: bind real photos as tex0/tex1 instead of the
        // colourful procedural test card.  Essential for catalogue renders:
        // with the test card every imgPalette scene LOOKS rainbow-coloured
        // even though in the app it inherits the current photo's palette.
        const QString imgDir = flagValue("--images");
        if (!imgDir.isEmpty()) w->setImageDirectory(imgDir);
        if (!geom.isEmpty())
            w->setTextureShader(args[1], "scene3d", geom,
                                 flagValue("--stateBytes").toInt(),
                                 flagValue("--shadowExtent").toDouble());
        else
            w->setTextureShader(args[1]);
        w->setCombineShader(args[2]);
        // --trans d: pin the transition test bench to progress d in [0,1]
        // (0 = old scene fully visible, 1 = new scene) -- the same knob
        // --transcheck sweeps.  This is how the catalogue renders a
        // MID-transition frame of a Transitions/ shader; without it the
        // combine runs at the overlay's pinned interpolation=1.0 and a
        // transition would just show the untouched reference scene.
        const QString transArg = flagValue("--trans");
        if (!transArg.isEmpty()) w->setTransTest(0, transArg.toFloat());
        if (args.contains("drone"))
            w->setMusicMode(PreviewWidget::Drone);
        QVector<PreviewWidget::ParamOverride> overrides;
        for (int i = 0; i < args.size(); ++i)
        {
            if (args[i] != "--param" || i + 1 >= args.size()) continue;
            const QString kv = args[++i];
            const int eq = kv.indexOf('=');
            if (eq > 0)
                overrides.push_back({ kv.left(eq), kv.mid(eq + 1).toFloat(), false });
        }
        if (!overrides.isEmpty()) w->setParamOverrides(overrides);
        QVector<QPair<QString, QString>> exprs;
        for (int i = 0; i < args.size(); ++i)
        {
            if (args[i] != "--expr" || i + 1 >= args.size()) continue;
            const QString kv = args[++i];
            const int eq = kv.indexOf('=');
            if (eq > 0) exprs.push_back({ kv.left(eq), kv.mid(eq + 1) });
        }
        if (!exprs.isEmpty()) w->setSceneExprs(exprs);
        const QString timeArg = flagValue("--time");
        if (!timeArg.isEmpty()) w->setFixedTime(timeArg.toFloat());
        w->resize(W ? W : 960, H ? H : 600);
        w->show();
        const QString out = args[3];
        // A 3D scene compiles a compute generator + shadow map + OIT targets
        // on its first frame; give it longer than the 2D path's 1 s before
        // the grab.
        QTimer::singleShot(geom.isEmpty() ? 1000 : 2500, [w, out]() {
            QImage img = w->grabFramebuffer();
            img.save(out);
            QApplication::quit();
        });
        return app.exec();
    }

    // Compute-FX regression guard: renders a fixed set of GL 4.3 compute-
    // driven 2D texture shaders and checks each ISN'T solid black. This is
    // exactly the failure mode fixed in this repo's history (the editor
    // requesting only a 3.3 context, and the 2D preview path never
    // dispatching the compute pass at all) -- a plain --render smoke test
    // wouldn't catch a silent regression back to either, since nothing
    // asserts on the pixels it grabs. One shader per sim family so a future
    // regression in any one of them (not just the one someone happens to
    // manually check) still fails CI.
    if (args.value(0) == "--cfxcheck")
    {
        struct CfxCheckState { PreviewWidget *w; QStringList shaders; int idx = 0; int fails = 0; };
        auto state = std::make_shared<CfxCheckState>();
        state->w = new PreviewWidget(root);
        state->shaders = { "FractalFlame.frag", "ParticleFlow.frag",
                            "SpectrumFilter.frag", "PixelMelt.frag" };
        state->w->resize(320, 200);   // small: only average brightness matters
        state->w->show();

        auto step = std::make_shared<std::function<void()>>();
        *step = [state, step]() {
            if (state->idx >= state->shaders.size())
            {
                fprintf(stderr, "CFXCHECK: %d failure(s) of %d shader(s)\n",
                        state->fails, int(state->shaders.size()));
                qApp->exit(state->fails ? 1 : 0);
                return;
            }
            const QString name = state->shaders[state->idx];
            state->w->setTextureShader(name);
            state->w->setCombineShader("FxPlain.frag");
            // Same warm-up window --render already gives a fresh compute-FX
            // shader (see its own comment above) before the first grab.
            QTimer::singleShot(1200, [state, step, name]() {
                const QImage img = state->w->grabFramebuffer();
                double sum = 0.0;
                int n = 0;
                for (int y = 0; y < img.height(); y += 7)
                    for (int x = 0; x < img.width(); x += 7)
                    {
                        const QColor c = img.pixelColor(x, y);
                        sum += (c.red() + c.green() + c.blue()) / 3.0;
                        ++n;
                    }
                const double avgLuma = n ? sum / n : 0.0;
                const bool ok = avgLuma > 3.0;   // solid black averages ~0
                fprintf(stderr, "cfxcheck %-20s avgLuma=%6.2f  %s\n",
                        qPrintable(name), avgLuma, ok ? "OK" : "FAIL (looks black)");
                if (!ok) ++state->fails;
                ++state->idx;
                (*step)();
            });
        };
        (*step)();
        return app.exec();
    }

    // Transition test bench: sweep every FxPlain style over d = 0..1 with
    // a PINNED clock (deterministic frames) and verify (a) endpoint identity —
    // exactly scene A at d=0, exactly scene B at d=1 — and (b) temporal
    // continuity: no single step may dwarf the style's own typical step.
    // This is exactly the harness that would have caught the corner leaks /
    // end snaps fixed in the diagonal/blinds/push/doors/pixelation styles.
    if (args.value(0) == "--transcheck")
    {
        PreviewWidget *w = new PreviewWidget(root);
        w->setTextureShader("Kaleidoscope.frag");
        w->setCombineShader("Transitions/Crossfade.frag");
        w->setFixedTime(8.f);
        w->resize(640, 400);
        w->show();
        // Every Transitions/*.frag is swept through the preview's combine
        // slot (the interfaces are identical: tex0/tex1/interpolation).
        // Optional --core restricts the run to the 28 split-out FxPlain
        // styles (the fast CI set); default is the full folder.
        QStringList transFiles = QDir(root + "/Transitions").entryList(
                                     { "*.frag" }, QDir::Files, QDir::Name);
        QTimer::singleShot(800, [w, transFiles]() {
            auto meanDiff = [](const QImage &ia, const QImage &ib) -> double {
                QImage x = ia.convertToFormat(QImage::Format_RGB888);
                QImage y = ib.convertToFormat(QImage::Format_RGB888);
                double s = 0.0;
                const int bytes = x.width() * 3;
                for (int r = 0; r < x.height(); ++r) {
                    const uchar *pa = x.constScanLine(r);
                    const uchar *pb = y.constScanLine(r);
                    for (int c = 0; c < bytes; ++c)
                        s += std::abs(int(pa[c]) - int(pb[c]));
                }
                return s / (double(x.height()) * bytes);   // mean |diff| in 0..255
            };
            const int steps = 24;
            // Endpoint truth from the linear Crossfade: exact scene A at
            // d=0 and exact scene B at d=1, for every transition.
            w->setTransTest(0, 0.f);  QImage refA = w->grabFramebuffer();
            w->setTransTest(0, 1.f);  QImage refB = w->grabFramebuffer();
            int fails = 0;
            fprintf(stderr, "TRANSCHECK  %d transition(s)  (endpoints <= 1.5/255; jump = maxStep/medianStep <= 6)\n",
                    (int) transFiles.size());
            for (const QString &tf : transFiles) {
                // Folder-qualified: a bare name would resolve through the
                // preview's Scene2D-first search order, and Scene2D carries
                // a VoronoiShatter.frag SCENE that shadows the transition.
                w->setCombineShader("Transitions/" + tf);
                QImage prev;
                std::vector<double> stepDiffs;
                double endA = 0.0, endB = 0.0, maxStep = 0.0;
                for (int i = 0; i <= steps; ++i) {
                    w->setTransTest(0, float(i) / steps);
                    QImage f = w->grabFramebuffer();
                    if (i == 0)     endA = meanDiff(f, refA);
                    if (i == steps) endB = meanDiff(f, refB);
                    if (i > 0) {
                        double d = meanDiff(f, prev);
                        stepDiffs.push_back(d);
                        if (d > maxStep) maxStep = d;
                    }
                    prev = f;
                }
                std::sort(stepDiffs.begin(), stepDiffs.end());
                double med  = stepDiffs[stepDiffs.size() / 2];
                double jump = (med > 0.05) ? maxStep / med : 0.0;
                bool ok = endA <= 1.5 && endB <= 1.5 && jump <= 6.0;
                if (!ok) ++fails;
                fprintf(stderr, "%-38s endA %5.2f  endB %5.2f  maxStep %6.2f  jump %5.1fx  %s\n",
                        qPrintable(tf), endA, endB, maxStep, jump, ok ? "OK" : "FAIL");
            }
            if (fails) fprintf(stderr, "TRANSCHECK: %d transition(s) FAILED\n", fails);
            else       fprintf(stderr, "TRANSCHECK: all %d transitions OK\n", (int) transFiles.size());
            qApp->exit(fails ? 1 : 0);
        });
        return app.exec();
    }

    // Transition SPEED profile -- a measurement, not a pass/fail check.
    // "Some transitions are very, very fast" (user, 14.09.2026) is not a
    // property of the fade length alone: with a confident rhythm the
    // scheduler clamps every fade to four beats (2 s at 120 BPM), and a
    // transition that does all of its visible work in a tenth of its
    // progress is then over in 0.2 s while a linear cross-fade takes the
    // whole two.  This sweeps every <TransitionShader> registered in
    // Komplett.xml over d = 0..1 with a pinned clock and the entry's float
    // params at mid-range, and reports how the change is DISTRIBUTED:
    //   tv      total variation: sum of mean |frame step| (0..255 units)
    //   core80  shortest fraction of the fade carrying 80 % of tv; a linear
    //           cross-fade reads 0.80, "everything in a tenth" reads 0.10
    //   peak    largest single step as a share of tv
    //   flick   change from the CLOCK alone over one frame (1/30 s), worst
    //           of d = 0.25/0.5/0.75, minus Crossfade's at the same d (the
    //           scene's own motion) -- internal animation a longer fade
    //           cannot slow down
    //   flash   brightest mean luma of the sweep minus the brighter end
    //   steps   the per-step changes, for building a progress warp
    // Optional: --images <dir>, --steps N (default 40), --out <tsv>.
    if (args.value(0) == "--transprofile")
    {
        auto flag = [&](const QString &f) -> QString {
            int i = args.indexOf(f);
            return (i >= 0 && i + 1 < args.size()) ? args[i + 1] : QString();
        };
        PreviewWidget *w = new PreviewWidget(root);
        if (!flag("--images").isEmpty()) w->setImageDirectory(flag("--images"));
        // "drone": the synthetic profile without transients, so what remains
        // of flick is the transition's own clock-driven motion.
        if (args.contains("drone")) w->setMusicMode(PreviewWidget::Drone);
        // --scene Blit.frag: a STILL photo as scene A, so flick is the
        // transition's motion alone and not the scene's own movement
        // leaking through wherever a wipe shows more of it than a mix does.
        w->setTextureShader(flag("--scene").isEmpty() ? QString("Kaleidoscope.frag") : flag("--scene"));
        w->setCombineShader("Transitions/Crossfade.frag");
        w->setFixedTime(8.f);
        w->resize(480, 270);
        w->show();

        struct Entry { QString file; QVector<PreviewWidget::ParamOverride> ov; };
        auto entries = std::make_shared<std::vector<Entry>>();
        {
            QFile xf(presetsDir(root) + "/Komplett.xml");
            if (xf.open(QIODevice::ReadOnly)) {
                const QString src = QString::fromUtf8(xf.readAll());
                const QRegularExpression reEntry("<TransitionShader\\b([^>]*)>(.*?)</TransitionShader>",
                                                 QRegularExpression::DotMatchesEverythingOption);
                const QRegularExpression reFile("file=\"([^\"]+)\"");
                const QRegularExpression reFloat("<float\\s+name=\"([^\"]+)\"\\s+minValue=\"([^\"]+)\"\\s+maxValue=\"([^\"]+)\"");
                auto it = reEntry.globalMatch(src);
                while (it.hasNext()) {
                    const auto m = it.next();
                    const auto fm = reFile.match(m.captured(1));
                    if (!fm.hasMatch()) continue;
                    QString f = fm.captured(1);
                    f.replace('\\', '/');
                    Entry e;
                    e.file = f.section('/', -1, -1, QString::SectionSkipEmpty);
                    auto pit = reFloat.globalMatch(m.captured(2));
                    while (pit.hasNext()) {
                        const auto pm = pit.next();
                        const float lo = pm.captured(2).toFloat(), hi = pm.captured(3).toFloat();
                        e.ov.push_back({ pm.captured(1), 0.5f * (lo + hi), false });
                    }
                    entries->push_back(e);
                }
            }
        }
        const int steps = std::max(8, flag("--steps").isEmpty() ? 40 : flag("--steps").toInt());
        const QString outPath = flag("--out");
        // --flicktime 8.0 samples ON the preview's kick (envelope peak), which
        // is how a kick-coupled transition shows itself; default is between beats.
        const float flickT = flag("--flicktime").isEmpty() ? 8.25f : flag("--flicktime").toFloat();

        QTimer::singleShot(800, [w, entries, steps, outPath, flickT]() {
            auto meanDiff = [](const QImage &ia, const QImage &ib) -> double {
                QImage x = ia.convertToFormat(QImage::Format_RGB888);
                QImage y = ib.convertToFormat(QImage::Format_RGB888);
                double s = 0.0;
                const int bytes = x.width() * 3;
                for (int r = 0; r < x.height(); ++r) {
                    const uchar *pa = x.constScanLine(r);
                    const uchar *pb = y.constScanLine(r);
                    for (int c = 0; c < bytes; ++c)
                        s += std::abs(int(pa[c]) - int(pb[c]));
                }
                return s / (double(x.height()) * bytes);
            };
            auto meanLuma = [](const QImage &ia) -> double {
                QImage x = ia.convertToFormat(QImage::Format_RGB888);
                double s = 0.0; long n = 0;
                for (int r = 0; r < x.height(); r += 3) {
                    const uchar *p = x.constScanLine(r);
                    for (int c = 0; c < x.width(); c += 3, ++n)
                        s += 0.299 * p[c * 3] + 0.587 * p[c * 3 + 1] + 0.114 * p[c * 3 + 2];
                }
                return n ? s / n : 0.0;
            };
            const float ds[3] = { 0.25f, 0.5f, 0.75f };
            auto clockFlicker = [&](double out3[3]) {
                for (int k = 0; k < 3; ++k) {
                    w->setTransTest(0, ds[k]);
                    // Between two beats of the preview's synthetic 120-BPM
                    // profile (beat phase 0.5): at t = 8.0 exactly the kick
                    // envelope is at its peak and falls by a third in one
                    // frame, which reads as "flicker" in every kick-coupled
                    // transition and says nothing about its speed.
                    w->setFixedTime(flickT);              QImage a = w->grabFramebuffer();
                    w->setFixedTime(flickT + 1.f / 30.f); QImage b = w->grabFramebuffer();
                    out3[k] = meanDiff(a, b);
                }
                w->setFixedTime(8.f);
            };

            FILE *out = outPath.isEmpty() ? stdout : std::fopen(qPrintable(outPath), "w");
            if (!out) out = stdout;
            std::fprintf(out, "name\ttv\tcore80\tpeak\tflick\tflash\tsteps\n");

            // Baseline: the scene's own motion as seen through a plain cross-fade.
            double base[3] = { 0.0, 0.0, 0.0 };
            w->setParamOverrides({});
            w->setCombineShader("Transitions/Crossfade.frag");
            clockFlicker(base);

            for (const Entry &e : *entries) {
                w->setParamOverrides(e.ov);
                w->setCombineShader("Transitions/" + e.file);
                w->setFixedTime(8.f);
                std::vector<double> st;
                QImage prev;
                double lumaA = 0.0, lumaB = 0.0, lumaMax = 0.0;
                for (int i = 0; i <= steps; ++i) {
                    w->setTransTest(0, float(i) / steps);
                    QImage f = w->grabFramebuffer();
                    const double l = meanLuma(f);
                    if (i == 0) lumaA = l;
                    if (i == steps) lumaB = l;
                    lumaMax = std::max(lumaMax, l);
                    if (i > 0) st.push_back(meanDiff(f, prev));
                    prev = f;
                }
                double tv = 0.0, mx = 0.0;
                for (double v : st) { tv += v; mx = std::max(mx, v); }
                // Shortest contiguous window carrying 80 % of the total.
                int best = steps;
                for (int a = 0; a < steps; ++a) {
                    double s = 0.0;
                    for (int b = a; b < steps; ++b) {
                        s += st[b];
                        if (s >= 0.8 * tv) { best = std::min(best, b - a + 1); break; }
                    }
                }
                double fl[3];
                clockFlicker(fl);
                double flick = 0.0;
                for (int k = 0; k < 3; ++k) flick = std::max(flick, fl[k] - base[k]);
                QString list;
                for (size_t i = 0; i < st.size(); ++i)
                    list += (i ? "," : "") + QString::number(st[i], 'f', 3);
                std::fprintf(out, "%s\t%.2f\t%.3f\t%.3f\t%.2f\t%.1f\t%s\n",
                             qPrintable(e.file), tv, tv > 0.05 ? double(best) / steps : 1.0,
                             tv > 0.05 ? mx / tv : 0.0, flick,
                             lumaMax - std::max(lumaA, lumaB), qPrintable(list));
                std::fflush(out);
            }
            if (out != stdout) std::fclose(out);
            std::fprintf(stderr, "TRANSPROFILE: %d transition(s)\n", int(entries->size()));
            qApp->exit(0);
        });
        return app.exec();
    }

    // Default mode: none of the headless CLI flags matched above, so launch
    // the normal windowed editor.
    EditorWindow win(root);
    win.show();
    return app.exec();
}

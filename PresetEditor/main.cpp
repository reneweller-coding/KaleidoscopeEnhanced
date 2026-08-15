// PresetEditor — a standalone editor for the visualizer's preset XMLs, with a
// live preview of each texture/combine shader.  Independent of the main app.
//
// Usage:
//   PresetEditor.exe                         launch the editor GUI
//   PresetEditor.exe --roundtrip in.xml out.xml   headless load+save (self-test)
//   PresetEditor.exe --render tex.frag comb.frag out.png [W H]   grab one preview
//   PresetEditor.exe --transcheck            verify all 28 transition styles:
//                                            exact A at d=0 / exact B at d=1 and
//                                            no temporal jumps across the sweep
#include <QtWidgets/QApplication>
#include <QtGui/QSurfaceFormat>
#include <QtGui/QImage>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QTimer>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <vector>
#include <algorithm>

#include "EditorWindow.h"
#include "PreviewWidget.h"
#include "Preset.h"

// Find the project root (the folder holding standard.vert + Configurations) by
// searching up from the exe dir and the current dir.  Keeps the editor working
// whether it's run from its own out-dir, the project root, or Release\.
static QString findRoot()
{
    QStringList cands;
    QDir a(QCoreApplication::applicationDirPath());
    for (int i = 0; i < 6; ++i) { cands << a.absolutePath(); if (!a.cdUp()) break; }
    QDir c(QDir::currentPath());
    for (int i = 0; i < 6; ++i) { cands << c.absolutePath(); if (!c.cdUp()) break; }
    for (const QString &p : cands)
        if (QFileInfo::exists(p + "/standard.vert") &&
            QFileInfo::exists(p + "/Configurations"))
            return p;
    return QDir::currentPath();
}

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
    //   --validate                 checks every Configurations/*.xml (except
    //                               Komplett.xml itself)
    //   --validate <preset.xml>    checks just that one file
    if (args.value(0) == "--validate")
    {
        QCoreApplication app(argc, argv);
        const QString cfgDir = findRoot() + "/Configurations";
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
                    if (k.file == e.file && k.isCombine == e.isCombine) { ref = &k; break; }
                if (!ref) continue;   // not (or no longer) in Komplett.xml -- nothing to compare against
                for (const ShaderParam &kp : ref->params)
                {
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

    QSurfaceFormat fmt;
    fmt.setVersion(3, 3);
    fmt.setProfile(QSurfaceFormat::CoreProfile);
    fmt.setRenderableType(QSurfaceFormat::OpenGL);
    fmt.setSwapBehavior(QSurfaceFormat::DoubleBuffer);
    fmt.setDepthBufferSize(24);
    QSurfaceFormat::setDefaultFormat(fmt);

    QApplication app(argc, argv);
    const QString root = findRoot();

    // shader_setup.cpp / textfile.cpp resolve every path relative to the
    // process's CURRENT WORKING DIRECTORY, hard-coded in the "..\Blend\...",
    // "..\standard.vert", "..\Scene3D\..." style the whole engine's configs
    // already use.  The main app gets this for free because its exe lives one
    // level below root (Release\); PresetEditor.exe does not, and until a
    // scene3d shader was added, nothing in this app ever exercised a
    // CWD-relative path (PreviewWidget's own 2D loader resolves everything
    // against `root` explicitly).  Anchoring the CWD here, once, before any
    // shader ever loads, makes those same relative strings resolve correctly
    // regardless of where the exe was launched from.
    QDir::setCurrent( root + "/PresetEditor" );

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
    if (args.value(0) == "--render" && args.size() >= 4)
    {
        PreviewWidget *w = new PreviewWidget(root);
        const int W = args.value(4, "960").toInt();
        const int H = args.value(5, "600").toInt();
        auto flagValue = [&](const QString &flag) -> QString {
            int i = args.indexOf(flag);
            return (i >= 0 && i + 1 < args.size()) ? args[i + 1] : QString();
        };
        const QString geom = flagValue("--geom");
        if (!geom.isEmpty())
            w->setTextureShader(args[1], "scene3d", geom,
                                 flagValue("--stateBytes").toInt(),
                                 flagValue("--shadowExtent").toDouble());
        else
            w->setTextureShader(args[1]);
        w->setCombineShader(args[2]);
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

    // Transition test bench: sweep every CombinePlain style over d = 0..1 with
    // a PINNED clock (deterministic frames) and verify (a) endpoint identity —
    // exactly scene A at d=0, exactly scene B at d=1 — and (b) temporal
    // continuity: no single step may dwarf the style's own typical step.
    // This is exactly the harness that would have caught the corner leaks /
    // end snaps fixed in the diagonal/blinds/push/doors/pixelation styles.
    if (args.value(0) == "--transcheck")
    {
        PreviewWidget *w = new PreviewWidget(root);
        w->setTextureShader("Kaleidoscope.frag");
        w->setCombineShader("CombinePlain.frag");
        w->setFixedTime(8.f);
        w->resize(640, 400);
        w->show();
        QTimer::singleShot(800, [w]() {
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
            w->setTransTest(0, 0.f);  QImage refA = w->grabFramebuffer();
            w->setTransTest(0, 1.f);  QImage refB = w->grabFramebuffer();
            int fails = 0;
            fprintf(stderr, "TRANSCHECK  (endpoints <= 1.5/255; jump = maxStep/medianStep <= 6)\n");
            for (int s = 0; s <= 27; ++s) {
                QImage prev;
                std::vector<double> stepDiffs;
                double endA = 0.0, endB = 0.0, maxStep = 0.0;
                for (int i = 0; i <= steps; ++i) {
                    w->setTransTest(s, float(i) / steps);
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
                fprintf(stderr, "style %2d: endA %5.2f  endB %5.2f  maxStep %6.2f  jump %5.1fx  %s\n",
                        s, endA, endB, maxStep, jump, ok ? "OK" : "FAIL");
            }
            if (fails) fprintf(stderr, "TRANSCHECK: %d style(s) FAILED\n", fails);
            else       fprintf(stderr, "TRANSCHECK: all 28 styles OK\n");
            qApp->exit(fails ? 1 : 0);
        });
        return app.exec();
    }

    EditorWindow win(root);
    win.show();
    return app.exec();
}

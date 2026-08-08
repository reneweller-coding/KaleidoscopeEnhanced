// PresetEditor — a standalone editor for the visualizer's preset XMLs, with a
// live preview of each texture/combine shader.  Independent of the main app.
//
// Usage:
//   PresetEditor.exe                         launch the editor GUI
//   PresetEditor.exe --roundtrip in.xml out.xml   headless load+save (self-test)
//   PresetEditor.exe --render tex.frag comb.frag out.png [W H]   grab one preview
//   PresetEditor.exe --transcheck            verify all 26 transition styles:
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

    QSurfaceFormat fmt;
    fmt.setProfile(QSurfaceFormat::CompatibilityProfile);
    fmt.setRenderableType(QSurfaceFormat::OpenGL);
    fmt.setSwapBehavior(QSurfaceFormat::DoubleBuffer);
    fmt.setDepthBufferSize(24);
    QSurfaceFormat::setDefaultFormat(fmt);

    QApplication app(argc, argv);
    const QString root = findRoot();

    // Headless-ish preview grab: render one frame of a shader pair to a PNG.
    // Optional trailing arg "drone" switches the synthesized music profile.
    if (args.value(0) == "--render" && args.size() >= 4)
    {
        PreviewWidget *w = new PreviewWidget(root);
        const int W = args.value(4, "960").toInt();
        const int H = args.value(5, "600").toInt();
        w->setTextureShader(args[1]);
        w->setCombineShader(args[2]);
        if (args.contains("drone"))
            w->setMusicMode(PreviewWidget::Drone);
        w->resize(W ? W : 960, H ? H : 600);
        w->show();
        const QString out = args[3];
        QTimer::singleShot(1000, [w, out]() {
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
            for (int s = 0; s <= 25; ++s) {
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
            else       fprintf(stderr, "TRANSCHECK: all 26 styles OK\n");
            qApp->exit(fails ? 1 : 0);
        });
        return app.exec();
    }

    EditorWindow win(root);
    win.show();
    return app.exec();
}

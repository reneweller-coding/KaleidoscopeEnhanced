// PresetEditor — a standalone editor for the visualizer's preset XMLs, with a
// live preview of each texture/combine shader.  Independent of the main app.
//
// Usage:
//   PresetEditor.exe                         launch the editor GUI
//   PresetEditor.exe --roundtrip in.xml out.xml   headless load+save (self-test)
//   PresetEditor.exe --render tex.frag comb.frag out.png [W H]   grab one preview
#include <QtWidgets/QApplication>
#include <QtGui/QSurfaceFormat>
#include <QtGui/QImage>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <QtCore/QTimer>
#include <cstdio>

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
    if (args.value(0) == "--render" && args.size() >= 4)
    {
        PreviewWidget *w = new PreviewWidget(root);
        const int W = args.value(4, "960").toInt();
        const int H = args.value(5, "600").toInt();
        w->setTextureShader(args[1]);
        w->setCombineShader(args[2]);
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

    EditorWindow win(root);
    win.show();
    return app.exec();
}

# -*- coding: utf-8 -*-
"""PresetEditor --forge / --forgeload: the shader workshop process.

The app cannot compile a big shader without the NVIDIA driver stalling its
render thread (0.4-1.8 s, even from a second context).  A separate process can:
  PresetEditor.exe --forge <frag> <out.bin>
compiles <frag> with Engine/Fullscreen.vert, links it with
GL_PROGRAM_BINARY_RETRIEVABLE_HINT and writes the driver's program binary
("KFRG", format, bytes) to <out.bin> (via <out.bin>.tmp, renamed when complete;
<out.bin>.err with the log on failure).  The app loads such a binary with
glProgramBinary -- no compile on its side.
  PresetEditor.exe --forgeload <bin>
loads a binary in a fresh context and prints how long that took (a probe)."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
p = os.path.join(ROOT, "PresetEditor", "main.cpp")
s = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")
A = """    if (args.value(0) == "--compile")
    {"""
assert s.count(A) == 1
FORGE = r'''    // Shader workshop (the app's ShaderForge): compile + link in THIS process
    // and hand the app a program binary -- its own compile would stall its
    // render thread (see Source/ShaderForge.h).
    if ((args.value(0) == "--forge" && args.size() >= 3) || (args.value(0) == "--forgeload" && args.size() >= 2))
    {
        QOffscreenSurface surf;
        surf.setFormat(fmt);
        surf.create();
        QOpenGLContext ctx;
        ctx.setFormat(fmt);
        if (!ctx.create() || !ctx.makeCurrent(&surf))
        {
            fprintf(stderr, "FORGE: no GL context\n");
            return 2;
        }
        QOpenGLExtraFunctions *gl = ctx.extraFunctions();
        if (args.value(0) == "--forgeload")
        {
            QFile f(args[1]);
            if (!f.open(QIODevice::ReadOnly)) return 3;
            const QByteArray b = f.readAll();
            if (b.size() < 8 || !b.startsWith("KFRG")) return 4;
            GLenum format = 0;
            memcpy(&format, b.constData() + 4, 4);
            QElapsedTimer t; t.start();
            GLuint prog = gl->glCreateProgram();
            gl->glProgramBinary(prog, format, b.constData() + 8, GLsizei(b.size() - 8));
            GLint ok = 0; gl->glGetProgramiv(prog, GL_LINK_STATUS, &ok);
            fprintf(stderr, "FORGELOAD %s: %s in %.2f ms (%d bytes)\n", qPrintable(args[1]), ok ? "ok" : "FAILED",
                    t.nsecsElapsed() * 1e-6, int(b.size()));
            return ok ? 0 : 5;
        }
        const QString out = args[2];
        auto fail = [&](const QByteArray &why) {
            QFile e(out + ".err");
            if (e.open(QIODevice::WriteOnly)) e.write(why);
            fprintf(stderr, "FORGE FAIL %s\n%s\n", qPrintable(args[1]), why.constData());
            return 1;
        };
        auto readAll = [](const QString &path, QByteArray &o) {
            QFile f(path);
            if (!f.open(QIODevice::ReadOnly)) return false;
            o = f.readAll();
            return true;
        };
        QByteArray vs, fs;
        if (!readAll(root + "/Engine/Fullscreen.vert", vs)) return fail("cannot read Engine/Fullscreen.vert");
        if (!readAll(args[1], fs)) return fail("cannot read " + args[1].toLocal8Bit());
        auto compile = [&](GLenum type, const QByteArray &src, QByteArray *log) -> GLuint {
            GLuint sh = gl->glCreateShader(type);
            const char *ptr = src.constData();
            const GLint len = GLint(src.size());
            gl->glShaderSource(sh, 1, &ptr, &len);
            gl->glCompileShader(sh);
            GLint ok = 0; gl->glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
            if (!ok)
            {
                GLint n = 0; gl->glGetShaderiv(sh, GL_INFO_LOG_LENGTH, &n);
                QByteArray b(n > 1 ? n : 1, '\0');
                if (n > 1) gl->glGetShaderInfoLog(sh, n, nullptr, b.data());
                if (log) *log = b;
                gl->glDeleteShader(sh);
                return 0;
            }
            return sh;
        };
        QByteArray log;
        GLuint v = compile(GL_VERTEX_SHADER, vs, &log);
        if (!v) return fail("vertex: " + log);
        GLuint f = compile(GL_FRAGMENT_SHADER, fs, &log);
        if (!f) return fail(log);
        GLuint prog = gl->glCreateProgram();
        gl->glAttachShader(prog, v);
        gl->glAttachShader(prog, f);
        gl->glProgramParameteri(prog, GL_PROGRAM_BINARY_RETRIEVABLE_HINT, GL_TRUE);
        gl->glLinkProgram(prog);
        GLint ok = 0; gl->glGetProgramiv(prog, GL_LINK_STATUS, &ok);
        if (!ok)
        {
            GLint n = 0; gl->glGetProgramiv(prog, GL_INFO_LOG_LENGTH, &n);
            QByteArray b(n > 1 ? n : 1, '\0');
            if (n > 1) gl->glGetProgramInfoLog(prog, n, nullptr, b.data());
            return fail("link: " + b);
        }
        GLint len = 0; gl->glGetProgramiv(prog, GL_PROGRAM_BINARY_LENGTH, &len);
        if (len <= 0) return fail("no program binary");
        QByteArray bin(len, '\0');
        GLenum format = 0;
        gl->glGetProgramBinary(prog, len, &len, &format, bin.data());
        QFile o(out + ".tmp");
        if (!o.open(QIODevice::WriteOnly)) return fail("cannot write " + out.toLocal8Bit());
        o.write("KFRG", 4);
        o.write(reinterpret_cast<const char *>(&format), 4);
        o.write(bin.constData(), len);
        o.close();
        QFile::remove(out);
        if (!QFile::rename(out + ".tmp", out)) return fail("cannot rename to " + out.toLocal8Bit());
        return 0;
    }

'''
s = s.replace(A, FORGE + A, 1)
if "#include <QtCore/QElapsedTimer>" not in s:
    s = s.replace("#include <QtCore/QTimer>\n", "#include <QtCore/QTimer>\n#include <QtCore/QElapsedTimer>\n", 1)
if "#include <cstring>" not in s:
    s = s.replace("#include <cstdlib>\n", "#include <cstdlib>\n#include <cstring>\n", 1)
if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")

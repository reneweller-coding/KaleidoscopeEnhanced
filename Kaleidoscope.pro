# ---------------------------------------------------------------------------
# Kaleidoscope Enhanced — qmake project (Qt 6, Windows / MSVC).
#
# NOTE: the Visual Studio project (Kaleidoscope.vcxproj) is the PRIMARY build;
# this .pro mirrors it so the code can also be browsed and built from
# Qt Creator.  Runtime assets (Scene\ / Combine\ / Blend\ shaders,
# Configurations\ presets, standard.vert) are loaded from "..\" relative to
# the working directory — run the exe from a subdirectory of the repo root
# (e.g. Release\), exactly like the VS build does.
# ---------------------------------------------------------------------------

TEMPLATE = app
TARGET   = Kaleidoscope

QT      += core gui widgets opengl openglwidgets xml network
CONFIG  += c++17

DEFINES += _CRT_SECURE_NO_WARNINGS
msvc: QMAKE_CXXFLAGS += /Zc:__cplusplus /Zc:strictStrings-

INCLUDEPATH += . Source

# Windows system libraries: WASAPI/COM (ole32/oleaut32), MIDI + WAV preview
# (winmm), "now playing" via WinRT media session (WindowsApp), OpenGL.
LIBS += -lopengl32 -lglu32 -lole32 -loleaut32 -lwinmm -lWindowsApp

SOURCES += \
    Source/AudioAnalyzer.cpp \
    Source/Configuration.cpp \
    Source/EffectShader.cpp \
    Source/filterShader.cpp \
    Source/glcore.cpp \
    Source/glwidget.cpp \
    Source/main.cpp \
    Source/mesh.cpp \
    Source/MidiInput.cpp \
    Source/NowPlaying.cpp \
    Source/QMyWindow.cpp \
    Source/ExprEval.cpp \
    Source/Scene3DShader.cpp \
    Source/shader_setup.cpp \
    Source/SpoutIn.cpp \
    Source/SpoutOut.cpp \
    Source/textfile.cpp \
    Source/TextureEffectKaleidoscopeBase.cpp \
    Source/Uniform.cpp \
    Source/Utils.cpp \
    Source/Vector3D.cpp \
    Source/WebRemote.cpp \
    ThirdParty/SpoutGL/Spout.cpp \
    ThirdParty/SpoutGL/SpoutCopy.cpp \
    ThirdParty/SpoutGL/SpoutDirectX.cpp \
    ThirdParty/SpoutGL/SpoutFrameCount.cpp \
    ThirdParty/SpoutGL/SpoutGL.cpp \
    ThirdParty/SpoutGL/SpoutGLextensions.cpp \
    ThirdParty/SpoutGL/SpoutSenderNames.cpp \
    ThirdParty/SpoutGL/SpoutSharedMemory.cpp \
    ThirdParty/SpoutGL/SpoutUtils.cpp

HEADERS += \
    Source/AudioAnalyzer.h \
    Source/AudioFeatures.h \
    Source/Configuration.h \
    Source/EffectShader.h \
    Source/filterShader.h \
    Source/glcore.h \
    Source/glwidget.h \
    Source/mainwindow.h \
    Source/mesh.h \
    Source/MidiInput.h \
    Source/NowPlaying.h \
    Source/QMyWindow.h \
    Source/qt6compat.h \
    Source/ExprEval.h \
    Source/Scene3DShader.h \
    Source/shader_setup.h \
    Source/SpoutIn.h \
    Source/SpoutOut.h \
    Source/stdinc.h \
    Source/textfile.h \
    Source/TextureEffect.h \
    Source/TextureEffectKaleidoscopeBase.h \
    Source/Uniform.h \
    Source/Utils.h \
    Source/Vector3D.h \
    Source/Vector4D.h \
    Source/WebRemote.h

# Source/mainwindow.h is the COMMITTED uic output of this form (QMyWindow
# includes it directly); regenerate with:  uic Source/mainwindow.ui -o
# Source/mainwindow.h  (the VS build does this automatically).
DISTFILES += Source/mainwindow.ui

# Runtime-loaded assets — listed so they appear in the Qt Creator tree.
DISTFILES += \
    standard.vert \
    $$files(Scene/*.frag) \
    $$files(Scene3D/*.vert) \
    $$files(Scene3D/*.frag) \
    $$files(Combine/*.frag) \
    $$files(Blend/*.frag) \
    $$files(Blend/*.vert) \
    $$files(Configurations/*.xml)

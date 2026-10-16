# ---------------------------------------------------------------------------
# Kaleidoscope Enhanced — qmake project (Qt 6, Windows / MSVC).
#
# NOTE: the Visual Studio project (Kaleidoscope.vcxproj) is the PRIMARY build;
# this .pro mirrors it so the code can also be browsed and built from
# Qt Creator.  Runtime assets (Scene2D\ / FX\ / Engine\ shaders,
# Presets\ presets, standard.vert) are loaded from "..\" relative to
# the working directory — run the exe from a subdirectory of the repo root
# (e.g. Release\), exactly like the VS build does.
# ---------------------------------------------------------------------------

TEMPLATE = app
TARGET   = Kaleidoscope

QT      += core gui widgets opengl openglwidgets xml network multimedia
CONFIG  += c++17

DEFINES += _CRT_SECURE_NO_WARNINGS
msvc: QMAKE_CXXFLAGS += /Zc:__cplusplus /Zc:strictStrings-

INCLUDEPATH += . Source

# Windows system libraries: WASAPI/COM (ole32/oleaut32), MIDI + WAV preview
# (winmm), "now playing" via WinRT media session (WindowsApp), OpenGL.
LIBS += -lopengl32 -lglu32 -lole32 -loleaut32 -lwinmm -lWindowsApp

SOURCES += \
    Source/AudioAnalyzer.cpp \
    Source/AudioConditioner.cpp \
    Source/ComputeFX.cpp \
    Source/Configuration.cpp \
    Source/CueReceiver.cpp \
    Source/CueSelfTest.cpp \
    Source/EffectShader.cpp \
    Source/ExprEval.cpp \
    Source/glcore.cpp \
    Source/glwidget.cpp \
    Source/GpuSims.cpp \
    Source/main.cpp \
    Source/mesh.cpp \
    Source/MeshImport.cpp \
    Source/MidiInput.cpp \
    Source/NowPlaying.cpp \
    Source/OscSender.cpp \
    Source/QrCode.cpp \
    Source/OsdMenu.cpp \
    Source/PresentPass.cpp \
    Source/QMyWindow.cpp \
    Source/Recorder.cpp \
    Source/RenderPipeline.cpp \
    Source/Scene3DShader.cpp \
    Source/SceneScheduler.cpp \
    Source/ScoreCues.cpp \
    Source/shader_setup.cpp \
    Source/ShaderForge.cpp \
    Source/ShaderForgeMain.cpp \
    Source/ShaderWorker.cpp \
    Source/SpoutIn.cpp \
    Source/SpoutOut.cpp \
    Source/Strings.cpp \
    Source/textfile.cpp \
    Source/TextureEffectKaleidoscopeBase.cpp \
    Source/TrackMedia.cpp \
    Source/Uniform.cpp \
    Source/UpdateCheck.cpp \
    Source/Utils.cpp \
    Source/Vector3D.cpp \
    Source/VideoExport.cpp \
    Source/VideoIn.cpp \
    Source/VideoPiP.cpp \
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
    Source/AudioConditioner.h \
    Source/AudioFeatures.h \
    Source/CfxTypes.h \
    Source/ComputeFX.h \
    Source/Configuration.h \
    Source/coreclock.h \
    Source/CueReceiver.h \
    Source/EffectShader.h \
    Source/ExprEval.h \
    Source/glcore.h \
    Source/glwidget.h \
    Source/GpuSims.h \
    Source/LongRunVariety.h \
    Source/mainwindow.h \
    Source/mesh.h \
    Source/MeshImport.h \
    Source/MidiInput.h \
    Source/NowPlaying.h \
    Source/OscSender.h \
    Source/QrCode.h \
    Source/OsdMenu.h \
    Source/Platform.h \
    Source/PlatformQt.h \
    Source/PresentPass.h \
    Source/QMyWindow.h \
    Source/qt6compat.h \
    Source/Recorder.h \
    Source/RenderPipeline.h \
    Source/Scene3DShader.h \
    Source/SceneScheduler.h \
    Source/ScoreCues.h \
    Source/SettingsFile.h \
    Source/shader_setup.h \
    Source/ShaderForge.h \
    Source/ShaderForgeMain.h \
    Source/ShaderWorker.h \
    Source/SpoutIn.h \
    Source/SpoutOut.h \
    Source/stdinc.h \
    Source/Strings.h \
    Source/textfile.h \
    Source/TextureEffectKaleidoscopeBase.h \
    Source/TrackMedia.h \
    Source/Uniform.h \
    Source/UpdateCheck.h \
    Source/Utils.h \
    Source/Vector3D.h \
    Source/Vector4D.h \
    Source/Version.h \
    Source/VideoExport.h \
    Source/VideoIn.h \
    Source/VideoPiP.h \
    Source/WebRemote.h

# Source/mainwindow.h is the COMMITTED uic output of this form (QMyWindow
# includes it directly); regenerate with:  uic Source/mainwindow.ui -o
# Source/mainwindow.h  (the VS build does this automatically).
DISTFILES += Source/mainwindow.ui

# Runtime-loaded assets — listed so they appear in the Qt Creator tree.
DISTFILES += \
    standard.vert \
    $$files(Scene2D/*.frag) \
    $$files(Scene3D/*.vert) \
    $$files(Scene3D/*.frag) \
    $$files(FX/*.frag) \
    $$files(Engine/*.frag) \
    $$files(Engine/*.vert) \
    $$files(Engine/*.comp) \
    $$files(Presets/*.xml)

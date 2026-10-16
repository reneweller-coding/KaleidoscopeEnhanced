# -*- coding: utf-8 -*-
"""Descriptions written for the C++ parameters and return values whose comments had none.

Tools/cgvr_comments.py merges them into the comment blocks (with the parameter directions); the key is the
qualified name and argument list as Doxygen prints them.
"""

SUPPLEMENT = {
    # ---- Configuration, CueReceiver
    "CueReceiver::listening() const": { "return": "True if the socket is bound, false if binding failed or the port was 0." },

    # ---- EffectShader
    "EffectShader::plainFragment() const": {
        "return": "True for EffectShader itself; subclasses with their own program setup return false." },
    "EffectShader::usesProgress()": { "return": "True if the scene is staged, false otherwise." },
    "EffectShader::setClimaxIn(float secs)": {
        "params": { "secs": "Seconds from now at which progress should reach 0.95; below 1 s nothing changes." } },
    "EffectShader::usesSceneLod()": {
        "return": "True if the source calls textureLod on tex0 (read once, then cached)." },
    "EffectShader::walksWithMusic() const": { "return": "True while the walk is active." },
    "EffectShader::setMinFade(float s)": { "params": { "s": "Shortest fade in seconds; negative values count as 0." } },
    "EffectShader::classTasteKey(const char *knob, const std::string &cls)": {
        "return": "The key, e.g. \"chainAP/kaleidoscope\"." },
    "EffectShader::stepChainCam(const AudioFeatures &f)": {
        "params": { "f": "This frame's audio features (the flight speed and gaze follow them)." } },
    "EffectShader::specDefines(const float *x0, const float *x1, const bool *fading) const": {
        "params": { "x0": "Knob value shown per walk stage (indexed like kWalkKnob).",
                    "x1": "Knob value each fading stage fades to.",
                    "fading": "Whether each stage is fading." },
        "return": "\"#define SPEC_<stage>0 <branch>\" lines for both ends of every stage, or \"\" if the lab has no "
                  "@chainord table." },
    "EffectShader::bindProgram(GLuint prog)": { "params": { "prog": "The GL program to use from now on." } },
    "EffectShader::dropVariants(bool release)": {
        "params": { "release": "Also delete the variant programs (true), or only stop using them (false)." } },
    "EffectShader::geomProgram(const float *x0, const float *x1, const bool *fading)": {
        "params": { "x0": "Knob value shown per walk stage (indexed like kWalkKnob).",
                    "x1": "Knob value each fading stage fades to.",
                    "fading": "Whether each stage is fading." },
        "return": "The program, or 0 while it is being built or if the lab has no world stages." },
    "EffectShader::runChain3D(const AudioFeatures &f)": {
        "params": { "f": "This frame's audio features (the walk and the camera follow them)." } },
    "EffectShader::runChainPasses(const AudioFeatures &f)": {
        "params": { "f": "This frame's audio features (the walk follows them)." } },
    "EffectShader::chainWantsSS() const": { "return": "True if such a class is on screen or fading in." },
    "EffectShader::opensAt(int s, float x) const": {
        "params": { "s": "Walk stage, 0..3 for A..D.", "x": "Knob value 0..1." },
        "return": "True if the class at x has an opening, false otherwise or without an opening table." },
    "EffectShader::closedClass(int s, float x) const": {
        "params": { "s": "Walk stage, 0..3 for A..D.", "x": "Knob value 0..1." },
        "return": "A knob value for the nearest closed class, keeping x's sub-variant; x itself if there is none." },
    "EffectShader::classTaste(int s, float x) const": {
        "params": { "s": "Walk stage, 0..3 for A..D.", "x": "Knob value 0..1." },
        "return": "The weight, 1 if the class has none or the lab has no class table." },
    "EffectShader::stepChainWalk(const AudioFeatures &audio)": {
        "params": { "audio": "This frame's audio features; with live score cues their section and drop counts "
                             "replace the analyser's." } },
    "EffectShader::startWalk(int s, float target, float dur)": {
        "params": { "s": "Walk stage index (as kWalkKnob).", "target": "Knob value to fade to, clamped to 0..0.999.",
                    "dur": "Fade duration in seconds." } },

    # ---- GLwidget
    "GLwidget::fpsValue() const": { "return": "Frames per second, rounded." },
    "GLwidget::videoPipEnabled() const": { "return": "True if the music-video picture-in-picture is switched on." },
    "GLwidget::remoteSnapshot()": { "return": "The last JPEG of the output; empty until the first refresh." },
    "GLwidget::wheelEvent(QWheelEvent *e)": {
        "params": { "e": "The wheel turn; one notch of 120 units moves the menu by one row." } },
    "GLwidget::mouseDoubleClickEvent(QMouseEvent *e)": { "params": { "e": "The double click." } },
    "GLwidget::showSelectConfigurationsMenu(QPainter *painter)": {
        "params": { "painter": "Painter on the widget, active for this frame's overlay." } },
    "GLwidget::drawAudioMenu(QPainter *painter)": {
        "params": { "painter": "Painter on the widget, active for this frame's overlay." } },
    "GLwidget::audioMenuCount() const": { "return": "1 plus the number of devices the analyser enumerated." },
    "GLwidget::audioMenuMatches() const": { "return": "The matching rows, in list order." },

    # ---- ImageLoader, Mesh
    "ImageLoader::ImageLoader(RenderPipeline *shader)": {
        "params": { "shader": "The pipeline whose photo list this thread reads and whose next image it fills." } },
    "Mesh::loadTexture(QImage &qimg, GLuint &textureId, const char *filename)": {
        "params": { "textureId": "Receives the name of the new GL texture." } },

    # ---- OscSender
    "OscSender::enabled() const": { "return": "True if a port above 0 is set." },
    "OscSender::message(const char *address, const float *args, int n)": {
        "params": { "address": "OSC address, e.g. \"/kaleido/beat\".", "args": "The float arguments.",
                    "n": "Their number." },
        "return": "The encoded message." },
    "OscSender::messageStr(const char *address, const QByteArray &value)": {
        "params": { "address": "OSC address.", "value": "The string argument (UTF-8)." },
        "return": "The encoded message." },
    "OscSender::bundle(const QList< QByteArray > &messages)": {
        "params": { "messages": "Encoded messages, as message() and messageStr() build them." },
        "return": "The encoded bundle." },
    "OscSender::pad4(QByteArray &b)": { "params": { "b": "The blob, padded in place." } },
    "OscSender::send(const QByteArray &datagram)": {
        "params": { "datagram": "One encoded message or bundle, sent as it is." } },

    # ---- OsdMenu, PresentPass, Recorder
    "OsdMenu::setRootTitle(std::function< QString()> fn)": {
        "params": { "fn": "Returns the heading in the current language; called on every draw." } },
    "OsdMenu::valueText(const OsdItem &it) const": {
        "brief": "The value an item shows on the right of its row: on/off, the current choice, the slider value.",
        "params": { "it": "The item." },
        "return": "The text, empty for submenus and actions." },
    "PresentPass::targetFbo() const": {
        "brief": "The framebuffer the combine pass renders into when ready(); otherwise the caller renders straight "
                 "into its default framebuffer.",
        "return": "The intermediate framebuffer object." },
    "PresentPass::run(const Inputs &in)": {
        "brief": "Runs the whole present step: limiter, auto exposure, bloom and Present.frag at display resolution.",
        "params": { "in": "This frame's source texture, sizes, audio features and timing." } },
    "Recorder::captureFrame(int w, int h)": {
        "params": { "w": "Width of the read framebuffer in pixels.", "h": "Its height in pixels." } },
    "Recorder::captureReplayFrame(int w, int h)": {
        "params": { "w": "Width of the read framebuffer in pixels.", "h": "Its height in pixels." } },
    "Recorder::startVideoPipe(int w, int h)": {
        "params": { "w": "Video width in pixels, fixed for this recording.", "h": "Video height in pixels." } },
    "Recorder::ensureBlurTargets(int w, int h)": {
        "params": { "w": "Frame width in pixels.", "h": "Frame height in pixels." } },
    "Recorder::accumulateFrame(int w, int h)": {
        "params": { "w": "Frame width in pixels.", "h": "Frame height in pixels." } },
    "Recorder::resolveBlur(int w, int h)": {
        "params": { "w": "Frame width in pixels.", "h": "Frame height in pixels." } },

    # ---- RenderPipeline
    "RenderPipeline::setLyricsTexture(const void *rgba, int w, int h)": {
        "params": { "rgba": "Tightly packed RGBA8 pixels.", "w": "Image width in pixels.", "h": "Image height in pixels." } },
    "RenderPipeline::setArtistTexture(const void *rgba, int w, int h)": {
        "params": { "w": "Image width in pixels." } },
    "RenderPipeline::sceneTransitioning() const": { "return": "True while two scenes are blended." },
    "RenderPipeline::currentSceneMarked() const": { "return": "True if it is marked." },
    "RenderPipeline::markedCount() const": { "return": "The number of marked scenes." },
    "RenderPipeline::rememberCue(const QString &trackKey, double posSec)": {
        "params": { "trackKey": "Identity of the playing track (artist and title).",
                    "posSec": "Playback position in seconds; negative means unknown, and nothing is stored." } },
    "RenderPipeline::tickCues(const QString &trackKey, double posSec)": {
        "params": { "trackKey": "Identity of the playing track (artist and title).",
                    "posSec": "Playback position in seconds; negative means unknown." } },
    "RenderPipeline::sceneIndexByBase(const QString &base) const": {
        "params": { "base": "File name without directory and extension, as tasteBase() gives it." },
        "return": "The index, or -1 if no scene has that name." },
    "RenderPipeline::checkGLErrors(const char *label)": {
        "params": { "label": "Names the call site in the message." } },
    "RenderPipeline::setStereoDepth(float v)": { "params": { "v": "Disparity strength, clamped to 0..2." } },
    "RenderPipeline::setStereoMode(int m)": {
        "params": { "m": "0 off, 1 side by side, 2 top-bottom, 3 anaglyph; negative values count as 0." } },
    "RenderPipeline::checkFramebufferStatus()": {
        "return": "True if the framebuffer is complete or the check is off (KALEIDO_GL_DEBUG unset)." },

    # ---- Scene3DShader, SceneScheduler, ScoreCues, SetupWindow, TrackMedia, Uniform, UpdateCheck
    "Scene3DShader::plainFragment() const override": { "return": "Always false." },
    "Scene3DShader::applyAudioFeatures(const AudioFeatures &f)": {
        "params": { "f": "This frame's audio features." } },
    "SceneScheduler::actElapsedSec() const": {
        "brief": "How long the current effect has been solo (the skip-malus window, the status line).",
        "return": "Seconds since it went solo." },
    "SceneScheduler::absorbHitch(float secs)": { "params": { "secs": "Length of the hitch in seconds." } },
    "SceneScheduler::moodAccept(EffectShader *s) const": {
        "params": { "s": "The candidate scene." },
        "return": "True if the candidate is taken this time (the test draws a random number)." },
    "SceneScheduler::findTransition(const char *basename) const": {
        "brief": "Finds a registered transition by the base name of its fragment shader, e.g. \"TransWipe.frag\".",
        "params": { "basename": "File name without directory." },
        "return": "Its index in the transition list, or -1." },
    "ScoreCues::instance()": { "return": "The instance, created on first use." },
    "ScoreCues::accepted() const": { "return": "The number of accepted datagrams." },
    "ScoreCues::rejected() const": { "return": "The number of rejected datagrams." },
    "ScoreCueFile::instance()": { "return": "The instance, created on first use." },
    "ScoreCueFile::active() const": { "return": "True if at least one cue is loaded." },
    "SetupWindow::settingsPath()": { "return": "The path." },
    "TrackMedia::lyricsNominalTexWidth()": { "return": "The width in pixels." },
    "TrackMedia::parseSynced(const QString &lrc)": { "params": { "lrc": "The LRC text, one or more lines." } },
    "Uniform::getName() const": { "return": "The name as declared in the shader." },
    "UpdateCheck::compareVersions(const QString &a, const QString &b)": {
        "params": { "a": "First version, e.g. \"1.17.0\" or \"v1.17.0\".", "b": "Second version." } },

    # ---- Vector3D
    "Vector3D::Vector3D(const Vector3D &b)": { "brief": "Copy constructor.", "params": { "b": "The vector to copy." } },
    "Vector3D::Vector3D(const Vector4D &b)": {
        "brief": "Projects a homogeneous vector into 3D space (x, y and z divided by w).",
        "params": { "b": "The homogeneous vector; w must not be 0." } },
    "Vector3D::Vector3D(float X, float Y, float Z)": {
        "brief": "Initialises the vector with explicit coordinates.",
        "params": { "X": "The x coordinate.", "Y": "The y coordinate.", "Z": "The z coordinate." } },
    "Vector3D::Vector3D(float *xyz)": {
        "brief": "Initialises the vector from three consecutive floats.",
        "params": { "xyz": "Points to x, y and z." } },
    "Vector3D::operator[](int i) const": {
        "brief": "Reads a component.", "params": { "i": "0, 1 or 2 for x, y, z." }, "return": "The component." },
    "Vector3D::operator[](int i)": {
        "brief": "Gives write access to a component.", "params": { "i": "0, 1 or 2 for x, y, z." },
        "return": "A reference to the component." },
    "Vector3D::operator=(float t)": { "params": { "t": "The value of all three components." } },
    "Vector3D::operator=(const Vector3D &b)": { "params": { "b": "The vector to copy." } },
    "Vector3D::operator=(const Vector4D &b)": { "params": { "b": "The homogeneous vector; w must not be 0." } },
    "Vector3D::operator==(const Vector3D &b) const": {
        "params": { "b": "The other vector." }, "return": "True if all three components are equal." },
    "Vector3D::operator!=(const Vector3D &b) const": {
        "params": { "b": "The other vector." }, "return": "True if any component differs." },
    "Vector3D::operator+(const Vector3D &b) const": { "params": { "b": "The vector to add." }, "return": "The sum." },
    "Vector3D::operator-(const Vector3D &b) const": {
        "params": { "b": "The vector to subtract." }, "return": "The difference." },
    "Vector3D::operator-() const": { "return": "The negated vector." },
    "Vector3D::operator+=(const Vector3D &b)": { "params": { "b": "The vector to add." } },
    "Vector3D::operator-=(const Vector3D &b)": { "params": { "b": "The vector to subtract." } },
    "Vector3D::operator*(float r) const": { "params": { "r": "The scale factor." }, "return": "The scaled vector." },
    "Vector3D::operator*=(float r)": { "params": { "r": "The scale factor." } },
    "Vector3D::operator/(float r) const": {
        "params": { "r": "The divisor; must not be 0." }, "return": "The divided vector." },
    "Vector3D::operator/=(float r)": { "params": { "r": "The divisor; must not be 0." } },
    "Vector3D::operator^(const Vector3D &b) const": {
        "params": { "b": "The right-hand vector." }, "return": "This vector cross b." },
    "Vector3D::crossProd(const Vector3D &b) const": {
        "params": { "b": "The right-hand vector." }, "return": "This vector cross b." },
    "Vector3D::operator^=(const Vector3D &b)": { "params": { "b": "The right-hand vector." } },
    "Vector3D::operator*(const Vector3D &b) const": {
        "params": { "b": "The other vector." }, "return": "The dot product." },
    "Vector3D::scalarProd(const Vector3D &b) const": {
        "params": { "b": "The other vector." }, "return": "The dot product." },
    "Vector3D::angleRad(const Vector3D &b) const": {
        "params": { "b": "The other vector; both must have unit length." }, "return": "The angle in radians, 0..pi." },
    "Vector3D::angleDeg(const Vector3D &b) const": {
        "params": { "b": "The other vector; both must have unit length." }, "return": "The angle in degrees, 0..180." },
    "Vector3D::sqrLength() const": { "return": "x*x + y*y + z*z." },
    "Vector3D::length() const": { "return": "The Euclidean length." },
    "Vector3D::l1Norm() const": { "return": "|x| + |y| + |z|." },
    "Vector3D::indexOfGreatestElement() const": { "return": "0, 1 or 2: the component with the largest magnitude." },
    "Vector3D::greatestElement() const": { "return": "The component with the largest magnitude, with its sign." },
    "Vector3D::normalized() const": { "return": "The unit vector, or (0, 0, 1) for the zero vector." },
    "Vector3D::faceForward(const Vector3D &b)": { "params": { "b": "The reference direction." } },

    # ---- Vector4D
    "Vector4D::Vector4D(const Vector4D &b)": { "brief": "Copy constructor.", "params": { "b": "The vector to copy." } },
    "Vector4D::Vector4D(const Vector3D &b)": {
        "brief": "Lifts a 3D vector into homogeneous space (w = 1).", "params": { "b": "The 3D vector." } },
    "Vector4D::Vector4D(double X, double Y, double Z, double W)": {
        "brief": "Initialises the vector with explicit coordinates.",
        "params": { "X": "The x coordinate.", "Y": "The y coordinate.", "Z": "The z coordinate.",
                    "W": "The homogeneous coordinate." } },
    "Vector4D::Vector4D(double *xyzw)": {
        "brief": "Initialises the vector from four consecutive doubles.", "params": { "xyzw": "Points to x, y, z and w." } },
    "Vector4D::operator[](int i) const": {
        "brief": "Reads a component.", "params": { "i": "0..3 for x, y, z, w." }, "return": "The component." },
    "Vector4D::operator[](int i)": {
        "brief": "Gives write access to a component.", "params": { "i": "0..3 for x, y, z, w." },
        "return": "A reference to the component." },
    "Vector4D::operator=(const Vector4D &b)": { "params": { "b": "The vector to copy." } },
    "Vector4D::operator=(const Vector3D &b)": { "params": { "b": "The 3D vector (w becomes 1)." } },
    "Vector4D::cartesian() const": { "return": "(x/w, y/w, z/w, 1); w must not be 0." },
    "Vector4D::indexOfGreatestElement() const": { "return": "0, 1 or 2: the largest of x, y, z." },
    "Vector4D::greatestElement() const": { "return": "The largest of x, y, z." },
    "Vector4D::operator+(const Vector4D &b) const": { "params": { "b": "The vector to add." }, "return": "The sum." },
    "Vector4D::operator-(const Vector4D &b) const": {
        "params": { "b": "The vector to subtract." }, "return": "The difference." },
    "Vector4D::operator-() const": { "return": "The negated vector (w too)." },
    "Vector4D::operator+=(const Vector4D &b)": { "params": { "b": "The vector to add." } },
    "Vector4D::operator-=(const Vector4D &b)": { "params": { "b": "The vector to subtract." } },
    "Vector4D::operator*(double r) const": { "params": { "r": "The scale factor." }, "return": "The scaled vector." },
    "Vector4D::operator*=(double r)": { "params": { "r": "The scale factor." } },
    "Vector4D::operator/(double r) const": {
        "params": { "r": "The divisor; must not be 0." }, "return": "The divided vector." },
    "Vector4D::operator/=(double r)": { "params": { "r": "The divisor; must not be 0." } },
    "Vector4D::operator==(const Vector4D &b) const": {
        "params": { "b": "The other vector." }, "return": "True if all four components are equal." },
    "Vector4D::operator!=(const Vector4D &b) const": {
        "params": { "b": "The other vector." }, "return": "True if any component differs." },

    # ---- glcore
    "glcoreDummyTex2D()": { "return": "The texture name, created on first use (context current)." },
    "glcoreDummyTex2DArray()": {
        "return": "The texture name, created on first use; 0 if the driver has no glTexImage3D." },
    "glcoreDummyShadow()": { "return": "The texture name, created on first use (context current)." },
    "glcoreNameProgram(unsigned prog, const char *name)": {
        "params": { "prog": "The GL program; 0 is ignored.", "name": "Its shader file or cache key; NULL is ignored." } },
    "glcoreDebugProgramName(unsigned prog)": {
        "params": { "prog": "The GL program." }, "return": "The recorded name, or \"?\"." },
    "glcoreDebugMark(const char *station)": {
        "params": { "station": "A string literal the caller keeps alive; NULL resets to \"?\"." } },
    "glcoreEnableDebugOutput()": { "brief": "Installs the KHR_debug callback that prints every driver message with its "
                                            "station and program (context current)." },
    "glcGet(const char *name)": {
        "params": { "name": "Entry point name, e.g. \"glDispatchCompute\"." },
        "return": "The function pointer, or NULL if the driver lacks it." },
    "glcoreProc(const char *name)": {
        "params": { "name": "Entry point name, e.g. \"glMaxShaderCompilerThreadsKHR\"." },
        "return": "The function pointer, or NULL if the driver lacks it." },

    # ---- Platform, Strings, qt6compat
    "Platform::iCaseCmp(const char *a, const char *b)": {
        "params": { "a": "First string.", "b": "Second string." },
        "return": "Negative, 0 or positive as a sorts before, equal to or after b, ignoring ASCII case." },
    "Strings::setLanguage(LangE lang)": { "params": { "lang": "The language of every later lookup." } },
    "Strings::language()": { "return": "The current language." },
    "Strings::fromCode(const char *code)": {
        "params": { "code": "The ini value; NULL counts as \"de\"." }, "return": "LangE::EN for \"en\", else LangE::DE." },
    "Strings::toCode(LangE lang)": { "params": { "lang": "The language." }, "return": "\"en\" or \"de\"." },
    "Strings::uiText(StrIdE id)": { "params": { "id": "The string's id." } },
    "qrand()": { "return": "A random number in 0..RAND_MAX." },

    # ---- shader_setup
    "fullscreenVertShader()": { "return": "The shader object, compiled on first call (context current)." },
    "nowMs()": { "return": "Milliseconds of a steady clock." },
    "progKey(const char *tag, const char *a, const char *b, const char *c, const char *d, const char *e)": {
        "params": { "tag": "Which builder: \"FS\", \"FSV\", \"VF\", \"PL\" or \"CS\".", "a": "First source file (or NULL).",
                    "b": "Second source file or the variant's defines (or NULL).", "c": "Third source file (or NULL).",
                    "d": "Fourth source file (or NULL).", "e": "Fifth source file (or NULL)." },
        "return": "The tag and the five parts joined by '|'." },
    "cacheOff()": { "return": "True if KALEIDO_NO_SHADER_CACHE is set." },
    "progLookup(const std::string &key)": {
        "params": { "key": "The cache key (progKey())." },
        "return": "The cached program, now bound and with one more reference; 0 if absent or the cache is off." },
    "progStore(const std::string &key, GLuint prog)": {
        "params": { "key": "The cache key (progKey()).", "prog": "The program just built; 0 is not stored." },
        "return": "prog." },
    "parallelCompile()": {
        "brief": "Whether the driver compiles in the background (GL_KHR_parallel_shader_compile, or the ARB variant), "
                 "unless KALEIDO_NO_PARALLEL_COMPILE is set.",
        "return": "True if background builds are possible (the answer is cached)." },
    "collectPrebuild(const PrebuildJob &j)": {
        "params": { "j": "The finished build." }, "return": "The program if it linked, else 0 (logged)." },
    "shaderPrebuildPoll()": { "return": "The number of builds still running." },
    "shaderVariantStart(const char *frag_source, const std::string &defines)": {
        "params": { "frag_source": "The fragment shader file.",
                    "defines": "\"#define ...\" lines inserted after its #version line." },
        "return": "True if the variant is built, building or failed; false if there is no background compile." },
    "shaderVariantTake(const char *frag_source, const std::string &defines)": {
        "params": { "frag_source": "The fragment shader file.", "defines": "The variant's defines (as for the start)." },
        "return": "The program, or 0 while it is still building." },
    "shaderBuildFromText(const std::string &fragText)": {
        "params": { "fragText": "The complete fragment shader source." },
        "return": "The program, or 0 if it did not compile or link." },
    "shaderVariantFailed(const char *frag_source, const std::string &defines)": {
        "params": { "frag_source": "The fragment shader file.", "defines": "The variant's defines (as for the start)." },
        "return": "True if the build failed." },

    # ---- mesh, textfile, AudioAnalyzer, ComputeFX, CueSelfTest
    "Mesh::MaterialNode::MaterialNode(int texIdx)": {
        "params": { "texIdx": "Index of the material's texture in Mesh::m_textures, or -1 for none." } },
    "wr32(FILE *f, unsigned int v)": { "params": { "f": "The open file.", "v": "The value." } },
    "wr16(FILE *f, unsigned short v)": { "params": { "f": "The open file.", "v": "The value." } },
    "canvasSize(int outW, int outH, int &w, int &h)": {
        "params": { "outW": "Output width in pixels (its aspect is kept).", "outH": "Output height in pixels.",
                    "w": "Receives the canvas width (always CanvasW).",
                    "h": "Receives the canvas height, 360..1024 and a multiple of 16." } },
    "runCueSelfTest()": { "return": "0 when every check held, 1 otherwise (the process exit code)." },

    # ---- EditorWindow, EffectShader statics, RenderPipeline and sims helpers
    "rangeHowToText()": { "return": "The text, translated through EditorWindow::tr()." },
    "soloCap()": { "return": "KALEIDO_SOLO_SECS when set, else EffectShader::M_ReviewSolo." },
    "isStructure(int s)": {
        "brief": "Whether walk stage s is a structure stage (space, core, body) of the 3D labs.",
        "params": { "s": "Walk stage index (as kWalkKnob)." }, "return": "True for stages 5..7." },
    "fullscreenVAO()": { "return": "The vertex array object, created on first use (context current)." },
    "fbStatusOk()": { "return": "Always true." },
    "drawFullscreen()": { "brief": "Clears the bound framebuffer and draws the shared fullscreen triangle "
                                   "(gl_VertexID-based, no vertex buffer)." },
    "findRoot()": {
        "brief": "Locates the visualizer's root folder: the first of the executable's or the working directory's "
                 "parents that holds Presets/ (or the old Configurations/).",
        "return": "Its absolute path, or the working directory if none is found." },
    "main(int argc, char *argv[])": {
        "params": { "argc": "Number of command-line arguments.", "argv": "The arguments; argv[0] is the program." },
        "return": "The process exit code." },
    "wantedCodecFamily()": { "return": "\"h264\", \"hevc\" or \"av1\"." },
    "computeVideoCodecArgs()": {
        "return": "The ffmpeg arguments of the first encoder that works (\"-c:v\" and its options)." },
    "videoCodecArgs()": { "return": "The ffmpeg encoder arguments (see computeVideoCodecArgs())." },
    "warmVideoEncoderProbe()": {
        "brief": "Starts the encoder probe on a thread of its own now, so its answer is ready long before the mux "
                 "needs it." },
    "joinVideoEncoderProbe()": { "brief": "Joins the warm-up probe thread, if one was started." },
    "recordFps()": { "return": "30 or 60." },
    "settingsFilePath()": { "return": "The path, mapped to the platform's separators." },
    "tasteBase(const char *fragPath)": {
        "params": { "fragPath": "The fragment shader path; NULL gives \"?\"." }, "return": "The file name without directory." },
    "markKey(const char *fragPath)": {
        "params": { "fragPath": "The scene's fragment shader path." }, "return": "\"marked/<file name>\"." },
    "checkFbo()": { "return": "True if the bound framebuffer is complete." },
    "rand01()": { "return": "A value in 0..1." },
    "isMeshCalmFx(const char *fragPath)": {
        "params": { "fragPath": "The FX shader's path; NULL is not calm." },
        "return": "True if the FX is on the list of calm ones." },

    # ---- ShaderForge
    "shaderForgeInit()": { "return": "True if programs can be forged (helper and cache found)." },
    "shaderForgeAvailable()": {
        "brief": "Whether shaderForgeInit() found a helper and a cache directory.", "return": "True if it did." },
    "shaderForgeStartHelper()": { "brief": "Starts the helper process now (no-op if it runs or the forge is off)." },
    "shaderForgeIsCommand(int argc, char *argv[])": {
        "brief": "Whether the command line asks for the forge (--forge, --forgeload or --forge-serve).",
        "params": { "argc": "Number of command-line arguments.", "argv": "The arguments." },
        "return": "True for a forge command." },
    "shaderForgeMain(int argc, char *argv[])": {
        "params": { "argc": "Number of command-line arguments.", "argv": "The arguments; argv[1] is the forge command." },
        "return": "The process exit code: 0 on success, 2 for a usage error, 1 if the build failed." },

    # ---- ShaderWorker, main, Spout, media, update check
    "shaderWorkerUsable()": {
        "brief": "Whether the worker thread runs and shares objects with the context current on this thread.",
        "return": "True if programs it builds can be used here." },
    "parsecommandline(int argc, char *argv[])": {
        "params": { "argc": "Number of command-line arguments.", "argv": "The arguments; argv[0] is the program." } },
    "spoutInRelease()": { "brief": "Releases the Spout receiver and deletes its GL texture (no-op off Windows)." },
    "spoutOutRelease()": { "brief": "Releases the Spout sender (no-op off Windows)." },
    "md5Hex(const QString &s)": { "params": { "s": "The text (hashed as UTF-8)." }, "return": "32 lower-case hex digits." },
    "isTrustedDownloadHost(const QUrl &url)": {
        "params": { "url": "The download URL." },
        "return": "True for https on github.com, api.github.com or *.githubusercontent.com." },
    "videoInRelease()": { "brief": "Stops playback, deletes the player, sink, audio output and GL texture and resets "
                                   "all state." },
    "videoPipRelease()": { "brief": "Stops playback, deletes the player, sink, audio output and GL texture and resets "
                                    "all state." },
    "videoPipSetPlaying(bool playing)": { "params": { "playing": "True to play, false to pause." } },
    "jsonEscape(const QString &s)": { "params": { "s": "The text." }, "return": "The escaped text, without quotes." },
    "buildPage()": {
        "brief": "Builds the remote's web page from kPageTemplate in the current language, fresh for every GET \"/\", "
                 "so a language change in the setup tool reaches the phone at its next reload.",
        "return": "The page, UTF-8." },

    # ---- free functions of Vector3D / Vector4D
    "angleCot(const Vector3D &a, const Vector3D &b)": {
        "brief": "The cotangent of the angle between two vectors.",
        "params": { "a": "First vector.", "b": "Second vector; not parallel to a." },
        "return": "(a . b) / |a x b|." },
    "abs(const Vector3D &v)": {
        "brief": "The absolute value of a vector: its length.", "params": { "v": "The vector." }, "return": "|v|." },
    "operator*(float r, const Vector3D &v)": {
        "brief": "Scalar times vector, with the scalar first.",
        "params": { "r": "The scale factor.", "v": "The vector." }, "return": "The scaled vector." },
    "operator<<(std::ostream &s, const Vector3D &v)": {
        "brief": "Writes a vector to a stream as \"x y z\".",
        "params": { "s": "The stream.", "v": "The vector." }, "return": "The stream." },
    "operator>>(std::istream &s, Vector3D &v)": {
        "brief": "Reads a vector from a stream as three numbers.",
        "params": { "s": "The stream.", "v": "Receives the vector." }, "return": "The stream." },
    "componentMin(const Vector3D &a, const Vector3D &b)": {
        "brief": "The component-wise minimum of two vectors.",
        "params": { "a": "First vector.", "b": "Second vector." }, "return": "The minimum." },
    "componentMax(const Vector3D &a, const Vector3D &b)": {
        "brief": "The component-wise maximum of two vectors.",
        "params": { "a": "First vector.", "b": "Second vector." }, "return": "The maximum." },
    "componentMult(const Vector3D &a, const Vector3D &b)": {
        "brief": "The component-wise product of two vectors.",
        "params": { "a": "First vector.", "b": "Second vector." }, "return": "The product." },
    "componentSqrt(const Vector3D &a)": {
        "brief": "The component-wise square root of a vector.",
        "params": { "a": "The vector; no component may be negative." }, "return": "The square roots." },
    "operator<<(std::ostream &s, const Vector4D &v)": {
        "brief": "Writes a vector to a stream as \"x y z w\".",
        "params": { "s": "The stream.", "v": "The vector." }, "return": "The stream." },
    "operator>>(std::istream &s, Vector4D &v)": {
        "brief": "Reads a vector from a stream as four numbers.",
        "params": { "s": "The stream.", "v": "Receives the vector." }, "return": "The stream." },
    "operator*(double r, const Vector4D &v)": {
        "brief": "Scalar times vector, with the scalar first.",
        "params": { "r": "The scale factor.", "v": "The vector." }, "return": "The scaled vector." },

    # ---- inline setters whose description was a trailing comment
    "EditorWindow::isScene3D": { "params": { "fileName": "Bare file name of a scene shader, as listed in the texture combo." } },
    "EffectShader::setProbability": { "params": { "probability": "The new threshold." } },
    "EffectShader::setMoodFlags": {
        "params": { "f": "MoodFlagsE bits (MOOD_DARK, MOOD_BRIGHT, MOOD_CALM, MOOD_AGGRESSIVE), or-ed together." } },
    "GLwidget::setAutoConfigEnabled": { "params": { "on": "True switches auto-config-by-mood on, false off." } },
    "GLwidget::selectAudioDevice": { "params": { "index": "Menu index: 0 = default loopback, N = the Nth listed device." } },
    "RenderPipeline::setSceneFadeMin": { "params": { "secs": "Shortest scene fade in seconds." } },
    "RenderPipeline::adjustReactivity": { "params": { "d": "Signed step added to the current gain." } },
    "RenderPipeline::adjustTrails": { "params": { "d": "Signed step added to the current trail amount." } },
    "RenderPipeline::adjustMood": { "params": { "d": "Signed step added to the current strength." } },
    "RenderPipeline::adjustLatency": { "params": { "d": "Signed step in seconds added to the current lead." } },
    "RenderPipeline::adjustStereoDepth": { "params": { "d": "Signed step added to the current strength." } },
    "RenderPipeline::setLatency": { "params": { "v": "New lead in seconds." } },
    "RenderPipeline::setReactivity": { "params": { "v": "New gain." } },
    "RenderPipeline::setTrails": { "params": { "v": "New trail amount." } },
    "RenderPipeline::setMood": { "params": { "v": "New strength." } },
    "SceneScheduler::restart": { "params": { "tp": "The clock's reference point; receives the current time." } },
    "TrackMedia::startVideoDownload": { "params": { "videoId": "YouTube id of the chosen candidate (VideoCandidate::id)." } },
    "TrackMedia::scoreCandidate": {
        "params": { "c": "The candidate from the yt-dlp search.",
                    "artist": "Artist of the current track; a channel of that name scores higher.",
                    "targetDurationSec": "Real length of the track in seconds; candidates outside max(20 s, 15 %) of it "
                                         "are rejected." } },
    "shaderPrebuildReady": { "params": { "frag_source": "Path of the fragment shader." } },
    "Scene3DShader::setStateBytes": { "brief": "Sets the size of the persistent state buffer of a geom=\"indirect\" generator." },
    "Scene3DShader::setGenPassCount": { "brief": "Sets how many compute passes the generator runs per frame." },
    "Scene3DShader::setShadowExtent": { "brief": "Sets the half-width of this scene's shadow-map light box." },
    "Scene3DShader::setModelPath": { "brief": "Sets the mesh file a geom=\"mesh\" scene loads." },
    "Scene3DShader::setModelPath2": { "brief": "Sets the optional second mesh of a geom=\"mesh\" scene." },
    "Scene3DShader::setMeshInstances": { "brief": "Sets how many copies of the mesh one draw call renders." },
    "Scene3DShader::setEyeOffset": { "brief": "Sets the stereo eye offset for the next draw." },
    "Mesh::MaterialNode::setAmbientColor": { "params": { "r": "Red, 0..1.", "g": "Green, 0..1.", "b": "Blue, 0..1." } },
    "Mesh::MaterialNode::setDiffuseColor": { "params": { "r": "Red, 0..1.", "g": "Green, 0..1.", "b": "Blue, 0..1." } },
    "Mesh::MaterialNode::setSpecularColor": { "params": { "r": "Red, 0..1.", "g": "Green, 0..1.", "b": "Blue, 0..1." } },
}

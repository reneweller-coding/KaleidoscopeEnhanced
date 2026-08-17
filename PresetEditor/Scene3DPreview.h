// Scene3DPreview.h — renders ONE Scene3DShader for the editor's live preview,
// including the shadow-map and order-independent-transparency passes it may
// opt into.  This is what closes the gap PreviewWidget always had: it drew
// every shader through a trivial fullscreen-quad pipeline, so of the engine's
// Scene3D catalogue — real geometry, shadow maps, OIT, compute-driven
// persistent-state generators — none of it could be previewed correctly.
//
// VERIFIED: any scene3d shader with a SINGLE draw() per frame -- geom=points/
// cubes/ribbon/grid/quads/patches/scatter, and indirect/compute scenes with
// no shadow or OIT (CoralGrowth, FeatherStorm, PrismExplode all confirmed via
// --render, full shading including per-fragment discard).
//
// KNOWN LIMITATION, NOT YET ROOT-CAUSED: a scene that opts into the shadow map
// or OIT -- meaning Scene3DShader::draw() is called MORE than once per frame,
// with EffectShader::s_shadowPass / s_oitPass toggled between calls -- comes
// back with part or all of its geometry missing (confirmed on ShadowForest,
// PillarHall, CathedralGlass).  It is not a compile failure, not a missing
// per-activation parameter (both were real, separate bugs found and fixed
// while investigating this -- see the depth-test fix in renderShadowPass()
// and the addFloatRange/addIntRange mechanism), and not the shadow LOOKUP
// specifically returning the wrong value (a lookup-only bug would misshade
// geometry, not remove it).  Two different scenes showed two different
// SUBSETS of their geometry surviving (ShadowForest: trunks yes, floor no;
// PillarHall: floor-ish ground yes, pillars no), which does not fit a single
// simple hypothesis tried so far (vertex-count clamp, generation-skipped-on-
// the-second-pass, depth-test state).  Do not extend this file's multi-pass
// handling further without first designing a way to inspect the indirect
// command buffer's vertex count after each pass (glGetBufferSubData on
// cmd[0]) -- guessing blind from screenshots has hit diminishing returns.
//
// DELIBERATELY its own translation unit.  Scene3DShader draws through
// glcore.h, which #define-remaps every gl* call in the file that includes it
// onto a loaded function pointer.  PreviewWidget.cpp calls GL through Qt's
// QOpenGLFunctions instead — the only place in this codebase that does — and
// mixing the two in one file would silently rebind PreviewWidget's own
// already-working 2D calls onto glcore's pointers too, for a bug with no
// visible cause at the call site.  Keeping this class in a header with no GL
// types at all (GLuint appears as plain unsigned int) lets PreviewWidget.h
// include it without ever seeing glcore's macros.
#pragma once

#include <QtCore/QString>
#include "../Source/AudioFeatures.h"

class Scene3DShader;

class Scene3DPreview
{
public:
    Scene3DPreview();
    ~Scene3DPreview();

    // Load the glcore function pointers.  Needs a current GL context; call
    // once from initializeGL, before anything else here.  Safe to call again.
    bool ensureGL();

    // (Re)compile from a resolved Scene3D/<name>.frag.  Caller must have
    // already confirmed both <name>.frag and <name>.vert exist: shader_setup's
    // loader exit(1)s on a REQUIRED file that is missing, which is correct for
    // the shipped app (a missing shader is a packaging bug) and wrong here,
    // where the user may be mid-edit.  `log` receives the compiler/linker
    // output (empty on a clean compile); returns false only if nothing could
    // be built at all (bad path).
    bool setShader( const QString &fragPathRelative, const QString &geom,
                     int stateBytes, double shadowExtent, QString &log );
    void clear();
    bool active() const { return m_scene != nullptr; }

    // Register a per-activation <float>/<int> range the way Configuration.cpp
    // does for the shipped app, so the scene gets a randomised (or, min==max,
    // fixed) value for a preset-tunable uniform like camHP/densityP/glowP
    // instead of GLSL's own zero default -- which is not a cosmetic gap: for
    // several scenes a zeroed camera-height or extent parameter degenerates
    // the framing entirely rather than just looking under-tuned.  Call once
    // per param, right after setShader() succeeds (a fresh Scene3DShader has
    // no uniforms registered yet).
    void addFloatRange( const QString &name, float lo, float hi );
    void addIntRange( const QString &name, int lo, int hi );
    // Formula-layer entry (incl. audio-mapping overrides): forwarded into the
    // real EffectShader, so the preview evaluates it exactly like the host.
    void addExpr( const QString &name, const QString &formula );

    // Render one frame into an internally-owned depth-tested FBO sized w x h,
    // running the shadow pass first and the OIT pass after if the scene opted
    // into either.  tex0/tex1 are bound as the scene's sample images, exactly
    // as the main host binds them.  Returns the result via the out params:
    // the colour texture (bind unit 0 to sample it, same as any other effect
    // pass) and the depth texture (for a depth-reading combine's texDepth0).
    void render( int w, int h, float time, float interpolation,
                 const AudioFeatures &features,
                 unsigned tex0, unsigned tex1,
                 unsigned &outColorTex, unsigned &outDepthTex );

private:
    void ensureFbo( int w, int h );
    void updateLightMatrix( float t );
    bool ensureShadowMap();
    void renderShadowPass( float time, float interpolation, const AudioFeatures &features );
    bool ensureOitTargets( int w, int h );
    void renderOitPass( float time, float interpolation, const AudioFeatures &features );

    Scene3DShader *m_scene = nullptr;
    bool m_glReady = false;

    unsigned m_fbo = 0, m_colorTex = 0, m_depthTex = 0;
    int m_fboW = 0, m_fboH = 0;

    static const int kShadowSize = 2048;
    unsigned m_shadowFbo = 0, m_shadowTex = 0;

    unsigned m_oitFbo = 0, m_oitAccum = 0, m_oitReveal = 0, m_oitResolveProg = 0;
    int m_oitW = 0, m_oitH = 0;

    unsigned m_quadVao = 0, m_quadVbo = 0;   // local fullscreen quad (OIT resolve)
};

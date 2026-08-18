/**
 * @file Scene3DPreview.h
 * @brief Renders ONE Scene3DShader for the editor's live preview, including
 *        the shadow-map and order-independent-transparency passes it may opt
 *        into.
 *
 * This is what closes the gap PreviewWidget always had: it drew every shader
 * through a trivial fullscreen-quad pipeline, so of the engine's Scene3D
 * catalogue — real geometry, shadow maps, OIT, compute-driven
 * persistent-state generators — none of it could be previewed correctly.
 *
 * VERIFIED: any scene3d shader with a SINGLE draw() per frame -- geom=points/
 * cubes/ribbon/grid/quads/patches/scatter, and indirect/compute scenes with
 * no shadow or OIT (CoralGrowth, FeatherStorm, PrismExplode all confirmed via
 * --render, full shading including per-fragment discard).
 *
 * KNOWN LIMITATION, NOT YET ROOT-CAUSED: a scene that opts into the shadow map
 * or OIT -- meaning Scene3DShader::draw() is called MORE than once per frame,
 * with EffectShader::s_shadowPass / s_oitPass toggled between calls -- comes
 * back with part or all of its geometry missing (confirmed on ShadowForest,
 * PillarHall, CathedralGlass).  It is not a compile failure, not a missing
 * per-activation parameter (both were real, separate bugs found and fixed
 * while investigating this -- see the depth-test fix in renderShadowPass()
 * and the addFloatRange/addIntRange mechanism), and not the shadow LOOKUP
 * specifically returning the wrong value (a lookup-only bug would misshade
 * geometry, not remove it).  Two different scenes showed two different
 * SUBSETS of their geometry surviving (ShadowForest: trunks yes, floor no;
 * PillarHall: floor-ish ground yes, pillars no), which does not fit a single
 * simple hypothesis tried so far (vertex-count clamp, generation-skipped-on-
 * the-second-pass, depth-test state).  Do not extend this file's multi-pass
 * handling further without first designing a way to inspect the indirect
 * command buffer's vertex count after each pass (glGetBufferSubData on
 * cmd[0]) -- guessing blind from screenshots has hit diminishing returns.
 *
 * DELIBERATELY its own translation unit.  Scene3DShader draws through
 * glcore.h, which uses `#define` to remap every gl* call in the file that
 * includes it onto a loaded function pointer.  PreviewWidget.cpp calls GL through Qt's
 * QOpenGLFunctions instead — the only place in this codebase that does — and
 * mixing the two in one file would silently rebind PreviewWidget's own
 * already-working 2D calls onto glcore's pointers too, for a bug with no
 * visible cause at the call site.  Keeping this class in a header with no GL
 * types at all (GLuint appears as plain unsigned int) lets PreviewWidget.h
 * include it without ever seeing glcore's macros.
 */
#pragma once

#include <QtCore/QString>
#include "../Source/AudioFeatures.h"

class Scene3DShader;

/**
 * @brief Owns and renders a single real Scene3DShader for the editor's preview pane.
 *
 * Wraps the shared, Qt-free Scene3DShader rendering core (from Source/) so
 * PreviewWidget's scene3d texture-shader path gets the actual engine render
 * path — procedural geometry generation, per-activation uniform ranges, the
 * formula layer, and (when a scene opts in) a shadow map and an
 * order-independent-transparency pass — instead of a fullscreen-quad
 * approximation. Deliberately isolated in its own translation unit for the
 * glcore.h macro-collision reason explained above; PreviewWidget.h can
 * therefore include this header without ever seeing a raw GL type or macro.
 * Not copyable/movable (holds raw GL object names it destroys itself); one
 * instance is owned by PreviewWidget for the lifetime of the preview pane.
 */
class Scene3DPreview
{
public:
    /// Constructs an empty preview with no scene loaded and no GL resources allocated yet.
    Scene3DPreview();
    /// Frees every owned GL object (scene, FBOs, colour/depth/shadow/OIT textures, quad VAO/VBO).
    ~Scene3DPreview();

    /**
     * @brief Load the glcore GL 4.3 function pointers.
     *
     * Needs a current GL context; call once from initializeGL(), before
     * anything else here. Safe to call again (a no-op once already loaded).
     * @return True once the entry points are ready (or were already loaded); false if glcoreInit() failed.
     */
    bool ensureGL();

    /**
     * @brief (Re)compile from a resolved Scene3D/`<name>`.frag.
     *
     * Caller must have already confirmed both `<name>`.frag and `<name>`.vert
     * exist: shader_setup's loader exit(1)s on a REQUIRED file that is
     * missing, which is correct for the shipped app (a missing shader is a
     * packaging bug) and wrong here, where the user may be mid-edit.
     * @param fragPathRelative CWD-relative path to the .frag file (e.g. "..\\Scene3D\\Foo.frag").
     * @param geom Geometry kind the scene generates (points/cubes/ribbon/grid/quads/patches/scatter/...).
     * @param stateBytes Persistent-state buffer size in bytes for compute-driven generators (0 = none).
     * @param shadowExtent Shadow-map world-space half-extent; > 0 overrides the scene's own default.
     * @param log Receives the compiler/linker output (empty on a clean compile).
     * @return False only if nothing could be built at all (bad path); true otherwise, even if @p log holds compiler warnings/errors.
     */
    bool setShader( const QString &fragPathRelative, const QString &geom,
                     int stateBytes, double shadowExtent, QString &log );
    /// Destroys the currently owned Scene3DShader, if any (leaves every other GL resource — FBOs, shadow map, OIT targets — allocated for reuse).
    void clear();
    bool active() const { return m_scene != nullptr; }   ///< @return True while a scene is currently loaded (i.e. render() has something to draw).

    /**
     * @brief Register a per-activation `<float>` range the way Configuration.cpp does for the shipped app.
     *
     * Gives the scene a randomised (or, min==max, fixed) value for a
     * preset-tunable uniform like camHP/densityP/glowP instead of GLSL's own
     * zero default -- which is not a cosmetic gap: for several scenes a
     * zeroed camera-height or extent parameter degenerates the framing
     * entirely rather than just looking under-tuned. Call once per param,
     * right after setShader() succeeds (a fresh Scene3DShader has no
     * uniforms registered yet).
     * @param name Uniform name to register.
     * @param lo Minimum of the roll range.
     * @param hi Maximum of the roll range.
     */
    void addFloatRange( const QString &name, float lo, float hi );
    /**
     * @brief Register a per-activation `<int>` range; see addFloatRange() for the full rationale.
     * @param name Uniform name to register.
     * @param lo Minimum of the roll range.
     * @param hi Maximum of the roll range.
     */
    void addIntRange( const QString &name, int lo, int hi );
    /**
     * @brief Register a formula-layer entry (incl. audio-mapping overrides).
     *
     * Forwarded into the real EffectShader, so the preview evaluates it
     * exactly like the host.
     * @param name Uniform name the formula drives.
     * @param formula Formula-language source text (see Source/ExprEval.h).
     */
    void addExpr( const QString &name, const QString &formula );

    /**
     * @brief Render one frame of the loaded scene into an internally-owned depth-tested FBO.
     *
     * Runs the shadow pass first and the OIT pass after, if the scene opted
     * into either. tex0/tex1 are bound as the scene's sample images, exactly
     * as the main host binds them.
     * @param w Framebuffer width in pixels.
     * @param h Framebuffer height in pixels.
     * @param time Scene time in seconds (drives animation and the light-matrix sweep).
     * @param interpolation Cross-fade progress passed straight to Scene3DShader::setUniforms().
     * @param features Audio feature snapshot applied via Scene3DShader::applyAudioFeatures().
     * @param tex0 Sample-image texture bound on unit 0.
     * @param tex1 Sample-image texture bound on unit 1.
     * @param outColorTex Out: colour texture of the rendered frame (bind unit 0 to sample it, same as any other effect pass).
     * @param outDepthTex Out: depth texture of the rendered frame (for a depth-reading combine's texDepth0); both outputs are 0 when no scene is loaded.
     */
    void render( int w, int h, float time, float interpolation,
                 const AudioFeatures &features,
                 unsigned tex0, unsigned tex1,
                 unsigned &outColorTex, unsigned &outDepthTex );

private:
    /**
     * @brief (Re)allocate the main colour+depth FBO if @p w x @p h changed.
     * @param w Target framebuffer width in pixels.
     * @param h Target framebuffer height in pixels.
     */
    void ensureFbo( int w, int h );
    /**
     * @brief Recompute the sun-style directional light's view-projection matrix for time @p t.
     *
     * Ported from FilterShader::updateLightMatrix; writes the shared
     * EffectShader::s_lightDir / s_lightM statics the shadow pass and the
     * main draw both read.
     * @param t Scene time in seconds, driving the light's slow orbital sweep.
     */
    void updateLightMatrix( float t );
    /**
     * @brief Lazily allocate the shadow-map depth texture + FBO.
     * @return True once the shadow map is ready (or already was); false if the FBO came back incomplete.
     */
    bool ensureShadowMap();
    /**
     * @brief Render the scene's depth-only shadow pass into the shadow map.
     * @param time Scene time in seconds.
     * @param interpolation Cross-fade progress passed to Scene3DShader::setUniforms().
     * @param features Audio feature snapshot passed to Scene3DShader::applyAudioFeatures().
     */
    void renderShadowPass( float time, float interpolation, const AudioFeatures &features );
    /**
     * @brief Lazily allocate the OIT accumulation/revealage targets (and the resolve program) if @p w x @p h changed.
     * @param w Target framebuffer width in pixels.
     * @param h Target framebuffer height in pixels.
     * @return True once the OIT targets are ready; false if glBlendFunci/glDrawBuffers/glClearBufferfv are unavailable, or the FBO came back incomplete.
     */
    bool ensureOitTargets( int w, int h );
    /**
     * @brief Render the scene's transparent geometry into the OIT accumulation targets, then resolve/composite it back onto m_fbo.
     * @param time Scene time in seconds.
     * @param interpolation Cross-fade progress passed to Scene3DShader::setUniforms().
     * @param features Audio feature snapshot passed to Scene3DShader::applyAudioFeatures().
     */
    void renderOitPass( float time, float interpolation, const AudioFeatures &features );

    Scene3DShader *m_scene = nullptr;   ///< Currently loaded scene, owned; null until the first successful setShader().
    bool m_glReady = false;             ///< Whether ensureGL() has successfully loaded the glcore function pointers.

    unsigned m_fbo = 0, m_colorTex = 0, m_depthTex = 0;   ///< Main render target: FBO plus its colour and depth texture attachments.
    int m_fboW = 0, m_fboH = 0;   ///< Size m_fbo/m_colorTex/m_depthTex were last allocated at.

    static const int kShadowSize = 2048;   ///< Shadow-map texture width/height in texels.
    unsigned m_shadowFbo = 0, m_shadowTex = 0;   ///< Depth-only FBO and its depth texture, sampled with hardware PCF comparison.

    unsigned m_oitFbo = 0, m_oitAccum = 0, m_oitReveal = 0, m_oitResolveProg = 0;   ///< Order-independent-transparency targets (accumulation, revealage) and the resolve shader program that composites them.
    int m_oitW = 0, m_oitH = 0;   ///< Size m_oitFbo/m_oitAccum/m_oitReveal were last allocated at.

    unsigned m_quadVao = 0, m_quadVbo = 0;   // local fullscreen quad (OIT resolve)
};

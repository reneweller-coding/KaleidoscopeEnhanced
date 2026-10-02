/**
 * @file EffectShader.h
 * @brief Base class for every 2D texture-effect / FX-overlay shader: owns one compiled
 *        GLSL program, its uniform bindings, and the solo/interpolation timing state
 *        shared by all effect and kaleidoscope-family subclasses.
 */
#ifndef EFFECT_SHADER_H
#define EFFECT_SHADER_H

#include <QtGui/qopengl.h>
#include <string>
#include <map>
#include <array>
#include <chrono>
#include <random>
#include "stdinc.h"
#include "Uniform.h"
#include "AudioFeatures.h"
#include "ExprEval.h"

/**
 * @brief Common base for all 2D-plane (fullscreen-quad) effect shaders.
 *
 * Wraps exactly one compiled GLSL fragment/vertex program together with the
 * "randomised parameter" (Uniform) list that drives its per-activation variety,
 * the solo/interpolation timing state that decides how long an effect stays on
 * screen before the next one fades in, the per-frame audio-feature uniform
 * uploads (applyAudioFeatures), and an optional formula layer (addExpression)
 * that lets a preset script uniform values from live audio without touching
 * the shader source. Compilation is lazy: prepare() only records the render
 * size, and the actual GL program build happens on first use via
 * ensureCompiled(), so a preset with many shaders starts instantly instead of
 * blocking on dozens of compiles up front. Kaleidoscope/tunnel/FX-overlay
 * subclasses (TextureEffectKaleidoscopeBase, FxEffectKaleidoscope,
 * FxEffectMulti, ...) all derive from this class, chaining into its
 * initUniforms()/setUniforms()/resetParameters() to add their own uniform
 * locations and randomised parameters on top.
 */
class EffectShader
{
public:
	/**
	 * @brief Minimal default constructor.
	 *
	 * Only sets the vertex shader filename; the timing ranges (solo/interpolation),
	 * fragment shader filename and rolled m_timeSolo/m_timeInterpolation are left
	 * untouched (m_sh_prog_id is still zeroed via its in-class initializer). Rarely
	 * used directly - most call sites go through one of the parameterized
	 * constructors below.
	 */
	EffectShader();
	/**
	 * @brief Construct with solo/interpolation timing ranges but no fragment shader path.
	 *
	 * Used by subclasses that set m_fragmentShaderFilename themselves after the base
	 * constructor runs. Rolls the initial m_timeSolo/m_timeInterpolation via
	 * getInterpolatedTime() and sets m_complexity = 1, m_probability = 1.0.
	 * @param minTimeSolo Minimum seconds this effect stays solo (no interpolation) once activated.
	 * @param maxTimeSolo Maximum seconds this effect stays solo once activated.
	 * @param minTimeInterpolation Minimum seconds spent cross-fading into/out of this effect.
	 * @param maxTimeInterpolation Maximum seconds spent cross-fading into/out of this effect.
	 */
	EffectShader( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	/**
	 * @brief Construct with an explicit fragment shader file and timing ranges.
	 *
	 * Heap-allocates and copies @p filenameFragmentShader into m_fragmentShaderFilename
	 * (owned for the lifetime of the object; never freed, matching the other raw
	 * char* filename members in this class). Clears m_uniforms and rolls the initial
	 * m_timeSolo/m_timeInterpolation via getInterpolatedTime().
	 * @param filenameFragmentShader Path to the fragment shader source this effect compiles.
	 * @param minTimeSolo Minimum seconds this effect stays solo once activated.
	 * @param maxTimeSolo Maximum seconds this effect stays solo once activated.
	 * @param minTimeInterpolation Minimum seconds spent cross-fading into/out of this effect.
	 * @param maxTimeInterpolation Maximum seconds spent cross-fading into/out of this effect.
	 */
	EffectShader( const std::string &filenameFragmentShader, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	/// Destructor. Deletes the compiled shader program via cleanShaderPrograms().
	~EffectShader();


	//virtual void initUniforms(int width, int height) = 0; // initialize GLSL - shader programs
	//virtual void setUniforms( float time, float interpolation, GLint texPointUni1, GLint m_texPointUni2 ) = 0; // setting uniforms
	/**
	 * @brief Re-roll this effect's randomised parameters for its next activation.
	 *
	 * Re-rolls m_timeSolo/m_timeInterpolation, tells every registered Uniform to
	 * reset itself against a "life" budget of (solo + 2*interpolation) seconds, and
	 * draws fresh per-activation formula-layer seeds (m_exprSeeds). Subclasses
	 * override this to additionally re-roll their own extra parameters (speed,
	 * sides, power, ...), always chaining to EffectShader::resetParameters() first.
	 */
	virtual void resetParameters();
	/// Draws the effect's fullscreen quad. Base implementation just calls drawWindow().
	virtual void draw(); // draw scene
	/**
	 * @brief Activates this effect's shader program for rendering.
	 *
	 * Lazily compiles the program on first call via ensureCompiled(), then makes it
	 * current with glUseProgram().
	 */
	virtual void enableShader(); // draw scene

	/// Tells every registered Uniform to (re)start its interpolation timer/state.
	void startInterpolators();

	/// Deletes the compiled GL shader program (glDeleteProgram). Does not zero m_sh_prog_id.
	void cleanShaderPrograms();//delete shaders


	/**
	 * @brief Compiles the vertex+fragment shader and resolves all common uniform locations.
	 *
	 * The expensive step of the lazy-compile scheme: loads/compiles the program via
	 * setShaders(), resolves the shared uniforms (tex0, tex1, resolution, time,
	 * interpolation), then lets every registered Uniform resolve its own location.
	 * Subclasses override this to chain to the base implementation and then resolve
	 * their own extra uniform locations.
	 * @param width Render target width in pixels, stored in m_width.
	 * @param height Render target height in pixels, stored in m_height.
	 */
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs

	// ---- Lazy compilation ----
	// prepare() only records the render size (no GL); the expensive compile
	// runs on first use (ensureCompiled, called from enableShader) or during
	// the host's per-frame warm-up.  A 70-shader preset therefore starts
	// instantly instead of blocking for seconds.
	/**
	 * @brief Records the render target size without touching GL (front half of lazy compile).
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	void prepare( int width, int height ) { m_width = width; m_height = height; }
	/**
	 * @brief Compiles the shader program on first use; no-op if already compiled.
	 *
	 * Calls the (possibly overridden) initUniforms(), marks the program ready, and
	 * invalidates every "usesXxx" capability cache (m_usesSim, m_usesFluid, ...) so
	 * they get freshly re-queried against the newly compiled program.
	 */
	void ensureCompiled()
	{
		if( m_glReady ) return;
		initUniforms( m_width, m_height );   // virtual: derived locations too
		m_glReady = true;
		m_usesSim = m_usesFluid = m_usesSmoke3D = m_usesSSM = m_usesPhysarum = -1;
		m_usesSpectro = m_usesShadow = m_usesShadow2 = m_usesOit = m_usesBake = -1;
		m_usesMandelbrot = -1;
		m_usesSceneLod = -1;
	}
	/// @return The fragment shader file (for background builds).
	const char *fragmentFile() const { return m_compileFile ? m_compileFile : m_fragmentShaderFilename; }
	/// @brief True if this effect builds with plain setShaders() (fullscreen fragment only); background builds apply only to those.
	virtual bool plainFragment() const { return true; }
	/// @return True once ensureCompiled() has successfully built the GL program.
	bool isCompiled() const { return m_glReady; }

	// Hot-reload (dev aid): recompile this effect's fragment shader from disk.
	// Not-yet-compiled (lazy) programs are left alone — their eventual compile
	// reads the new source anyway.
	/**
	 * @brief Development aid: recompiles this effect's fragment shader from disk.
	 *
	 * Deletes the current program and forces ensureCompiled() to rebuild it. If the
	 * effect was never compiled yet (lazy), this is a no-op - its eventual first
	 * compile will read the updated source anyway.
	 */
	void reloadShader()
	{
		if( !m_glReady )
			return;
		// cleanShaderPrograms() now resets the ids and m_glReady itself, which is
		// what makes the following ensureCompiled() rebuild instead of returning.
		cleanShaderPrograms();
		ensureCompiled();
	}

	// Update the reported render-target resolution without recompiling the shader
	// or touching any GL objects.  Used on window resize.
	/**
	 * @brief Updates the reported render-target resolution without recompiling or touching GL.
	 * @param width New render target width in pixels.
	 * @param height New render target height in pixels.
	 */
	void setSize( int width, int height ) { m_width = width; m_height = height; }

	/**
	 * @brief Uploads the common per-frame uniforms (textures, resolution, time, interpolation)
	 *        and every registered randomised Uniform's current value.
	 *
	 * Also stores @p time into m_exprTime for the formula layer, and re-rolls
	 * m_timeSolo/m_timeInterpolation at the end of the call. Subclasses override this
	 * to chain to the base implementation and then upload their own extra uniforms.
	 * @param time Absolute animation time in seconds, uploaded as the `time` uniform.
	 * @param interpolation Current cross-fade weight, uploaded as the `interpolation` uniform.
	 * @param texLoc1 Texture unit bound to the `tex0` sampler.
	 * @param texLoc2 Texture unit bound to the `tex1` sampler.
	 */
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	/**
	 * @brief Checks glGetError() and prints any pending OpenGL error to stderr.
	 * @param label Short tag identifying the call site, included in the printed message.
	 */
	virtual void checkGLErrors( const char *label ); // check and print gl errors to stderr

	/**
	 * @brief Registers a randomised float Uniform with the given value range.
	 * @param name GLSL uniform name to bind once the program is compiled.
	 * @param minf Lower bound of the range the Uniform will roll values from.
	 * @param maxf Upper bound of the range the Uniform will roll values from.
	 */
	void addUniform( const std::string &name, float minf, float maxf );
	/**
	 * @brief Registers a randomised int Uniform with the given value range.
	 * @param name GLSL uniform name to bind once the program is compiled.
	 * @param minf Lower bound of the range the Uniform will roll values from.
	 * @param maxf Upper bound of the range the Uniform will roll values from.
	 */
	void addUniform( const std::string &name, int minf, int maxf );
	/**
	 * @brief Registers a randomised boolean Uniform activated with a given probability.
	 * @param name GLSL uniform name to bind once the program is compiled.
	 * @param pro Probability (0..1) that the Uniform rolls "true" on each reset.
	 */
	void addUniform( const std::string &name, float pro );

	// FORMULA LAYER (the MilkDrop lesson): attach a per-frame expression that
	// is evaluated against the live audio features and uploaded as the float
	// uniform `name` — presets can script mappings without shader edits.
	// Evaluated in applyAudioFeatures AFTER the random params, so a formula
	// deliberately overrides a <float> of the same name.
	/**
	 * @brief Attaches a per-frame scripted expression that drives a float uniform.
	 *
	 * Compiles @p formula into an ExprProgram and, if it compiles successfully,
	 * appends it to m_exprs; evaluated every frame in applyAudioFeatures() AFTER the
	 * random Uniform params, so a formula on the same uniform name deliberately
	 * overrides the corresponding `<float>` entry. Also re-rolls the three
	 * m_exprSeeds values available to formulas as seed1/seed2/seed3.
	 * @param name GLSL uniform name the compiled expression's result is uploaded to.
	 * @param formula Expression source text, evaluated against the ExprVars variable set.
	 */
	void addExpression( const std::string &name, const std::string &formula );

	/**
	 * @brief Uploads all audio-reactive uniforms (levels, onsets, spectrum, sim
	 *        samplers, shadow/OIT/depth state, formula-layer results, 2D camera rig)
	 *        that this shader's program declares.
	 *
	 * Called AFTER setUniforms() has run, while the shader program is still active.
	 *
	 * Motion is delivered as pre-integrated, continuous phase offsets
	 * (audioPhase / audioAdvance from RenderPipeline::paint) rather than by scaling
	 * the speed/speedTunnel uniforms.  Scaling those used to remap the whole
	 * time*speed phase per-frame and caused violent flicker; the base speeds are
	 * now left untouched so they advance smoothly.
	 *
	 * Shaders that don't declare a given audio uniform get location -1, so the
	 * corresponding upload is silently skipped.
	 *
	 * @param features Current frame's audio analysis snapshot.
	 */
	virtual void applyAudioFeatures(const AudioFeatures &features);

	// Fill the ExprVars variable array (ExprVars::V_COUNT floats) from an
	// AudioFeatures snapshot.  Shared by the formula layer in
	// applyAudioFeatures and by Scene3DShader::runGenerator's audio-override
	// pass, so a formula sees IDENTICAL variable semantics in both — two
	// copies of this mapping would drift, and a mapping that behaves
	// differently in the compute stage than in the fragment stage is the
	// kind of bug a screenshot can't explain.
	/**
	 * @brief Fills the ExprVars variable array from an AudioFeatures snapshot.
	 *
	 * Shared by the formula layer (applyAudioFeatures) and Scene3DShader's generator
	 * audio-override pass, so a formula sees IDENTICAL variable semantics in both -
	 * duplicating this mapping would risk the two paths silently drifting apart.
	 * @param f Audio analysis snapshot to read features from.
	 * @param timeVal Current animation time, written into ExprVars::V_TIME.
	 * @param seeds Three per-activation random seeds, written into V_SEED1..V_SEED3.
	 * @param out Destination array of at least ExprVars::V_COUNT floats.
	 */
	static void fillExprVars( const AudioFeatures &f, float timeVal,
	                          const float seeds[3], float *out );

	/**
	 * @brief Registers a randomised float Uniform whose min/max bounds themselves
	 *        interpolate between two ranges over time (BASE_TYPE_INTERPOLATOR_FLOAT).
	 * @param name GLSL uniform name to bind once the program is compiled.
	 * @param interpolatorMinMinf Lower bound of the range the interpolated minimum is drawn from.
	 * @param interpolatorMinMaxf Upper bound of the range the interpolated minimum is drawn from.
	 * @param interpolatorMaxMinf Lower bound of the range the interpolated maximum is drawn from.
	 * @param interpolatorMaxMaxf Upper bound of the range the interpolated maximum is drawn from.
	 */
	void addUniformInterpolator( const std::string &name, float interpolatorMinMinf,
							  float interpolatorMinMaxf,
							  float interpolatorMaxMinf,
							  float interpolatorMaxMaxf );

	/// @return The currently rolled solo duration (seconds) for this effect.
	unsigned int getTimeSolo();
	/// @return The currently rolled interpolation (cross-fade) duration (seconds) for this effect.
	unsigned int getTimeInterpolation();

	/** @brief Sets the visual-complexity weight used by preset selection. @param complexity Unitless weight (parsed from the config's complexity attribute). */
	void setComplexity( unsigned int complexity ) {m_complexity = complexity;}; ///< Sets the visual-complexity weight used by preset selection.
	unsigned int getComplexity() {return m_complexity;}; ///< Returns the visual-complexity weight used by preset selection.
	void setProbability( float probability ){ m_probability = probability; }; ///< Sets the probability threshold used by useShader().
	/// @return True with probability m_probability (Bernoulli draw); used to decide whether this effect activates.
	bool useShader();

	// True if this effect's fragment shader samples the reaction-diffusion field
	// (declares the "texSim" uniform).  Cached on first query.  Lets the host run
	// the GPU simulation only while an effect that displays it is on screen.
	/// @return True if this effect's compiled fragment shader declares the "texSim" (reaction-diffusion) sampler. Cached after first query; false if not yet compiled.
	bool usesSim();
	/** @brief True if this scene is STAGED: it reads `sceneProgress` or its rig formulas use `progress`. Before the first compile the answer comes from the source text (sourceUsesProgress()), after it from the program; both are cached. */
	bool usesProgress();
	bool sourceUsesProgress() const;
	/** @brief Re-time the progress ramp so progress reaches 0.95 in @p secs from now, continuously (no jump in the current value).
	 *  The origin used is #m_progressT0, NOT #m_activationTime, so `sceneTime` is untouched -- the 19 scenes that fly on it would cut otherwise. */
	void setClimaxIn( float secs );

	// Same for the fluid simulation ("texFluid" uniform, unit 8).
	/// @return True if this effect's compiled fragment shader declares the "texFluid" sampler (fluid simulation, unit 8). Cached after first query.
	bool usesFluid();

	// Same for the volumetric smoke/fire simulation ("texSmoke3D" uniform, unit 9).
	/// @return True if this effect's compiled fragment shader declares the "texSmoke3D" sampler (volumetric smoke/fire, unit 9). Cached after first query.
	bool usesSmoke3D();

	// Same for the self-similarity matrix ("texSSM" uniform, unit 10).
	/// @return True if this effect's compiled fragment shader declares the "texSSM" sampler (self-similarity matrix, unit 10). Cached after first query.
	bool usesSSM();
	/// @return True if this effect's compiled fragment shader declares the "texSpectro" sampler (scrolling spectrogram history). Cached after first query. Virtual so subclasses may special-case it.
	virtual bool usesSpectro();

	// Same for the Physarum trail map ("texPhysarum" uniform, unit 11).
	/// @return True if this effect's compiled fragment shader declares the "texPhysarum" sampler (Physarum trail map, unit 11). Cached after first query.
	bool usesPhysarum();
	// Bit k set = this shader declares kCfxInfo[k].sampler (compute-FX sims).
	/// @return Bitmask over CfxKind; bit k is set when this shader declares kCfxInfo[k]'s sampler uniform. Resolved (and each found sampler's texture unit bound) once per compiled program.
	unsigned int cfxMask();

	// The fragment-shader file this effect uses (for the debug overlay).
	/// @return The fragment shader filename this effect compiles from, or "?" if none is set. Used by the debug overlay.
	const char* fragmentName() const { return m_fragmentShaderFilename ? m_fragmentShaderFilename : "?"; }

	// True for REAL 3D scenes (Scene3DShader): geometry + perspective camera.
	// The host uses this for the true-stereo path (per-eye rendering).
	/// @return False for this base class / all 2D effects; overridden to return true only by real 3D scenes (Scene3DShader) so the host can select the per-eye stereo render path.
	virtual bool is3D() const { return false; }
	/** @brief Whether this scene shows a loaded model -- a single recognisable
	 *  solid object rather than an abstract field.
	 *
	 *  The host damps the time echo for these. That echo screen-blends the
	 *  frame from ~1.4 s ago at 4.5 % larger scale, which on an abstract scene
	 *  reads as a dreamy after-image and on a solid object reads as a
	 *  rendering fault: a chrome torus does not have a bigger, half-transparent
	 *  twin, so the eye files it as a defect rather than an effect.
	 *  @return false for everything except a GEOM_MESH Scene3DShader. */
	virtual bool isMeshScene() const { return false; }

	/** @name Asynchronous mesh warm-up
	 *  A GEOM_MESH scene's first activation used to load its model
	 *  synchronously on the render thread -- measured at 200-700 ms per model
	 *  (see the MESHLOAD log line), felt as the early-minutes stutter. The
	 *  host asks these two hooks instead: while the incoming scene of a fade
	 *  reports meshWarmupPending(), the host requests the warm-up (a worker
	 *  thread does the file/decode work) and holds the fade clock at its
	 *  start, so the outgoing scene simply keeps playing until the model is
	 *  ready and the fade then runs in full. Non-mesh shaders never pend.
	 *  @{ */
	/** @brief Whether this scene still needs its model loaded before it can be faded in.
	 *  @return Always false here; a GEOM_MESH Scene3DShader returns true until the worker has published its assets. */
	virtual bool meshWarmupPending() const { return false; }
	/** @brief Kicks off the asynchronous model load (file read/decode on a worker thread). No-op here; idempotent for mesh scenes, so the host may call it every frame while meshWarmupPending() holds. */
	virtual void requestMeshWarmup() {}
	/** @brief GL half of a finished warm-up: if the worker has published this
	 *  scene's assets and the VBO is still unbuilt, upload now (a few ms).
	 *  @return True if an upload happened -- the caller counts it as this
	 *  frame's one warm-up step. */
	virtual bool finishMeshWarmup() { return false; }

	/**
	 * @brief Does this effect currently hold an uploaded mesh (vertex buffer plus material textures)?
	 * @return True only for a mesh scene whose GL residency can be given back; false for every other kind.
	 */
	virtual bool meshResident() const { return false; }
	/**
	 * @brief Frees this effect's uploaded mesh so the memory goes back to the driver.
	 *
	 * The scene reloads asynchronously the next time it is drawn. The caller must
	 * make sure the scene is neither on screen nor fading in.
	 */
	virtual void releaseMesh() {}
	/** @} */

	// The 3D projection's clip planes, shared so a depth-reading effect can
	// linearise what it samples.  They live here rather than in Scene3DShader
	// because the CONSUMER is the combine stage, which knows nothing about
	// scenes — and a copy of these numbers that drifts out of step with the
	// projection would silently distort every depth-based effect.
	static constexpr float kSceneNear = 0.5f; ///< Shared 3D projection near clip plane, for linearising sampled depth in a combine-stage effect.
	static constexpr float kSceneFar  = 220.f; ///< Shared 3D projection far clip plane, for linearising sampled depth in a combine-stage effect.
	// tan(55 degrees / 2).  Together with near/far and the aspect this is
	// everything needed to rebuild a view-space position from a depth sample,
	// which is what separates real screen-space occlusion from a fake one.
	static constexpr float kSceneTanHalfFovY = 0.52056705f; ///< tan(55 deg / 2); with near/far and aspect, enough to reconstruct a view-space position from a depth sample.

	// Whether each texture-effect FBO's depth attachment holds real geometry
	// this frame (set by RenderPipeline; [0] = tex0's scene, [1] = tex1's).
	static float s_depthValid[2]; ///< Per-slot (tex0/tex1) flag: whether that FBO's depth attachment holds real 3D geometry this frame. Set by RenderPipeline.

	// ---- shadow mapping ----
	// A scene cannot simply be re-projected by the engine: every scene places
	// its OWN camera before applying projM, so substituting a light matrix for
	// projM would light the scene from a direction that ignores that placement.
	// The depth pass is therefore a CONTRACT the scene opts into: while
	// shadowPass is 1 it must project its world position with lightM instead,
	// and its fragment shader must return immediately.
	//
	// lightM covers a fixed 2*kShadowExtent cube at the origin.  A scene that
	// wants shadows keeps its geometry inside it — an automatically fitted box
	// would have to be refitted every frame from bounds the host never sees.
	// Default half-width of the light's box; a scene overrides it with the
	// shadowExtent attribute when its own scale differs.
	static constexpr float kShadowExtent = 60.f; ///< Default half-width of the light's shadow box (a scene may override via shadowExtent()).
	/// @return The half-width of the shadow light's box for this scene; default is kShadowExtent, overridden by scenes whose own scale differs.
	virtual float shadowExtent() const { return kShadowExtent; }
	/// Review span in seconds while a Test* preset is loaded, 0 outside it.
	/// sceneProgress normalises over the ROLLED solo span, which review mode
	/// then caps its display time below -- so a staged scene only ever showed
	/// the first third of its arc on the very bench meant to judge it.
	/// SceneScheduler::setReviewMode() owns this value.
	static float s_reviewSolo;
	/// True in the app (main.cpp): chain labs with Engine/ChainPass/Final_NAME.frag run as passes; the editor keeps the uber-shaders.
	static bool s_chainRunner;
	/// The 2D chain runner's resolution relative to the frame (ini "chainScale", 0.5..1; KALEIDO_CHAIN_SCALE):
	/// below 1 the chain passes run on a coarser grid and the lab's last pass reads them bilinearly (not across seams).
	static float s_chainScale;
	/// KALEIDO_FREEZE_TIME (set by RenderPipeline): the scene time every effect shows in a comparison run; < 0: off.
	static float s_freezeTime;
	/// The host's VJ freeze this frame (set by RenderPipeline): the chain walk and the 3D chains' flight stand still.
	static bool s_frozen;
	static float s_shadowExtent;      ///< The ACTIVE scene's shadowExtent() (world units, half-width of the light box), published by RenderPipeline so the shadow receivers and the light matrix use the same box.
	static float s_shadowPass;        ///< 1 during light 1's depth-only pass, 0 otherwise; uploaded as the `shadowPass` uniform.
	static float s_lightM[16];        ///< Light 1's view-projection matrix, column-major; uploaded as `lightM`, recomputed per frame by RenderPipeline::updateLightMatrix().
	static float s_lightDir[3];       ///< Light 1's direction (unit vector towards the light); uploaded as `lightDir`.
	/// @return True if this effect's compiled fragment shader declares the "texShadow" sampler (shadow map). Cached after first query.
	bool usesShadow();

	// ---- second, independent shadow-casting light ("studio" two-light setup) ----
	// Same contract as the light above, entirely separate state: a scene opts
	// in by ALSO declaring "texShadow2" (lookup) and, in its .vert, an extra
	// "if (shadowPass2 > 0.5) gl_Position = lightM2 * ..." branch (its OWN
	// depth-only projection) alongside the existing shadowPass branch -- the
	// host cannot add that branch for a scene, since the depth pass IS the
	// scene's own vertex shader running with a different matrix bound. Reuses
	// shadowExtent/shadowTexel (same box, same map resolution as light 1).
	static float s_shadowPass2;       ///< 1 during light 2's depth-only pass (kept separate from s_shadowPass so a shader's .vert can tell which matrix to project with).
	static float s_lightM2[16];       ///< Light 2's view-projection, column-major.
	static float s_lightDir2[3];      ///< Light 2's direction.
	/// @return True if this effect's compiled fragment shader declares the "texShadow2" sampler (second shadow map). Cached after first query.
	bool usesShadow2();

	// ---- order-independent transparency ----
	// Same shape of contract as the shadow pass.  oitPass is 0 for the scene's
	// opaque geometry and 1 for its transparent geometry, which is drawn into
	// an accumulation target instead of the frame.
	static float s_oitPass; ///< 0 while rendering opaque geometry, 1 while rendering transparent geometry into the OIT accumulation target.
	/// @return True if this effect's compiled fragment shader declares the "oitPass" uniform (order-independent transparency). Cached after first query.
	bool usesOit();

	// ---- per-scene baked field (X.comp companion, opt-in) ----
	// Unlike ComputeFX's shared, fixed-algorithm simulations (texFlame,
	// texParticles, ...) this is SCENE-OWNED: a 2D effect that ships its own
	// "X.comp" next to "X.frag" gets it compiled and dispatched automatically,
	// writing whatever it wants into a per-instance 3D texture the fragment
	// shader reads back as "texBake" (unit 33) -- e.g. a raymarcher pre-baking
	// its distance field so the per-pixel march samples a texture instead of
	// live-evaluating an expensive SDF at every step. Re-baked periodically
	// (not every frame, see kBakeIntervalFrames) rather than once, so slowly
	// audio-morphing parameters stay visibly reactive without paying the bake
	// cost 60 times a second.
	/// @return True if this effect's compiled fragment shader declares the "texBake" sampler. Cached after first query.
	bool usesBake();
	/// @return True if this effect's compiled fragment shader declares the "texMandelbrot" sampler. Cached after first query; see ComputeFX::stepMandelbrot() for why this bypasses the generic cfxMask() system.
	bool usesMandelbrot();
	/**
	 * @brief True if this effect samples its input image at explicit mip levels (`textureLod(tex0` in its source).
	 *
	 * For an overlay/FX shader the input is the finished scene frame, which has no
	 * mip chain of its own; RenderPipeline::renderOverlayPass() builds one only
	 * while an FX that asks for it is on screen (FxChain: a rolled transform chain
	 * squeezes the frame and shimmers without mips).  Read from the source file
	 * once and cached; reset on recompile.
	 */
	bool usesSceneLod();
	/**
	 * @brief Sets the colour grades this entry may wear: the preset attribute grade="fade,grey,sepia".
	 *
	 * One of them is rolled per activation (resetParameters()) and applied to the
	 * finished frame by Present.frag -- how a colourful scene takes its place in a
	 * dark preset such as Noir.  Unknown words are ignored; an empty list means no grade.
	 * @param list Comma-separated grade names (fade, grey, sepia).
	 */
	void setGradeModes( const std::string &list );
	/// @return The grade rolled for the current activation: 0 none, 1 faded, 2 grey, 3 sepia.
	int gradeMode() const { return m_gradeMode; }
	/**
	 * @brief True while this effect is a chain lab walking with the music (see stepChainWalk()).
	 *
	 * The scheduler then leaves the music's cues to the effect: a section change
	 * or a drop walks the chain on instead of cutting to another scene, so one lab
	 * can carry a whole set.
	 */
	bool walksWithMusic() const { return m_walk.active; }
	/**
	 * @brief The chain lab's current chain in words, one line per stage, for the shader-info overlay (key v).
	 *
	 * Reads the "// @chainclasses <knob> name|name|..." lines the generator writes
	 * into every chain lab (Tools/scenegen/chain_classes.py -- the classes in the
	 * shader's energy order) and names what each stage shows now: the rolled knob,
	 * or, while the lab walks, the shown class and the one it fades to with the
	 * fade's progress.  Frozen likes (ChainLike*) have constants instead of knobs;
	 * those are read from the source.  Empty for every other shader.
	 * @return Lines separated by '\n', or an empty string.
	 */
	std::string chainInfo();

	// ---- Song-structure memory ----
	// Snapshot / restore of all rolled per-activation parameter values, so a
	// recognised section (chorus #2 = chorus #1) replays the exact same look.
	/**
	 * @brief Captures the current value of every registered Uniform.
	 *
	 * Used for song-structure memory: snapshotting a recognised section (e.g. chorus
	 * #1) lets a later matching section (chorus #2) restore the exact same rolled look.
	 * @return One float per Uniform in m_uniforms, in registration order.
	 */
	std::vector<float> snapshotParameters() const
	{
		std::vector<float> v;
		v.reserve(m_uniforms.size());
		for (const Uniform *u : m_uniforms) v.push_back(u->snapshotValue());
		return v;
	}
	/**
	 * @brief Restores every registered Uniform's value from a prior snapshotParameters() call.
	 * @param v Snapshot values, applied in registration order; extra/missing entries are ignored.
	 */
	void restoreParameters(const std::vector<float> &v)
	{
		for (size_t i = 0; i < m_uniforms.size() && i < v.size(); ++i)
			m_uniforms[i]->restoreValue(v[i]);
	}
	/**
	 * @brief The rolled value of every registered Uniform together with its name.
	 *
	 * Used to remember a liked roll (key 'f'): for the chain-lab scenes the rolled
	 * knobs ARE the scene -- which transforms make up the chain -- so writing them
	 * down is what lets a good roll become a fixed, named entry later.
	 * @return (name, value) per Uniform in m_uniforms, in registration order.
	 */
	std::vector<std::pair<std::string, float>> namedParameters() const
	{
		std::vector<std::pair<std::string, float>> v;
		v.reserve(m_uniforms.size());
		for (const Uniform *u : m_uniforms) v.emplace_back(u->getName(), u->snapshotValue());
		return v;
	}

	// ---- Mood tags (config attribute mood="dark,calm,...") ----
	/// Bitmask flags parsed from a preset's mood="..." config attribute.
	enum MoodFlags {
		MOOD_DARK = 1, MOOD_BRIGHT = 2, MOOD_CALM = 4, MOOD_AGGRESSIVE = 8
	};
	void setMoodFlags(unsigned int f) { m_moodFlags = f; } ///< Sets the MoodFlags bitmask parsed from this effect's config.
	unsigned int moodFlags() const    { return m_moodFlags; } ///< @return The MoodFlags bitmask parsed from this effect's config (0 = untagged/neutral).
	/**
	 * @brief Transitions only: the shortest scene fade this transition may run in (seconds, 0 = no floor).
	 *
	 * With a confident rhythm the scheduler clamps every fade to four beats
	 * (2 s at 120 BPM). A cross-fade is fine at that; a transition that
	 * sweeps rings, spirals and caustics across the frame changes the picture
	 * up to thirty times as much over the same progress, and at two seconds
	 * that reads as frantic. The floor is measured per transition
	 * (PresetEditor --transprofile, total variation) and written into the
	 * catalogue as minFade="...".
	 */
	void  setMinFade( float s ) { m_minFade = s > 0.f ? s : 0.f; }
	float minFade() const       { return m_minFade; }   ///< @return The fade floor in seconds (0 = none).

protected:
	/**
	 * @brief Rolls a random duration uniformly between two bounds.
	 *
	 * Guards against the case minTime == maxTime, which would otherwise make
	 * `rand() % (maxTime - minTime)` divide by zero.
	 * @param minTime Lower bound (inclusive).
	 * @param maxTime Upper bound (exclusive unless equal to minTime).
	 * @return minTime when minTime == maxTime, otherwise a value in [minTime, maxTime).
	 */
	unsigned int getInterpolatedTime( unsigned int minTime, unsigned int maxTime );
	/// Clears the framebuffer and draws the shared fullscreen triangle (core-profile VAO from RenderPipeline.cpp).
	void drawWindow();

	unsigned int	m_width; ///< Combine width: render target width in pixels, as last set by prepare()/initUniforms()/setSize().
	unsigned int	m_height; ///< Combine height: render target height in pixels, as last set by prepare()/initUniforms()/setSize().

	//Shader and Uniforms
	// = 0 HERE, not only in the default ctor: the file-loading ctor never
	// touched it, so it held stack garbage until initUniforms() -- harmless
	// for years, until addUniform()'s late-registration path started testing
	// it BEFORE the GL loader ran (garbage nonzero -> glGetUniformLocation
	// through a still-NULL glcore pointer -> instant 0xC0000005 at startup).
	GLuint			m_sh_prog_id = 0; ///< Id of shader program. 0 until ensureCompiled() runs. In-class-initialized to avoid stale garbage being read by late addUniform() calls.
	GLint			m_texPointUni1; ///< Location of the `tex0` sampler uniform.
	GLint			m_texPointUni2; ///< Location of the `tex1` sampler uniform.
	GLint			m_texSizeRcpUni;	///< Location of the `resolution` uniform (render target width/height).
	GLint			m_timeUni; ///< Location of the `time` uniform.
    GLint			m_interpolationUni; ///< Interpolation between the Combines: location of the `interpolation` uniform (cross-fade weight).

	// ---- per-scene baked field (see usesBake() above) ----
	char   *m_bakeCompFilename = 0;   ///< Path to this scene's optional X.comp bake shader (sibling of the fragment file, derived in the constructor); the file need not exist.
	GLuint  m_bakeProg  = 0;    ///< Compiled companion compute program (0 = none, or compilation failed/not yet attempted).
	bool    m_bakeTried = false;   ///< True once compilation has been attempted (attempted only once; a missing/broken X.comp is a permanent soft-fail, not retried every frame).
	GLuint  m_bakeTex   = 0;    ///< GL_TEXTURE_3D the compute shader writes and the fragment shader samples as "texBake" (unit 33).
	int     m_bakeFrame = 0;    ///< Frames since attach; modulo kBakeIntervalFrames decides whether THIS frame re-bakes.
	AudioFeatures m_lastAudioForBake;   ///< This frame's features, cached by applyAudioFeatures() so stepBake() -- called from draw(), which takes no audio parameter -- has them.
	static const int kBakeRes = 96;             ///< Cube resolution of the baked 3D texture (96^3 texels).
	static const int kBakeIntervalFrames = 6;   ///< Re-bake every N frames: amortizes the compute cost while keeping slow parameter drift (e.g. an audio-morphed fractal constant) visibly continuous rather than frozen.
	/** @brief Lazily compiles the companion X.comp (if present) and allocates the 3D texture backing "texBake". Attempted once; soft-fails (usesBake() draws will silently see an all-zero field) if there is no companion file or it fails to compile. */
	void ensureBakeProg();
	/**
	 * @brief Dispatches the bake compute program on the kBakeIntervalFrames cadence and binds the result to texture unit 33.
	 * @param time Global shader time, passed through to the compute shader as "time".
	 * @param audio This frame's audio features (see m_lastAudioForBake), for whatever audio-driven parameters the specific bake shader reads.
	 */
	void stepBake( float time, const AudioFeatures &audio );

	char*			m_vertexShaderFilename; ///< Path to the vertex shader source (always "..\\standard.vert" in practice).
	char*			m_fragmentShaderFilename; ///< Path to this effect's fragment shader source.



	unsigned int  m_timeSolo; ///< Currently rolled "stay solo" duration in seconds, re-rolled by resetParameters()/setUniforms().
	unsigned int  m_timeInterpolation; ///< Currently rolled cross-fade duration in seconds, re-rolled by resetParameters()/setUniforms().

	unsigned int  m_minTimeSolo; ///< Lower bound for rolling m_timeSolo.
	unsigned int  m_maxTimeSolo; ///< Upper bound for rolling m_timeSolo.
	unsigned int  m_minTimeInterpolation; ///< Lower bound for rolling m_timeInterpolation.
	unsigned int  m_maxTimeInterpolation; ///< Upper bound for rolling m_timeInterpolation.

	unsigned int  m_complexity; ///< Visual-complexity weight used by preset selection.

	float	m_probability; ///< Threshold used by useShader() to decide whether this effect activates.

	int		m_usesSim = -1;      ///< Cached usesSim() result: -1 = not yet queried, 0/1 = the compiled program does (not) declare `texSim`.
	int		m_usesProgress = -1; ///< Cached usesProgress() result: -1 = not yet queried; 1 = reads `sceneProgress` or a rig formula uses `progress`.
	bool	m_exprUsesProgress = false;   ///< Set by addExpression() while the rig formulas are parsed when one references `progress`; feeds usesProgress().
	int		m_srcUsesProgress = -1;   ///< Cached sourceUsesProgress() result for the not-yet-compiled case: -1 = not yet read, 0/1 = the source does (not) use `sceneProgress`.
	int		m_usesFluid = -1;    ///< Cached usesFluid() result (-1 = not yet queried), same scheme as m_usesSim: the fluid field, `texFluid`.
	int		m_usesSmoke3D = -1;  ///< Cached usesSmoke3D() result (-1 = not yet queried): the volumetric smoke/fire field, `texSmoke3D`.
	int		m_usesSSM = -1;      ///< Cached usesSSM() result (-1 = not yet queried): the self-similarity matrix, `texSSM`.
	int		m_usesSpectro = -1;  ///< Cached usesSpectro() result (-1 = not yet queried): the scrolling spectrogram history, `texSpectro`.
	int		m_usesShadow = -1;   ///< Cached usesShadow() result (-1 = not yet queried): the shadow map, `texShadow`.
	int		m_usesShadow2 = -1;   ///< Cached usesShadow2() result (-1 = not yet queried): the second, independent shadow map, `texShadow2`.
	int		m_usesOit = -1;      ///< Cached usesOit() result (-1 = not yet queried): order-independent transparency, `oitPass`.
	int		m_usesBake = -1;     ///< Cached usesBake() result (-1 = not yet queried): the per-scene baked-field texture, `texBake`.
	int		m_usesSceneLod = -1;     ///< Cached usesSceneLod() result (-1 = not yet read from the source file).
	std::vector<int> m_gradeModes;  ///< Grades this entry may wear (1 faded, 2 grey, 3 sepia), from the preset attribute grade="...".
	int		m_gradeMode = 0;         ///< Grade rolled for the current activation (0 = none).

	/**
	 * @brief Host side of the chain lab's walk (uniforms walkA..walkD, walkS, walkHost).
	 *
	 * The shader alone cannot let the music choose where a stage walks: it has no
	 * memory, so a target taken from the current audio could change mid-fade.
	 * Here each stage (A..D, the look S, and in the 3D lab space/core/body) keeps
 * the knob value it shows, its
	 * target and the fade progress; the music decides when a stage walks (a new
	 * section, a drop, a harmonic change, or its hold time running out -- shorter
	 * the more energy) and where to (the classes are ordered calm..energetic in
	 * the shader, the smoothed arousal picks the region).  A returning section
	 * (chorus #2) walks back to the chain it had the first time.
	 */
	struct ChainWalk
	{
		bool  active = false;           ///< Walk mode rolled (morphP >= 0.5) and the shader takes host walks.
		bool  pending = true;           ///< Reset due (activation); done lazily once the program exists.
		float x0[9] = {};               ///< Knob value shown per stage (A, B, C, D, look, space, core, body).
		float x1[9] = {};               ///< Fade target per stage.
		float f[9] = {};                ///< Fade progress 0..1 per stage.
		float fadeDur[9] = {};          ///< Fade length per stage, seconds.
		float hold[9] = {};             ///< Seconds since the stage last changed.
		bool  fading[9] = {};           ///< Stage is fading to x1.
		int   lastSection = -1;         ///< Last seen AudioFeatures::sectionCount (-1 = not yet).
		int   lastDrop = -1;            ///< Last seen AudioFeatures::dropCount.
		float energy = 0.5f;            ///< Slowly smoothed arousal (8 s).
		float energyFast = 0.5f;        ///< Arousal smoothed over ~1 s: drives the walk's speed.
		float fluxS = 0.f;              ///< Spectral flux smoothed over ~0.5 s: bursts hurry a fade.
		float rate = 1.f;               ///< Current music speed of the walk (fades and holds), 0.25 .. 2.5.
		float harmCool = 0.f;           ///< Cooldown for harmonic-change walks, seconds.
		float lastPhrase = -1.f;        ///< AudioFeatures::phrasePos of the previous frame (-1 = not yet): its wrap is an 8-bar boundary.
		int   phraseN = 0;              ///< Phrase boundaries seen: odd ones bring a new variant, even ones a new transform.
		float next[9] = {};             ///< 3D lab: a structure stage's next target, picked ahead (its geometry forged meanwhile).
		bool  hasNext[9] = {};          ///< next[s] is valid.
		float endHold = 0.f;            ///< 3D lab: seconds a finished structure fade has held for the next phrase boundary.
		float tiltA = 0.f;              ///< Direction of the time tilt (radians, eased toward tiltTarget; uniform tiltA).
		float tiltTarget = 0.f;         ///< The current section's tilt direction.
		std::map<int, float> sectionTilt;   ///< Tilt direction per section id: a returning section returns to it.
		std::map<int, std::array<float, 9>> sectionLook;   ///< Look per section id: a returning section returns to it.
		std::chrono::steady_clock::time_point last;       ///< Wall clock of the previous step.
		bool  hasLast = false;          ///< last is valid.
		std::minstd_rand rng;           ///< Own random stream (keeps the scene's rand() stream untouched per frame).
	} m_walk;                           ///< The walk of this activation (chain labs only).
	/**
	 * @brief Camera host of the 3D chains (uniform camHost): the flight
	 * position and the gaze.
	 *
	 * The flight is integrated here -- time plus the music's advance, times a
	 * speed per gaze -- so a gaze can slow the flight (floating) without the
	 * camera jumping, which a closed-form position in the shader cannot.  The
	 * gaze holds 2-5 minutes, then pans 40-60 s to another one; wall-clock
	 * time only, the camera never follows the audio.
	 */
	struct ChainCam
	{
		bool  pending = true;           ///< Reset due (activation).
		float z = 0.f;                  ///< Flight position along the path.
		int   g0 = 0;                   ///< Gaze shown (see gazeAngles in the shader).
		int   g1 = 0;                   ///< Gaze panned to.
		float f = 0.f;                  ///< Pan progress 0..1 (0 = holding g0).
		float panDur = 50.f;            ///< Pan length, seconds.
		float hold = 0.f;               ///< Seconds on g0 so far.
		float holdDur = 200.f;          ///< How long g0 stays before the next pan.
		float lastAdv = 0.f;            ///< audioAdvance of the previous frame.
		bool  hasLast = false;          ///< last/lastAdv valid.
		std::chrono::steady_clock::time_point last;   ///< Wall clock of the previous step.
		std::minstd_rand rng;           ///< Own random stream.
	} m_cam;                            ///< The camera of this activation (3D chains only).
	GLuint	m_camProg = 0;              ///< Program the camera locations belong to.
	GLint	m_camHostLoc = -1;          ///< camHost (-1: no camera host).
	GLint	m_camZLoc = -1;             ///< camZ, the flight position.
	GLint	m_camGazeLoc = -1;          ///< camGaze (shown, panned to, pan).
	/// @brief Advances the 3D chains' camera (flight and gaze) and uploads it (program must be bound).
	void stepChainCam( const AudioFeatures &f );
	// ---- Specialised variants of the chain labs ----
	// One lab shader holds every class; the GPU reserves registers for the
	// heaviest branch on every pixel.  A variant with the classes on screen
	// built in runs 2.5-6x faster (3D lab: 5.1 -> 1.3 ms for the same world).
	std::map<std::string, std::vector<int>> m_chainOrd;   ///< Stage knob -> branch per position, from "// @chainord".
	GLuint	m_genericProg = 0;          ///< The generic program while a variant is bound (0: none bound).
	std::string m_specBound;            ///< Defines of the bound variant ("" = generic).
	std::string m_specNextKey;          ///< Variant to bind at the start of the next frame (enableShader).
	GLuint	m_specNext = 0;             ///< Its program.
	std::map<std::string, GLuint> m_specProgs;   ///< Built variants this effect holds a reference to.
	std::vector<std::string> m_specLru;          ///< Their keys, least recently wanted first.
	float	m_specWait = 0.f;           ///< Seconds a fade has been held for a variant (timeout 4 s).
	bool	m_specOff = false;          ///< Variants given up for this activation (timeout / failure).
	float	m_walkMorph = 0.f;          ///< morphP of this activation (the shader walks on its own at 0.15..0.5).
	bool	m_walkProgSwap = false;     ///< The last program change was a variant switch: the walk keeps its state.
	bool	m_specRevert = false;       ///< Back to the generic program at the start of the next frame.
	/// @brief The defines of the variant for a walk state (stage classes shown and faded to); "" if not specialisable.
	std::string specDefines( const float *x0, const float *x1, const bool *fading ) const;
	/// @brief Makes `prog` this effect's program and re-resolves the base uniform locations (program must be usable).
	void bindProgram( GLuint prog );
	/// @brief Drops every variant (back to the generic program); with release, also frees them.
	void dropVariants( bool release );
	// ---- Chain runner: the lab's chain as one small pass per transform ----
	char   *m_compileFile = nullptr;    ///< Engine/ChainPass/Final_NAME.frag when this lab runs its chain as passes (else null: the fragment file itself).
	GLuint	m_cpFbo[8] = {};           ///< Framebuffers of the coordinate textures.
	GLuint	m_cpTex[8] = {};           ///< Coordinate textures (ping-pong plus fade temporaries; 5 for the flat labs, 8 RGBA32F for the 3D lab).
	int		m_cpW = 0;                 ///< Their width (the chain grid: the viewport times chainScale, or the bake square).
	int		m_cpH = 0;                 ///< Their height.
	int		m_chainBake = 0;            ///< > 0: the chain is baked over [0,1]^2 at this size ("// @chainbake N" in the final shader).
	bool	m_chain3D = false;          ///< "// @chain3d": the 3D lab's deferred passes (geometry, three plane chains, shading).
	std::string m_geomSrc;              ///< Engine/ChainPass/Geom_NAME.frag: the geometry pass, world classes as \#if selections.
	GLuint	m_gbFbo = 0;               ///< The 3D lab's G-buffer framebuffer.
	GLuint	m_gbTex[2] = {};           ///< Its targets: hit point + distance, normal + AO (RGBA32F).
	GLuint	m_stFbo = 0;               ///< The 3D lab's start target (a plane's chain input and time offset).
	std::chrono::steady_clock::time_point m_chainUsed;   ///< When this lab last ran its chain (idle labs free their textures).
	/// @brief Frees the chain runner's textures and framebuffers (GL context current); the next run allocates them again.
	void freeChainTextures();
	/// @brief Marks this lab's chain textures as used now and frees those of labs idle for 25 s (GL context current).
	void retireIdleChains();
public:
	/// @brief Frees the chain textures of every lab idle for 25 s (once per frame, GL context current).
	static void retireIdleChainTextures();
protected:
	GLuint	m_stTex = 0;               ///< Its texture (RGBA32F; the chain textures are RG32F).
	float	m_geomWait = 0.f;           ///< Seconds a structure fade has waited for its geometry variant.
	/// @brief The geometry program for a walk state (world 0 = shown, world 1 = faded to); 0 while the helper builds it.
	GLuint	geomProgram( const float *x0, const float *x1, const bool *fading );
	/// @brief The 3D lab's passes (see runChainPasses).
	void	runChain3D( const AudioFeatures &f );
	std::vector<int> m_permCodes;       ///< The 24 stage orders (base-4 digits), from "int permCode(int i)".
	float	m_lastSceneTime = 0.f;      ///< sceneTime as uploaded this frame (the passes need the same value).
	/// @brief Runs this frame's chain as passes and binds the result as texChain (program must be bound; restores the GL state it touches).
	void runChainPasses( const AudioFeatures &f );
	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
	std::map<std::string, std::vector<std::string>> m_chainClasses;   ///< Stage knob -> class names (energy order), from "// @chainclasses".
	std::map<std::string, float> m_chainConsts;   ///< Knobs frozen as constants (ChainLike*): name -> value.
	std::map<std::string, std::vector<int>> m_chainOpening;   ///< Stage knob -> positions of its classes streaming into an opening, from "// @chainopening".
	/// @brief Reads the chain lab's "// @chainclasses" / "// @chainopening" lines and frozen knobs once (m_chainParsed).
	void parseChainSource();
	/// @brief Whether knob value x of stage s (0..3 = A..D) picks a class streaming into an opening (chain_classes.OPENING).
	bool opensAt( int s, float x ) const;
	/// @brief The nearest class of stage s without an opening (energy order), same sub-variant; x if there is none.
	float closedClass( int s, float x ) const;
	GLuint	m_walkProg = 0;             ///< Program the walk locations belong to.
	GLint	m_walkLoc[9] = { -1, -1, -1, -1, -1, -1, -1, -1, -1 };   ///< Locations of walkA..walkD, walkS, walkSpace, walkCore, walkBody (-1 = stage absent).
	GLint	m_walkHostLoc = -1;         ///< Location of walkHost (-1: not a chain lab).
	GLint	m_tiltALoc = -1;            ///< Location of tiltA (the time tilt's direction).
	/// @brief Re-reads the rolled knobs into the walk state (called lazily after an activation).
	void resetChainWalk();
	/// @brief Advances the walk by one frame from the music and uploads the walk uniforms (program must be bound).
	void stepChainWalk( const AudioFeatures &f );
	/// @brief Starts stage @p s fading to knob value @p target over @p dur seconds (no-op while that stage already fades: a fade never changes its destination).
	void startWalk( int s, float target, float dur );
	int		m_usesMandelbrot = -1;   ///< Cached usesMandelbrot() result (-1 = not yet queried): the deep-zoom Mandelbrot field texture, `texMandelbrot`.
	int		m_usesPhysarum = -1; ///< Cached usesPhysarum() result (-1 = not yet queried): the Physarum trail map, `texPhysarum`.
	unsigned int	m_cfxMask = 0;   ///< Compute-FX sampler bits (see cfxMask()); cached result, resolved once per compiled program (see m_cfxProg).
	GLuint		m_cfxProg = 0;   ///< Program the mask was resolved for: id m_cfxMask was last computed for; mismatch triggers re-resolution in cfxMask().

	bool	m_glReady = false;      ///< Lazy compile: true once initUniforms() has built the GL program; every uses*() query answers false (without caching) while this is unset, and cleanShaderPrograms() clears it.

	// Cached audio-uniform locations: applyAudioFeatures used to do ~45
	// glGetUniformLocation string lookups per shader per FRAME.  Cached per
	// program id (auto-refreshes after recompile / hot reload).
	// Sized with headroom over AL_COUNT — the array is indexed by the enum, so
	// it has to stay ahead of it as uniforms are added.
	/// Per-program cache of all audio-uniform locations, avoiding ~45 glGetUniformLocation string lookups per shader per frame.
	struct AudioLocCache { GLuint progId = 0; /**< Program id the locations were resolved for; 0 = never resolved. */ GLint L[96]; /**< Uniform location per AudioLoc enum value (index AL_*), -1 where the program lacks that uniform; only the first AL_COUNT entries are filled. */ };
	AudioLocCache m_audioLocs; ///< applyAudioFeatures()'s location cache; auto-refreshes when m_sh_prog_id changes (recompile/hot reload).

	/// A scene's own "power" uniform (superellipse/distortion exponent, e.g.
	/// Kaleidoscope.frag/DarkAmbientTunnel.frag's polar fold shape) is a plain
	/// per-frame value with no time-integrated state, so -- unlike speed/
	/// speedTunnel (see applyAudioFeatures()'s big comment on why those are
	/// NOT touched here) -- it is safe to modulate live: re-scaled by
	/// AudioFeatures::powerScale every frame via Uniform::setGLValueScaled(),
	/// on top of whatever value that scene's own `<float name="power">` range
	/// rolled for this activation. Resolved by name alongside the AL_* cache
	/// above (nullptr if this program has no "power" uniform).
	Uniform *m_powerUniform = nullptr;

	// Formula-layer expressions (uniform name -> compiled program).
	/// One compiled formula-layer expression bound to a target uniform name.
	struct ExprEntry
	{
		std::string name; ///< Target GLSL uniform name.
		ExprProgram prog; ///< Compiled expression program, evaluated against ExprVars each frame.
		GLint       loc    = -1; ///< Cached uniform location for `name`, for the program identified by progId.
		GLuint      progId = 0; ///< Program id `loc` was resolved for; mismatch triggers re-resolution.
	};
	std::vector<ExprEntry> m_exprs; ///< All formula-layer expressions registered via addExpression().
	float m_exprTime     = 0.f;      ///< Time as passed to setUniforms; current frame's time value, read by the formula layer.
	float m_exprSeeds[3] = { 0.5f, 0.5f, 0.5f };   ///< Re-rolled per activation: random seeds exposed to formulas as seed1/seed2/seed3; re-rolled by resetParameters()/addExpression().

	// ---- sceneProgress: 0 at activation, 1 at the end of the solo period ----
	// For scenes that stage a ONE-SHOT event rather than a loop -- a ship
	// passing the camera, an approach and dock, a descent into an atmosphere.
	// Those need to know how far through their own screen time they are;
	// everything else the engine offers is either absolute (`time`) or
	// periodic, and neither can place a beginning, a middle and an end.
	//
	// Normalised against the solo length CAPTURED AT ACTIVATION, not the live
	// m_timeSolo: setUniforms() re-rolls that every single frame, so dividing
	// by it would make the progress jitter instead of advancing evenly.
	GLint m_progressUni    = -1;        ///< Location of the `sceneProgress` uniform (-1 if the shader doesn't declare it).
	GLint m_sceneTimeUni   = -1;        ///< Location of the `sceneTime` uniform: seconds since THIS activation. `time` runs since program start and grows without bound.
	float m_advanceAtReset = -1.0e9f;   ///< audioAdvance beim ersten Frame nach der Aktivierung; `sceneAdvance` ist die Differenz dazu.
	unsigned m_activations = 0;         ///< Auftritte dieser Szene seit Programmstart; Teil des Szenen-Seeds unter KALEIDO_SEED.
	float m_soloAtReset    = 0.f;       ///< m_timeSolo as it stood at the last resetParameters(), in seconds.
	float m_activationTime = -1.0e9f;   ///< `time` at the first setUniforms() after activation; sentinel means "not yet seen".
	int    m_secCur = -1, /**< Slot id of the current song section, uploaded as `audioSectionId`; -1 = nothing seen since activation. */ m_secPrev = -1, /**< Slot id of the section before the current one, uploaded as `audioSectionPrev`; equals m_secCur on the first sight after activation. */ m_secCount = -1;   ///< Section memory for the shader (audioSectionId/Prev/Count); -1 = nothing seen since activation.
	float  m_secKnown = 0.f;                                ///< 1 if the current section was recognised as returning.
	double m_secT0 = 0.0;                                   ///< steady_clock seconds of the last section change (audioSectionAge).
	float m_progressT0     = -1.0e9f;   ///< Origin of the sceneProgress ramp; equals m_activationTime unless setClimaxIn() re-timed the arc.
	float m_sceneProgress  = 0.f;       ///< Cached 0..1 progress, also readable by subclasses for CPU-side staging.

	// 2D CAMERA RIG state (formulas rig2Roll/rig2Zoom/rig2X/rig2Y + the
	// host-integrated rig2…V rates), evaluated in applyAudioFeatures and
	// consumed by RenderPipeline's Engine/Rig2D.frag transform pass.
	bool  m_rig2Active   = false; ///< True once any rig2* formula (absolute or rate) is present; enables the Rig2D transform pass.
	float m_rig2[4]      = { 0.f, 0.f, 0.f, 0.f };   ///< Roll zoom x y: current 2D camera rig transform {roll, zoom, panX, panY}, consumed via rig2().
	float m_rig2Acc[4]   = { 0.f, 0.f, 0.f, 0.f }; ///< Host-integrated accumulator for the rig2*V rate formulas (roll, zoom, panX, panY).
	float m_rig2LastT    = -1.0e9f; ///< m_exprTime at the last rig2 rate integration step, used to compute dt and guard against re-integrating within the same frame.

public:
	/**
	 * @brief Reads the current 2D camera rig transform, if active.
	 * @param out Destination for {roll, zoom, panX, panY}; left untouched when the rig is inactive.
	 * @return False if the 2D rig pass is off (no rig2* formulas registered); true if @p out was filled.
	 */
	bool rig2( float out[4] ) const
	{
		if( !m_rig2Active ) return false;
		for( int i = 0; i < 4; ++i ) out[i] = m_rig2[i];
		return true;
	}
protected:

	unsigned int m_moodFlags = 0;   ///< MoodFlags bitmask parsed from the config's mood="..." attribute (0 = untagged/neutral); the scheduler matches it against the live mood.
	float m_minFade = 0.f;          ///< Transitions: shortest fade this transition may run in (seconds); see setMinFade().

	std::vector< Uniform *> m_uniforms; ///< All randomised parameters registered via addUniform()/addUniformInterpolator(), owned for the lifetime of this effect (never explicitly deleted).

};


#endif
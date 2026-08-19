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
		m_usesSpectro = m_usesShadow = m_usesShadow2 = m_usesOit = -1;
	}
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
		cleanShaderPrograms();
		m_sh_prog_id = 0;
		m_glReady    = false;
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
	static float s_shadowExtent;      // the ACTIVE scene's, for the receivers
	static float s_shadowPass;        // 1 during the depth-only pass
	static float s_lightM[16];        // light view-projection, column-major
	static float s_lightDir[3];
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

	// ---- Mood tags (config attribute mood="dark,calm,...") ----
	/// Bitmask flags parsed from a preset's mood="..." config attribute.
	enum MoodFlags {
		MOOD_DARK = 1, MOOD_BRIGHT = 2, MOOD_CALM = 4, MOOD_AGGRESSIVE = 8
	};
	void setMoodFlags(unsigned int f) { m_moodFlags = f; } ///< Sets the MoodFlags bitmask parsed from this effect's config.
	unsigned int moodFlags() const    { return m_moodFlags; } ///< @return The MoodFlags bitmask parsed from this effect's config (0 = untagged/neutral).

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

	int		m_usesSim = -1;      // -1 = not yet queried, 0/1 = cached result
	int		m_usesFluid = -1;    // same caching for the fluid field
	int		m_usesSmoke3D = -1;  // same caching for the volumetric smoke/fire field
	int		m_usesSSM = -1;      // same caching for the self-similarity matrix
	int		m_usesSpectro = -1;  // ... and for the scrolling spectrogram history
	int		m_usesShadow = -1;   // ... and for the shadow map
	int		m_usesShadow2 = -1;   // ... and for the second, independent shadow map
	int		m_usesOit = -1;      // ... and for order-independent transparency
	int		m_usesPhysarum = -1; // same caching for the Physarum trail map
	unsigned int	m_cfxMask = 0;   ///< Compute-FX sampler bits (see cfxMask()); cached result, resolved once per compiled program (see m_cfxProg).
	GLuint		m_cfxProg = 0;   ///< Program the mask was resolved for: id m_cfxMask was last computed for; mismatch triggers re-resolution in cfxMask().

	bool	m_glReady = false;      // lazy compile: program built yet?

	// Cached audio-uniform locations: applyAudioFeatures used to do ~45
	// glGetUniformLocation string lookups per shader per FRAME.  Cached per
	// program id (auto-refreshes after recompile / hot reload).
	// Sized with headroom over AL_COUNT — the array is indexed by the enum, so
	// it has to stay ahead of it as uniforms are added.
	/// Per-program cache of all audio-uniform locations, avoiding ~45 glGetUniformLocation string lookups per shader per frame.
	struct AudioLocCache { GLuint progId = 0; GLint L[96]; };
	AudioLocCache m_audioLocs; ///< applyAudioFeatures()'s location cache; auto-refreshes when m_sh_prog_id changes (recompile/hot reload).

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

	unsigned int m_moodFlags = 0;   // MoodFlags bitmask (0 = untagged/neutral)

	std::vector< Uniform *> m_uniforms; ///< All randomised parameters registered via addUniform()/addUniformInterpolator(), owned for the lifetime of this effect (never explicitly deleted).

};


#endif
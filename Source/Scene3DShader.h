/**
 * @file Scene3DShader.h
 * @brief EffectShader subclass rendering a real 3D scene: procedural geometry animated by a scene-specific vertex shader, drawn through a perspective camera into the shared effect FBO.
 */
// Scene3DShader.h
// ---------------------------------------------------------------------------
// A REAL 3D scene effect: procedural geometry in a static VBO, animated
// entirely in a scene-specific VERTEX shader (Scene3D\<Name>.vert+.frag),
// rendered with a perspective camera into the same effect FBO every other
// effect uses — so combines, trails and presets keep working unchanged.
//
// Generic vertex layout (one layout serves every scene):
//   attribute vec4 attrA;  // xyz = local corner / strip params, w = index
//   attribute vec4 attrB;  // four random seeds in [0,1)
// The vertex shader builds the world from index+seeds+audio uniforms; the
// C++ side only supplies the projection matrix and the stereo eye offset.
//
// Geometry kinds (config attribute geom="points|cubes|ribbon|grid|quads"):
//   points  60000 point sprites   additive blending, no depth test
//   cubes    4900 unit cubes      opaque, depth-tested
//   ribbon  20x300 quad strips    additive blending, no depth test
//   grid    220x120 cell sheet    opaque, depth-tested (u/v in attrA.xy)
//   quads    3000 unit quads      opaque, depth-tested (corner in attrA.xy)
//   mesh    real .glb/.obj model  opaque, depth-tested (attrA.xyz=pos/.w=U,
//                                 attrB.xyz=normal/.w=V -- see MeshImport.h);
//                                 its material, if any, samples "texMeshMaterial"
//                                 (sampler2DArray, unit kMeshMaterialTexUnit)
//
// The CURRENT IMAGE is available to every scene: the host binds it on unit 0
// before the effect pass and setUniforms() points "tex0" at it — a fragment
// shader only has to declare `uniform sampler2D tex0;` (unit 1 / "tex1" holds
// the incoming cross-fade image).
//
// TRUE STEREO: the host calls setEyeOffset(+-e) and renders twice into the
// side-by-side / top-bottom halves (scissored); the vertex shaders shift the
// view by eyeOff and re-converge after projection.
// ---------------------------------------------------------------------------
#pragma once

#include <atomic>
#include "MeshImport.h"   // MeshAsset: the warm-up worker's payload lives as members here
#include "EffectShader.h"
#include <string>

/**
 * @brief EffectShader specialization that renders a real 3D scene: procedural geometry driven entirely by a scene-specific vertex shader.
 *
 * Each instance owns one VBO/VAO of host-built (or, for geom="indirect", compute-generated)
 * geometry, a perspective camera it assembles itself in draw() (including an optional
 * formula-driven camera rig), and an optional tessellation / geometry / compute pipeline that a
 * scene opts into simply by dropping the matching sibling file (X.tesc/X.tese/X.geom/X.comp)
 * next to its X.vert/X.frag. Every (re)activation rolls a fresh set of "per-activation variety"
 * parameters (time offset, speed factor, hue offset, scene seed) via resetParameters(), so the
 * same scene reads as a whole family of variations rather than always looking identical. Used by
 * the preset/effect system like any other EffectShader; is3D() is the only extra signal the host
 * needs, to route true-stereo per-eye rendering.
 */
class Scene3DShader : public EffectShader
{
public:
	/**
	 * @brief Constructs a 3D scene bound to one fragment shader and geometry kind, and rolls its first per-activation variation.
	 * @param filenameFragmentShader Path to the scene's X.frag; sibling X.vert/.tesc/.tese/.geom/.comp filenames are derived from it by replacing the extension.
	 * @param geom Geometry kind from the preset's geom= attribute ("points","cubes","ribbon","grid","quads","patches","scatter","indirect","mesh"); unrecognised values fall back to "points".
	 * @param minTimeSolo Minimum time (ms) this effect stays solo before crossfading; forwarded to EffectShader.
	 * @param maxTimeSolo Maximum time (ms) this effect stays solo; forwarded to EffectShader.
	 * @param minTimeInterpolation Minimum crossfade duration (ms); forwarded to EffectShader.
	 * @param maxTimeInterpolation Maximum crossfade duration (ms); forwarded to EffectShader.
	 */
	Scene3DShader( const std::string &filenameFragmentShader, const std::string &geom,
	               unsigned int minTimeSolo, unsigned int maxTimeSolo,
	               unsigned int minTimeInterpolation, unsigned int maxTimeInterpolation );
	/** @brief Releases this scene's GL objects: geometry VBO, indirect command buffer, persistent generator-state buffer and compute generator program. */
	~Scene3DShader();

	/**
	 * @brief Compiles the full shader pipeline (vertex + optional tess/geom stages + fragment), resolves uniform/attribute locations, and builds/uploads the geometry and VAO.
	 * @param width Render-target width in pixels.
	 * @param height Render-target height in pixels.
	 */
	void initUniforms( int width, int height ) override;
	/** @brief Renders one frame: builds the projection/camera matrix (applying any rig* formulas), sets the depth/blend state appropriate to this scene's geometry kind, and issues its draw call(s). */
	void draw() override;
	bool is3D() const override { return true; }   ///< @return true — this is a real 3D scene, so the host uses the true-stereo per-eye render path.
	bool isMeshScene() const override { return m_geomKind == GEOM_MESH; }   ///< @return true for a loaded-model scene; the host damps the time echo on these (see EffectShader::isMeshScene).

	// ---- asynchronous mesh warm-up (see EffectShader::meshWarmupPending) ----
	bool meshWarmupPending() const override;
	void requestMeshWarmup() override;
	/** @brief Worker-thread entry: runs loadMeshAsset() for this scene's model
	 *  path(s) into the m_warm* slots, then publishes WARM_READY. Called ONLY by
	 *  the warm-up worker; everything GL stays out of it. */
	void warmupLoadNow();
	bool finishMeshWarmup() override;

	// PER-ACTIVATION VARIETY: every time the scene is (re)activated it rolls
	// a fresh epoch — a large time offset (different camera/burst phases), a
	// mild speed factor (±20 %, constant within the activation so nothing
	// flickers), a hue rotation and a generic `sceneSeed` uniform some scenes
	// use structurally (sector counts, knot type).  The same scene becomes a
	// whole family of variations.
	/** @brief Rolls a fresh per-activation variation epoch (time offset, speed factor, hue offset, scene seed) on top of the base class's own parameter reset. */
	void resetParameters() override;
	// Also true when only the compute generator reads the spectrogram — the
	// base class can only see the render program.
	/** @brief Whether this scene reads the spectrogram history texture. @return true if the render program (base class check) OR, for geom="indirect" scenes, the compute generator declares `texSpectro`. */
	bool usesSpectro() override;
	void  setStateBytes( int b ) { m_stateBytes = b; }   ///< @param b Size in bytes of the persistent SSBO a geom="indirect" generator keeps across frames (0 = none); allocated and zeroed once in setupIndirect().
	void  setGenPassCount( int n ) { m_genPassCount = n; }   ///< @param n Number of compute passes (genPass = 0..n-1, barrier between each) runGenerator() dispatches this generator through per frame; 0 (default) keeps the original "1 pass, or 2 if stateful" behaviour. For pipelines needing more than "advance, then mesh" (e.g. a multi-stage grid-based fluid sim).
	void  setShadowExtent( float e ) { m_shadowExtent = e; }   ///< @param e Half-width of the shadow-map light box for this scene (overrides EffectShader::kShadowExtent).
	void  setModelPath( const std::string &path ) { m_modelPath = path; }   ///< @param path Filesystem path (config attribute model=) to the .glb/.gltf/.obj this geom="mesh" scene loads; ignored by every other geom kind.
	void  setModelPath2( const std::string &path ) { m_modelPath2 = path; }   ///< @param path Optional SECOND mesh (config attribute model2=), loaded into the same VBO after the first; lets one scene stage two objects against each other (a ship alongside a station). Ignored by every other geom kind.
	void  setMeshInstances( int n ) { m_meshInstances = ( n > 1 ) ? n : 1; }   ///< @param n Draw the loaded mesh this many times in one call (config attribute instances=); the shader places the copies from gl_InstanceID. Values below 2 mean the ordinary single draw.
	float shadowExtent() const override { return m_shadowExtent; }   ///< @return This scene's shadow-map light box half-width.
	/**
	 * @brief Forwards to EffectShader::setUniforms(), first folding in this activation's time offset/speed factor.
	 * @param time Raw host time in seconds.
	 * @param interpolation Crossfade interpolation factor (0..1) between the outgoing and incoming effect.
	 * @param texLoc1 Texture unit bound as `tex0` (current image).
	 * @param texLoc2 Texture unit bound as `tex1` (incoming crossfade image).
	 */
	void setUniforms( float time, float interpolation,
	                  GLint texLoc1, GLint texLoc2 ) override;
	/** @brief Applies this activation's hue offset to the chroma hue and audio rotation/advance phases before forwarding the features to EffectShader, and caches the adjusted snapshot for the (separate-program) indirect generator. @param f Live audio-analysis snapshot for the current frame. */
	void applyAudioFeatures( const AudioFeatures &f );

	// True-stereo eye offset in world units (0 = mono).  Set by the host
	// between the two per-eye draw() calls.
	void setEyeOffset( float e ) { m_eyeOffset = e; }   ///< @param e Stereo eye offset in world units (0 = mono) to use for the next draw() call.

	// FPS-driven detail budget (1.0 = full detail, 0.5 = half), maintained by
	// RenderPipeline from the frame rate. Two consumers: GEOM_CUBES scenes
	// read it directly as the `cubeBudget` uniform (every 2nd cube dropped at
	// 0.5); geom="indirect" generators never see it themselves -- it reaches
	// them indirectly, via the shared IndirectClamp.comp pass capping the
	// drawn vertex count to maxVertices*budget (see runGenerator()).
	static float s_cubeBudget;   ///< Global FPS-driven detail budget (1.0 = draw everything, 0.5 = every 2nd/half, ...); GEOM_CUBES reads it as the `cubeBudget` uniform, geom="indirect" scenes get it via IndirectClamp.comp's `budget` uniform instead.

	/** @return Mean fraction of the frame the loaded model covered, or -1 if
	 *          nothing was measured (KALEIDO_COVER_LOG unset, or not a mesh).
	 *
	 * An occlusion query counts the fragments the mesh draw actually wrote.
	 * The framing is built in each scene's own .vert (camera distance, scale),
	 * so it cannot be derived from meshExtent -- but it can be COUNTED.  This
	 * answers what the contact sheets raised: the stations fill about a tenth
	 * of the frame, which is why even a correct camera move measures as almost
	 * no motion. */
	float coverage() const { return m_coverN ? float(m_coverSum / m_coverN) : -1.f; }

private:
	GLuint m_coverQuery = 0;      ///< GL_SAMPLES_PASSED query object; 0 = not created.
	bool   m_coverBusy  = false;  ///< A query is in flight and must be read before reuse.
	double m_coverSum   = 0.0;    ///< Sum of per-frame covered-fragment fractions.
	int    m_coverN     = 0;      ///< Frames that contributed to m_coverSum.
	// GEOM_PATCHES feeds GL_PATCHES (4 control points per quad) instead of
	// triangles, which is the only geometry a tessellation stage can consume.
	// GEOM_SCATTER is the same point cloud as GEOM_POINTS but drawn opaque and
	// depth-tested, for geometry shaders that grow each point into a solid body
	// (grass, hair, shards) — those must occlude each other, not add up.
	// GEOM_INDIRECT has NO host-built geometry at all: a compute shader writes
	// the vertices and the draw call's own argument list into buffers, and the
	// vertex count never travels back to the CPU.  See runGenerator().
	// GEOM_MESH is the one kind whose geometry is NOT procedural: buildGeometry()
	// loads a real .glb/.gltf/.obj file (see MeshImport.h) instead of generating
	// a pattern, and its material (if the source had one) is bound as a
	// sampler2DArray -- see m_meshMaterialTex.
	/**
	 * @brief Which procedural geometry buildGeometry() produces and how draw() renders it.
	 *
	 * Selected from the preset's geom= string in the constructor; see the file-level comment
	 * and buildGeometry()'s per-branch comments for the exact vertex counts and layout.
	 */
	enum GeomKind { GEOM_POINTS = 0, GEOM_CUBES = 1, GEOM_RIBBON = 2,
	                GEOM_GRID = 3, GEOM_QUADS = 4, GEOM_PATCHES = 5,
	                GEOM_SCATTER = 6, GEOM_INDIRECT = 7, GEOM_MESH = 8 };
	/** @brief Builds and uploads this scene's static geometry into m_vbo according to m_geomKind (or, for GEOM_INDIRECT, allocates the empty capacity buffer a compute generator will fill every frame). */
	void buildGeometry();

	// ---- compute -> indirect draw ----
	// The generator is the scene's own "X.comp", opted into the same way as the
	// tessellation and geometry stages: by the file being there.
	char   *m_compFilename = 0;   ///< Path to this scene's optional X.comp generator shader (sibling of the fragment file); the file need not exist.
	GLuint  m_genProg      = 0;   // generator compute program (0 = none/failed)
	GLuint  m_cmdBuf       = 0;   // DrawArraysIndirectCommand, written on the GPU
	bool    m_genTried     = false;   ///< True once setupIndirect() has run; compilation is attempted exactly once and the outcome cached in m_genProg.
	int     m_meshCapacity = 0;   // vertices the VBO can hold
	/**
	 * @brief Compiles this scene's compute generator (and the process-shared clamp pass), and allocates the indirect command buffer plus, if requested, the persistent-state SSBO.
	 *
	 * Idempotent (guarded by m_genTried) and fails soft in every direction — missing compute
	 * support, no .comp file, or a compile error all simply leave the scene drawing nothing
	 * rather than aborting the app.
	 * @return true if the generator program is ready to be dispatched by runGenerator().
	 */
	bool    setupIndirect();
	/**
	 * @brief Dispatches this frame's compute generator run (one or two passes if it declares `genPass`), then clamps its vertex counter and inserts the memory barriers the vertex fetch / indirect draw / later readback all depend on.
	 * @param time Raw host time in seconds; the activation's time offset and speed factor are applied internally before upload.
	 */
	void    runGenerator( float time );
	int     m_genSpectro   = -1;  // cached: does the generator read texSpectro?

	/**
	 * @brief Cached uniform locations for m_genProg, so runGenerator() doesn't repeat ~18
	 *        glGetUniformLocation string lookups (plus one per registered Uniform/expr) every
	 *        frame -- the exact anti-pattern EffectShader::applyAudioFeatures's m_audioLocs
	 *        cache already exists to avoid for the fragment-stage program.
	 *
	 * A SEPARATE cache from that one is required (not a reuse of m_exprs' own
	 * ExprEntry::loc/progId fields): m_uniforms/m_exprs are inherited from EffectShader and are
	 * ALSO resolved every frame against m_sh_prog_id by applyAudioFeatures() for the fragment
	 * stage of this very scene, so a single shared progId-tagged cache slot per entry would
	 * thrash between the two programs every frame (m_sh_prog_id, then m_genProg, then back) and
	 * never actually hit.
	 */
	struct GenLocCache
	{
		GLuint progId       = 0;
		GLint  time         = -1, sceneSeed    = -1, audioAdvance = -1, audioLevel   = -1;
		GLint  audioBeat    = -1, audioKick    = -1, audioSubBass = -1, audioHigh    = -1;
		GLint  audioBass    = -1, audioMid     = -1, audioChroma  = -1, audioSpectrum= -1;
		GLint  texSpectro   = -1, spectroHead  = -1, spectroFill  = -1, maxVertices  = -1;
		GLint  frameIndex   = -1, genPass      = -1;
		// audioPhase/audioSwell were missing from this list while 10 compute
		// generators already declared and used them -- glGetUniformLocation was
		// never called for them, so they silently stayed 0 for the generator's
		// whole lifetime and that reactivity simply never happened.
		GLint  audioPhase   = -1, audioSwell   = -1;
		// The scene clocks were missing too: a generator declaring sceneAdvance /
		// sceneTime / sceneProgress read 0 forever (StarlingMurmuration's flow
		// field never moved, DysonSwarmConstruction never assembled).
		GLint  sceneAdvance = -1, sceneTime    = -1, sceneProgress = -1;
	};
	GenLocCache m_genLocs;
	std::vector<GLint> m_genUniformLocs; ///< Parallel to m_uniforms, resolved for m_genProg (refreshed alongside m_genLocs).
	std::vector<GLint> m_genExprLocs;    ///< Parallel to m_exprs, resolved for m_genProg (refreshed alongside m_genLocs).

	// ---- persistent generator state ----
	// A buffer that SURVIVES between frames, bound at SSBO 2.  Every generator
	// so far derives its whole output from the current frame's inputs, which is
	// why they need nothing but a scratch vertex buffer.  A growing structure
	// cannot: what it looks like now depends on what it did before.  Requested
	// with the stateBytes attribute; zeroed once, then never touched by the
	// host again.
	GLuint  m_stateBuf   = 0;   ///< Persistent SSBO (bind point 2) surviving across frames for a stateful generator; 0 if unused.
	int     m_stateBytes = 0;   ///< Requested size of m_stateBuf in bytes (0 = no persistent state); set via setStateBytes().
	int     m_genPassCount = 0;   ///< Number of compute passes runGenerator() dispatches (0 = original 1-or-2-pass behaviour); set via setGenPassCount().
	unsigned int m_frameIndex = 0;   ///< Running frame counter uploaded to the generator as `frameIndex`; incremented once per runGenerator() call.
	AudioFeatures m_lastAudio;    ///< this scene's features, for the generator
	float   m_lastTime     = 0.f; ///< raw time from setUniforms, ditto
	float   m_shadowExtent = EffectShader::kShadowExtent;   ///< This scene's shadow-map light box half-width (see setShadowExtent()/shadowExtent()).
	// The counter-clamp pass is identical for every indirect scene, so it is
	// compiled once for the process.
	static GLuint s_clampProg;   ///< Shared "IndirectClamp.comp" program that clamps a generator's overflowed vertex counter back into range; compiled once for the whole process.

	// Optional pipeline stages, named after the fragment shader
	// (X.frag -> X.tesc / X.tese / X.geom).  A scene opts in by the file
	// simply EXISTING; absent files leave the stage out of the program.
	char *m_tescFilename = nullptr;   ///< Sibling X.tesc filename (tessellation control stage); used only if the file exists on disk.
	char *m_teseFilename = nullptr;   ///< Sibling X.tese filename (tessellation evaluation stage); used only if the file exists on disk.
	char *m_geomFilename = nullptr;   ///< Sibling X.geom filename (geometry-shader stage); used only if the file exists on disk.
	/** @brief Rolls a fresh per-activation epoch: scene seed, large time offset, mild (±20%) speed factor and hue offset, all held constant for the whole activation so nothing flickers. */
	void rollVariation();

	int    m_geomKind    = GEOM_POINTS;   ///< This instance's GeomKind, fixed at construction from the preset's geom= attribute.
	GLuint m_vbo         = 0;   ///< Vertex buffer holding this scene's geometry (host-built for most kinds; GPU-filled every frame for GEOM_INDIRECT).
	GLuint m_vao         = 0;   // core profile: attrib state container
	int    m_vertexCount = 0;   ///< Vertex count in m_vbo to draw (meaningless for GEOM_INDIRECT, whose count instead lives in m_cmdBuf on the GPU).

	// ---- GEOM_MESH: a real loaded model instead of procedural geometry ----
	std::string m_modelPath;          ///< Config attribute model=; path to the .glb/.gltf/.obj this scene loads. Empty for every other geom kind.
	GLuint m_meshMaterialTex   = 0;   ///< sampler2DArray built from the loaded mesh's material (0 = none loaded, or the mesh had no material) -- see MeshImport.h.
	int    m_meshMaterialLayers = 0;  ///< Layers actually populated in m_meshMaterialTex (0, 1 or 2); also doubles as "material texture ready" for draw().
	// An earlier audit of every texture unit this engine reserves claimed
	// unit 2 was free; it was wrong -- GpuSims.cpp and PresentPass.cpp both
	// bind there (found the hard way: a mesh scene's own material silently
	// read whatever GpuSims/PresentPass had last bound to unit 2 instead of
	// its own texture, since nothing here overwrites the *sampler uniform*
	// on every unrelated program that might be current when some other
	// class's own draw call runs). 36 sits safely past every other literal
	// GL_TEXTUREn / GL_TEXTURE0+n this codebase uses (checked directly: 0-12,
	// 28-30, 33-35) -- legal because what actually gates a unit NUMBER is
	// GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS (192 here), not the much smaller
	// GL_MAX_TEXTURE_IMAGE_UNITS (32) that only caps samplers per shader
	// stage -- see RenderPipeline::initGLSL()'s own budget diagnostic, whose
	// kHighestUnitUsed constant this bumped from 35 to 36. Fixed rather than
	// auto-assigned: every mesh scene needs the SAME unit reserved, the same
	// way texSpectro is always unit 28.
	static const int kMeshMaterialTexUnit = 36;

	// ---- optional SECOND model (config attribute model2=) ----
	// For scenes that stage two objects against each other -- a ship coming
	// alongside a station is the motivating case, and it only works if the
	// two are separate meshes that can be scaled and moved independently.
	// Both land in the same VBO, one after the other; see buildGeometry()
	// for the three-run layout and why it stays compatible with every
	// existing single-model shader.
	std::string m_modelPath2;            ///< Config attribute model2=; empty for a single-model scene.

	// ---- asynchronous warm-up state ----
	// The worker writes the assets while the state is WARM_LOADING and
	// publishes with a release-store of WARM_READY; the render thread reads
	// the state with acquire before touching the assets, so no further lock
	// is needed on the payload itself.
	enum { WARM_NONE = 0, WARM_QUEUED, WARM_LOADING, WARM_READY, WARM_CONSUMED };
	std::atomic<int> m_warmState { WARM_NONE };   ///< Warm-up lifecycle (see enum above).
	MeshAsset m_warmAsset;   ///< Prefetched model= payload; consumed (and freed) by buildGeometry().
	MeshAsset m_warmAsset2;  ///< Prefetched model2= payload, when the scene has one.
	bool m_warmOk  = false;  ///< loadMeshAsset() result for model=.
	bool m_warmOk2 = false;  ///< loadMeshAsset() result for model2=.

	/** @brief (Re)bakes the VAO against the current VBO. Split out of
	 *  initUniforms() because a deferred mesh build creates the VBO later, on
	 *  the frame the warm-up finishes -- the VAO bake has to be repeatable. */
	void bakeVao();
	int    m_mesh2VertexCount   = 0;     ///< First vertex of the sky shell; equals m_meshOwnVertexCount when there is no model2.
	GLuint m_meshMaterialTex2   = 0;     ///< sampler2DArray for model 2's material (0 = none).
	int    m_meshMaterialLayers2 = 0;    ///< Layers populated in m_meshMaterialTex2 (0, 1 or 2).
	GLint  m_mesh2VertexCountUni = -1;   ///< Location of the `mesh2VertexCount` uniform.
	GLint  m_meshMaterial2Uni    = -1;   ///< Location of the `texMeshMaterial2` uniform.
	GLint  m_meshMaterial2LayersUni = -1;///< Location of the `texMeshMaterialLayers2` uniform.
	static const int kMeshMaterial2TexUnit = 37;   ///< One past kMeshMaterialTexUnit; see that constant for why a high fixed unit is safe here.
	// A GEOM_MESH scene's VBO holds the loaded model's own vertices FIRST,
	// then a big enclosing "sky shell" (see buildGeometry()) so the object
	// reads against a real procedural backdrop (nebula/asteroid field/
	// planet) instead of flat black -- one draw call, one VAO, ordinary
	// depth testing puts the (much closer) object in front of the shell
	// automatically. m_meshOwnVertexCount is where the split falls; the
	// vertex shader reads it via gl_VertexID to pick which branch applies.
	/// Half-extents and centre of model 1 in its OWN object space, measured at
	/// load. Published as meshExtent/meshCenter so a mesh shader can size a
	/// sweep, a formation or an emission volume to the model it actually got
	/// rather than to a constant that only suits one asset. The generator
	/// normalises each asset so its LONGEST axis is about 1.0, which says
	/// nothing about the other two.
	float  m_meshExtent[3] = { 0.5f, 0.5f, 0.5f };
	float  m_meshCenter[3] = { 0.0f, 0.0f, 0.0f };
	/// The same for model2 (meshExtent2/meshCenter2). A two-object scene
	/// orients each from its OWN geometry: ShipDocking aligns the SHIP,
	/// which is model2, and using model1's extents there would point the
	/// ship along the station's longest axis.
	float  m_meshExtent2[3] = { 0.5f, 0.5f, 0.5f };
	float  m_meshCenter2[3] = { 0.0f, 0.0f, 0.0f };
	GLint  m_meshExtent2Uni = -1;
	GLint  m_meshCenter2Uni = -1;
	GLint  m_meshExtentUni = -1;
	GLint  m_meshCenterUni = -1;
	/// How many copies of the loaded mesh to draw (instances="N" on the scene
	/// entry; 1 = the ordinary single-object case). One upload, N draws, and
	/// the shader places each copy from gl_InstanceID. The sky shell lives in
	/// the SAME buffer, so a shader that asks for instances must skip the
	/// shell on every instance but the first, or it draws N backdrops over
	/// each other.
	int    m_meshInstances = 1;
	GLint  m_meshInstancesUni = -1;
	int    m_meshOwnVertexCount = 0;
	GLint  m_meshVertexCountUni = -1;   ///< Location of the `meshVertexCount` uniform (GEOM_MESH only).
	static const int kSkyShellRadius = 190;   ///< World-space radius of the sky shell; must clear the largest scaled-up mesh (see each geom="mesh" .vert's kModelScale) and stay under kSceneFar (220).
	GLint  m_projUni     = -1;   ///< Location of the `projM` (projection * camera-rig) matrix uniform.
	GLint  m_eyeUni      = -1;   ///< Location of the `eyeOff` stereo eye-offset uniform.
	// CAMERA RIG (formula layer, no shader edits): <expr> entries named
	// rigPitch/rigYaw/rigRoll/rigDolly (absolute, radians / world units) and
	// rigPitchV/rigYawV/rigRollV/rigDollyV (rates, HOST-INTEGRATED so an
	// audio-varying rate is jump-free per the anti-flicker rule) are
	// evaluated CPU-side in draw() and composed into projM.  Accumulators
	// for the V channels + the last integration time (draw() runs several
	// times per frame for shadow/OIT passes; integrate only on a NEW time).
	float  m_rigAcc[4]   = { 0.f, 0.f, 0.f, 0.f };   ///< Integrated camera-rig rate accumulators, indices [pitch, yaw, roll, dolly].
	float  m_rigLastT    = -1.0e9f;   ///< m_exprTime at the last rig-rate integration step; guards against double-integrating within one frame's multiple draw() calls (shadow/OIT passes).
	GLint  m_attrA       = -1;   ///< Location of the `attrA` vertex attribute (xyz = local corner/strip params, w = per-primitive index).
	GLint  m_attrB       = -1;   ///< Location of the `attrB` vertex attribute (four random seeds in [0,1)).
	GLint  m_seedUni     = -1;   ///< Location of the `sceneSeed` uniform.
	GLint  m_budgetUni   = -1;   ///< Location of the `cubeBudget` uniform.
	GLint  m_meshMaterialUni = -1;   ///< Location of the `texMeshMaterial` uniform (GEOM_MESH only; -1 if the fragment shader doesn't declare it).
	GLint  m_meshMaterialLayersUni = -1;   ///< Location of the `texMeshMaterialLayers` uniform: how many of texMeshMaterial's layers are actually populated (1 or 2), so a shader doesn't sample a metallic-roughness layer that was never uploaded -- a 2D array's `texture()` call clamps an out-of-range layer index rather than failing, so without this a 1-layer mesh would silently reread its base color as bogus roughness/metallic.
	float  m_eyeOffset   = 0.f;   ///< Current stereo eye offset in world units (0 = mono); set by setEyeOffset().

	// Per-activation variation state (see resetParameters()).
	float  m_sceneSeed   = 0.f;   ///< Generic per-activation seed uploaded as `sceneSeed`; some scenes use it structurally (sector counts, knot type).
	float  m_timeOffset  = 0.f;   ///< Per-activation large time offset added to the raw time, giving each activation a different camera/burst phase.
	float  m_speedFactor = 1.f;   ///< Per-activation speed multiplier (~0.82..1.18), constant for the whole activation.
	float  m_hueOffset   = 0.f;   ///< Per-activation hue rotation applied to chroma hue and audio rotation/advance phases.
};

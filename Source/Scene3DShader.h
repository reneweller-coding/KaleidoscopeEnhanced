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

#include "EffectShader.h"
#include <QtCore/QString>

class Scene3DShader : public EffectShader
{
public:
	Scene3DShader( const QString &filenameFragmentShader, const QString &geom,
	               unsigned int minTimeSolo, unsigned int maxTimeSolo,
	               unsigned int minTimeInterpolation, unsigned int maxTimeInterpolation );
	~Scene3DShader();

	void initUniforms( int width, int height ) override;
	void draw() override;
	bool is3D() const override { return true; }

	// PER-ACTIVATION VARIETY: every time the scene is (re)activated it rolls
	// a fresh epoch — a large time offset (different camera/burst phases), a
	// mild speed factor (±20 %, constant within the activation so nothing
	// flickers), a hue rotation and a generic `sceneSeed` uniform some scenes
	// use structurally (sector counts, knot type).  The same scene becomes a
	// whole family of variations.
	void resetParameters() override;
	// Also true when only the compute generator reads the spectrogram — the
	// base class can only see the render program.
	bool usesSpectro() override;
	void  setShadowExtent( float e ) { m_shadowExtent = e; }
	float shadowExtent() const override { return m_shadowExtent; }
	void setUniforms( float time, float interpolation,
	                  GLint texLoc1, GLint texLoc2 ) override;
	void applyAudioFeatures( const AudioFeatures &f );

	// True-stereo eye offset in world units (0 = mono).  Set by the host
	// between the two per-eye draw() calls.
	void setEyeOffset( float e ) { m_eyeOffset = e; }

	// FPS-driven detail budget for the heavy cube scenes (1.0 = all cubes,
	// 0.5 = every 2nd).  Maintained by FilterShader from the frame rate.
	static float s_cubeBudget;

private:
	// GEOM_PATCHES feeds GL_PATCHES (4 control points per quad) instead of
	// triangles, which is the only geometry a tessellation stage can consume.
	// GEOM_SCATTER is the same point cloud as GEOM_POINTS but drawn opaque and
	// depth-tested, for geometry shaders that grow each point into a solid body
	// (grass, hair, shards) — those must occlude each other, not add up.
	// GEOM_INDIRECT has NO host-built geometry at all: a compute shader writes
	// the vertices and the draw call's own argument list into buffers, and the
	// vertex count never travels back to the CPU.  See runGenerator().
	enum GeomKind { GEOM_POINTS = 0, GEOM_CUBES = 1, GEOM_RIBBON = 2,
	                GEOM_GRID = 3, GEOM_QUADS = 4, GEOM_PATCHES = 5,
	                GEOM_SCATTER = 6, GEOM_INDIRECT = 7 };
	void buildGeometry();

	// ---- compute -> indirect draw ----
	// The generator is the scene's own "X.comp", opted into the same way as the
	// tessellation and geometry stages: by the file being there.
	char   *m_compFilename = 0;
	GLuint  m_genProg      = 0;   // generator compute program (0 = none/failed)
	GLuint  m_cmdBuf       = 0;   // DrawArraysIndirectCommand, written on the GPU
	bool    m_genTried     = false;
	int     m_meshCapacity = 0;   // vertices the VBO can hold
	bool    setupIndirect();      // allocate buffers + compile the generator
	void    runGenerator( float time );
	int     m_genSpectro   = -1;  // cached: does the generator read texSpectro?
	AudioFeatures m_lastAudio;    // this scene's features, for the generator
	float   m_lastTime     = 0.f; // raw time from setUniforms, ditto
	float   m_shadowExtent = EffectShader::kShadowExtent;
	// The counter-clamp pass is identical for every indirect scene, so it is
	// compiled once for the process.
	static GLuint s_clampProg;

	// Optional pipeline stages, named after the fragment shader
	// (X.frag -> X.tesc / X.tese / X.geom).  A scene opts in by the file
	// simply EXISTING; absent files leave the stage out of the program.
	char *m_tescFilename = nullptr;
	char *m_teseFilename = nullptr;
	char *m_geomFilename = nullptr;
	void rollVariation();

	int    m_geomKind    = GEOM_POINTS;
	GLuint m_vbo         = 0;
	GLuint m_vao         = 0;   // core profile: attrib state container
	int    m_vertexCount = 0;
	GLint  m_projUni     = -1;
	GLint  m_eyeUni      = -1;
	GLint  m_attrA       = -1;
	GLint  m_attrB       = -1;
	GLint  m_seedUni     = -1;
	GLint  m_budgetUni   = -1;
	float  m_eyeOffset   = 0.f;

	// Per-activation variation state (see resetParameters()).
	float  m_sceneSeed   = 0.f;
	float  m_timeOffset  = 0.f;
	float  m_speedFactor = 1.f;
	float  m_hueOffset   = 0.f;
};

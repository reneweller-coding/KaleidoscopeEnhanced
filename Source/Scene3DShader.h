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

	// True-stereo eye offset in world units (0 = mono).  Set by the host
	// between the two per-eye draw() calls.
	void setEyeOffset( float e ) { m_eyeOffset = e; }

private:
	enum GeomKind { GEOM_POINTS = 0, GEOM_CUBES = 1, GEOM_RIBBON = 2,
	                GEOM_GRID = 3, GEOM_QUADS = 4 };
	void buildGeometry();

	int    m_geomKind    = GEOM_POINTS;
	GLuint m_vbo         = 0;
	int    m_vertexCount = 0;
	GLint  m_projUni     = -1;
	GLint  m_eyeUni      = -1;
	GLint  m_attrA       = -1;
	GLint  m_attrB       = -1;
	float  m_eyeOffset   = 0.f;
};

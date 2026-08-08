// Scene3DShader.cpp — see Scene3DShader.h.
#include "GLee.h"          // MUST come before any gl.h include (Qt's qopengl.h)
#include "shader_setup.h"
#include "Scene3DShader.h"

#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <vector>

#ifndef GL_POINT_SPRITE
#define GL_POINT_SPRITE 0x8861
#endif
#ifndef GL_VERTEX_PROGRAM_POINT_SIZE
#define GL_VERTEX_PROGRAM_POINT_SIZE 0x8642
#endif

// Deterministic hash — the geometry must be identical every run (the vertex
// shader animates it; re-rolled variety comes from the per-activation params).
static float hash01( unsigned int n )
{
	n = (n ^ 61u) ^ (n >> 16);
	n *= 9u;
	n = n ^ (n >> 4);
	n *= 0x27d4eb2du;
	n = n ^ (n >> 15);
	return float(n & 0xffffff) / float(0x1000000);
}

// FPS-driven cube budget (see FilterShader::paint's hysteresis).
float Scene3DShader::s_cubeBudget = 1.f;

static float rand01() { return float(qrand()) / float(RAND_MAX); }

// Roll a fresh activation epoch: time offset, gentle speed factor, hue
// rotation and the generic scene seed.  All CONSTANT within the activation
// (only derivatives matter for flicker — these have none).
void Scene3DShader::rollVariation()
{
	m_sceneSeed   = rand01();
	m_timeOffset  = rand01() * 900.f;
	m_speedFactor = 0.82f + 0.36f * rand01();
	m_hueOffset   = rand01() * 6.2831853f;
}

Scene3DShader::Scene3DShader( const QString &filenameFragmentShader, const QString &geom,
                              unsigned int minTimeSolo, unsigned int maxTimeSolo,
                              unsigned int minTimeInterpolation, unsigned int maxTimeInterpolation )
	: EffectShader( filenameFragmentShader, minTimeSolo, maxTimeSolo,
	                minTimeInterpolation, maxTimeInterpolation )
{
	if      ( geom == "cubes"  ) m_geomKind = GEOM_CUBES;
	else if ( geom == "ribbon" ) m_geomKind = GEOM_RIBBON;
	else if ( geom == "grid"   ) m_geomKind = GEOM_GRID;
	else if ( geom == "quads"  ) m_geomKind = GEOM_QUADS;
	else                         m_geomKind = GEOM_POINTS;

	rollVariation();

	// The matching vertex shader sits next to the fragment shader
	// ("..\Scene3D\X.frag" -> "..\Scene3D\X.vert").
	QString vert = filenameFragmentShader;
	vert.replace( ".frag", ".vert" );
	QByteArray vb = vert.toLocal8Bit();
	char *vname = (char *) malloc( sizeof(char) * (vb.size() + 1) );
	strcpy( vname, vb.constData() );
	m_vertexShaderFilename = vname;
}

Scene3DShader::~Scene3DShader()
{
	if( m_vbo )
		glDeleteBuffers( 1, &m_vbo );
}

void Scene3DShader::resetParameters()
{
	EffectShader::resetParameters();
	rollVariation();
}

// The variation is injected HOST-side so every scene benefits without shader
// edits: the time uniform gets this activation's epoch + speed, the audio
// phases and the key hue get constant offsets.
void Scene3DShader::setUniforms( float time, float interpolation,
                                 GLint texLoc1, GLint texLoc2 )
{
	EffectShader::setUniforms( m_timeOffset + time * m_speedFactor,
	                           interpolation, texLoc1, texLoc2 );
}

void Scene3DShader::applyAudioFeatures( const AudioFeatures &f )
{
	AudioFeatures v = f;
	v.chromaHue    = f.chromaHue + m_hueOffset;
	v.audioRotPhase = f.audioRotPhase + m_hueOffset * 3.1f;
	v.audioAdvance  = f.audioAdvance  + m_hueOffset * 2.3f;
	EffectShader::applyAudioFeatures( v );
}

// Interleaved layout: attrA.xyzw, attrB.xyzw = 8 floats per vertex.
void Scene3DShader::buildGeometry()
{
	std::vector<float> v;

	if( m_geomKind == GEOM_POINTS )
	{
		const int N = 60000;
		v.reserve( size_t(N) * 8 );
		for( int i = 0; i < N; ++i )
		{
			v.push_back( 0.f ); v.push_back( 0.f ); v.push_back( 0.f );
			v.push_back( float(i) );
			v.push_back( hash01( i * 4u + 0u ) );
			v.push_back( hash01( i * 4u + 1u ) );
			v.push_back( hash01( i * 4u + 2u ) );
			v.push_back( hash01( i * 4u + 3u ) );
		}
	}
	else if( m_geomKind == GEOM_CUBES )
	{
		// 4900 unit cubes (70 x 70 field), 36 vertices each.
		static const float C[36][3] = {
			{-.5f,-.5f,-.5f},{ .5f,-.5f,-.5f},{ .5f, .5f,-.5f},
			{-.5f,-.5f,-.5f},{ .5f, .5f,-.5f},{-.5f, .5f,-.5f},
			{-.5f,-.5f, .5f},{ .5f, .5f, .5f},{ .5f,-.5f, .5f},
			{-.5f,-.5f, .5f},{-.5f, .5f, .5f},{ .5f, .5f, .5f},
			{-.5f,-.5f,-.5f},{-.5f, .5f,-.5f},{-.5f, .5f, .5f},
			{-.5f,-.5f,-.5f},{-.5f, .5f, .5f},{-.5f,-.5f, .5f},
			{ .5f,-.5f,-.5f},{ .5f, .5f, .5f},{ .5f, .5f,-.5f},
			{ .5f,-.5f,-.5f},{ .5f,-.5f, .5f},{ .5f, .5f, .5f},
			{-.5f, .5f,-.5f},{ .5f, .5f,-.5f},{ .5f, .5f, .5f},
			{-.5f, .5f,-.5f},{ .5f, .5f, .5f},{-.5f, .5f, .5f},
			{-.5f,-.5f,-.5f},{ .5f,-.5f, .5f},{ .5f,-.5f,-.5f},
			{-.5f,-.5f,-.5f},{-.5f,-.5f, .5f},{ .5f,-.5f, .5f}
		};
		const int N = 4900;
		v.reserve( size_t(N) * 36 * 8 );
		for( int i = 0; i < N; ++i )
			for( int k = 0; k < 36; ++k )
			{
				v.push_back( C[k][0] ); v.push_back( C[k][1] ); v.push_back( C[k][2] );
				v.push_back( float(i) );
				v.push_back( hash01( i * 4u + 0u ) );
				v.push_back( hash01( i * 4u + 1u ) );
				v.push_back( hash01( i * 4u + 2u ) );
				v.push_back( hash01( i * 4u + 3u ) );
			}
	}
	else if( m_geomKind == GEOM_GRID )
	{
		// A 220 x 120 heightfield mesh (two triangles per cell); per-vertex
		// u/v in attrA.xy, per-cell seeds in attrB — terrain-style scenes.
		const int W = 220, H = 120;
		v.reserve( size_t(W) * H * 6 * 8 );
		for( int cy = 0; cy < H; ++cy )
			for( int cx = 0; cx < W; ++cx )
			{
				const float u0 = float(cx)     / float(W);
				const float u1 = float(cx + 1) / float(W);
				const float w0 = float(cy)     / float(H);
				const float w1 = float(cy + 1) / float(H);
				const float q[6][2] = {
					{ u0, w0 }, { u1, w0 }, { u1, w1 },
					{ u0, w0 }, { u1, w1 }, { u0, w1 }
				};
				const unsigned int cell = (unsigned int)( cy * W + cx );
				for( int k = 0; k < 6; ++k )
				{
					v.push_back( q[k][0] ); v.push_back( q[k][1] );
					v.push_back( 0.f );
					v.push_back( float(cell) );
					v.push_back( hash01( cell * 4u + 0u ) );
					v.push_back( hash01( cell * 4u + 1u ) );
					v.push_back( hash01( cell * 4u + 2u ) );
					v.push_back( hash01( cell * 4u + 3u ) );
				}
			}
	}
	else if( m_geomKind == GEOM_QUADS )
	{
		// 3000 unit quads (photo cards / shards / tiles), two triangles each;
		// corner u/v in attrA.xy, per-quad seeds in attrB.
		const int N = 3000;
		v.reserve( size_t(N) * 6 * 8 );
		static const float q[6][2] = {
			{ 0.f, 0.f }, { 1.f, 0.f }, { 1.f, 1.f },
			{ 0.f, 0.f }, { 1.f, 1.f }, { 0.f, 1.f }
		};
		for( int i = 0; i < N; ++i )
			for( int k = 0; k < 6; ++k )
			{
				v.push_back( q[k][0] ); v.push_back( q[k][1] );
				v.push_back( 0.f );
				v.push_back( float(i) );
				v.push_back( hash01( i * 4u + 0u ) );
				v.push_back( hash01( i * 4u + 1u ) );
				v.push_back( hash01( i * 4u + 2u ) );
				v.push_back( hash01( i * 4u + 3u ) );
			}
	}
	else  // GEOM_RIBBON: 20 ribbons x 300 segments, two triangles per segment.
	{
		const int M = 20, S = 300;
		v.reserve( size_t(M) * S * 6 * 8 );
		for( int r = 0; r < M; ++r )
			for( int s = 0; s < S; ++s )
			{
				const float t0 = float(s)     / float(S);
				const float t1 = float(s + 1) / float(S);
				// Two triangles of the (t0..t1) x (side -1..+1) quad.
				const float quad[6][2] = {
					{ t0, -1.f }, { t1, -1.f }, { t1,  1.f },
					{ t0, -1.f }, { t1,  1.f }, { t0,  1.f }
				};
				for( int k = 0; k < 6; ++k )
				{
					v.push_back( quad[k][0] ); v.push_back( quad[k][1] );
					v.push_back( 0.f );
					v.push_back( float(r) );
					v.push_back( hash01( r * 4u + 0u ) );
					v.push_back( hash01( r * 4u + 1u ) );
					v.push_back( hash01( r * 4u + 2u ) );
					v.push_back( hash01( r * 4u + 3u ) );
				}
			}
	}

	m_vertexCount = int( v.size() / 8 );
	if( m_vbo == 0 )
		glGenBuffers( 1, &m_vbo );
	glBindBuffer( GL_ARRAY_BUFFER, m_vbo );
	glBufferData( GL_ARRAY_BUFFER, GLsizeiptr(v.size() * sizeof(float)),
	              v.data(), GL_STATIC_DRAW );
	glBindBuffer( GL_ARRAY_BUFFER, 0 );
}

void Scene3DShader::initUniforms( int width, int height )
{
	m_width  = width;
	m_height = height;

	// NOT the base initUniforms: setShaders() is deliberately fragment-only
	// (the classic effects run on the fixed-function vertex path) — a real
	// 3D scene needs its vertex shader actually attached.
	m_sh_prog_id       = setShadersVF( m_vertexShaderFilename, m_fragmentShaderFilename );
	m_texPointUni1     = glGetUniformLocation( m_sh_prog_id, "tex0" );
	m_texPointUni2     = glGetUniformLocation( m_sh_prog_id, "tex1" );
	m_texSizeRcpUni    = glGetUniformLocation( m_sh_prog_id, "resolution" );
	m_timeUni          = glGetUniformLocation( m_sh_prog_id, "time" );
	m_interpolationUni = glGetUniformLocation( m_sh_prog_id, "interpolation" );
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->initUniform( m_sh_prog_id );

	m_projUni   = glGetUniformLocation( m_sh_prog_id, "projM" );
	m_eyeUni    = glGetUniformLocation( m_sh_prog_id, "eyeOff" );
	m_seedUni   = glGetUniformLocation( m_sh_prog_id, "sceneSeed" );
	m_budgetUni = glGetUniformLocation( m_sh_prog_id, "cubeBudget" );
	m_attrA   = glGetAttribLocation( m_sh_prog_id, "attrA" );
	m_attrB   = glGetAttribLocation( m_sh_prog_id, "attrB" );

	if( m_vbo == 0 )
		buildGeometry();

	checkGLErrors( "Scene3DShader::initUniforms" );
}

void Scene3DShader::draw()
{
	// Perspective projection (55° vertical FOV, near 0.5, far 220).  The
	// aspect uses the FULL frame even for a half-viewport stereo eye — the
	// display/HMD player unsqueezes the halves back to full width.
	const float fovY = 55.f * 3.14159265f / 180.f;
	const float aspect = (m_height > 0) ? float(m_width) / float(m_height) : 1.f;
	const float zn = 0.5f, zf = 220.f;
	const float f = 1.f / tanf( fovY * 0.5f );
	float proj[16] = {
		f / aspect, 0.f, 0.f,                            0.f,
		0.f,        f,   0.f,                            0.f,
		0.f,        0.f, (zf + zn) / (zn - zf),         -1.f,
		0.f,        0.f, (2.f * zf * zn) / (zn - zf),    0.f
	};

	if( m_projUni   >= 0 ) glUniformMatrix4fv( m_projUni, 1, GL_FALSE, proj );
	if( m_eyeUni    >= 0 ) glUniform1f( m_eyeUni,    m_eyeOffset );
	if( m_seedUni   >= 0 ) glUniform1f( m_seedUni,   m_sceneSeed );
	if( m_budgetUni >= 0 ) glUniform1f( m_budgetUni, s_cubeBudget );

	// Clear colour AND depth (scissored to the eye viewport in true stereo).
	glClearColor( 0.f, 0.f, 0.f, 1.f );
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );

	glBindBuffer( GL_ARRAY_BUFFER, m_vbo );
	if( m_attrA >= 0 )
	{
		glEnableVertexAttribArray( GLuint(m_attrA) );
		glVertexAttribPointer( GLuint(m_attrA), 4, GL_FLOAT, GL_FALSE,
		                       8 * sizeof(float), (const void *) 0 );
	}
	if( m_attrB >= 0 )
	{
		glEnableVertexAttribArray( GLuint(m_attrB) );
		glVertexAttribPointer( GLuint(m_attrB), 4, GL_FLOAT, GL_FALSE,
		                       8 * sizeof(float), (const void *) (4 * sizeof(float)) );
	}

	if( m_geomKind == GEOM_CUBES || m_geomKind == GEOM_GRID
	 || m_geomKind == GEOM_QUADS )
	{
		// Solid geometry: depth-tested, opaque.
		glEnable( GL_DEPTH_TEST );
		glDisable( GL_BLEND );
		glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
		glDisable( GL_DEPTH_TEST );
	}
	else
	{
		// Glowing geometry: additive, order-independent (no depth test).
		glDisable( GL_DEPTH_TEST );
		glEnable( GL_BLEND );
		glBlendFunc( GL_ONE, GL_ONE );
		if( m_geomKind == GEOM_POINTS )
		{
			glEnable( GL_POINT_SPRITE );
			glEnable( GL_VERTEX_PROGRAM_POINT_SIZE );
			glDrawArrays( GL_POINTS, 0, m_vertexCount );
			glDisable( GL_VERTEX_PROGRAM_POINT_SIZE );
			glDisable( GL_POINT_SPRITE );
		}
		else
			glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
		glDisable( GL_BLEND );
	}

	if( m_attrA >= 0 ) glDisableVertexAttribArray( GLuint(m_attrA) );
	if( m_attrB >= 0 ) glDisableVertexAttribArray( GLuint(m_attrB) );
	glBindBuffer( GL_ARRAY_BUFFER, 0 );

	checkGLErrors( "Scene3DShader::draw" );
}

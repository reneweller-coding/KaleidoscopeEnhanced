/**
 * @file Scene3DShader.cpp
 * @brief Implementation of Scene3DShader: per-geom-kind procedural mesh generation, the compute-generator ("indirect") pipeline, the CPU-side formula-driven camera rig, and the per-geom-kind draw state (blend/depth, shadow pass, OIT pass).
 */
// Scene3DShader.cpp — see Scene3DShader.h.
#include "glcore.h"          // MUST come before any gl.h include (Qt's qopengl.h)
#include "shader_setup.h"
#include "Scene3DShader.h"
#include "MeshImport.h"

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

/**
 * @brief Deterministic integer hash producing a pseudo-random float in [0,1).
 *
 * The geometry must be identical every run (the vertex shader animates it; re-rolled variety
 * comes from the per-activation params), so this is a fixed bit-mixing hash rather than a PRNG
 * with hidden state.
 * @param n Input key (typically a vertex/primitive index combined with a small seed slot).
 * @return Pseudo-random value in [0,1).
 */
static float hash01( unsigned int n )
{
	n = (n ^ 61u) ^ (n >> 16);
	n *= 9u;
	n = n ^ (n >> 4);
	n *= 0x27d4eb2du;
	n = n ^ (n >> 15);
	return float(n & 0xffffff) / float(0x1000000);
}

// FPS-driven cube budget (see RenderPipeline::paint's hysteresis).
float Scene3DShader::s_cubeBudget = 1.f;

// Shared by all geom="indirect" scenes (see setupIndirect()).
GLuint Scene3DShader::s_clampProg = 0;

/** @brief Basic uniform random float in [0,1) using the C standard library RNG (used only for one-shot per-activation rolls, not per-vertex geometry). @return Pseudo-random value in [0,1). */
static float rand01() { return float(rand()) / float(RAND_MAX); }

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

Scene3DShader::Scene3DShader( const std::string &filenameFragmentShader, const std::string &geom,
                              unsigned int minTimeSolo, unsigned int maxTimeSolo,
                              unsigned int minTimeInterpolation, unsigned int maxTimeInterpolation )
	: EffectShader( filenameFragmentShader, minTimeSolo, maxTimeSolo,
	                minTimeInterpolation, maxTimeInterpolation )
{
	if      ( geom == "cubes"   ) m_geomKind = GEOM_CUBES;
	else if ( geom == "ribbon"  ) m_geomKind = GEOM_RIBBON;
	else if ( geom == "grid"    ) m_geomKind = GEOM_GRID;
	else if ( geom == "quads"   ) m_geomKind = GEOM_QUADS;
	else if ( geom == "patches" ) m_geomKind = GEOM_PATCHES;
	else if ( geom == "scatter" ) m_geomKind = GEOM_SCATTER;
	else if ( geom == "indirect") m_geomKind = GEOM_INDIRECT;
	else if ( geom == "mesh"    ) m_geomKind = GEOM_MESH;
	else                          m_geomKind = GEOM_POINTS;

	rollVariation();

	// The matching vertex shader sits next to the fragment shader
	// ("..\Scene3D\X.frag" -> "..\Scene3D\X.vert").
	// sibling(): replaces the ".frag" suffix with another extension and
	// returns a malloc'd C string, matching the ownership convention of
	// EffectShader::m_vertexShaderFilename / m_fragmentShaderFilename (plain
	// char* rather than std::string) so this class can be freed the same way.
	auto sibling = []( const std::string &frag, const char *ext ) -> char *
	{
		std::string s = frag;
		size_t p = s.rfind( ".frag" );
		if( p != std::string::npos )
			s.replace( p, 5, ext );
		char *out = (char *) malloc( sizeof(char) * (s.size() + 1) );
		strcpy( out, s.c_str() );
		return out;
	};

	m_vertexShaderFilename = sibling( filenameFragmentShader, ".vert" );
	// Optional stages: named, but only used if the file actually exists.
	m_tescFilename = sibling( filenameFragmentShader, ".tesc" );
	m_teseFilename = sibling( filenameFragmentShader, ".tese" );
	m_geomFilename = sibling( filenameFragmentShader, ".geom" );
	m_compFilename = sibling( filenameFragmentShader, ".comp" );
}

Scene3DShader::~Scene3DShader()
{
	if( m_vbo )
		glDeleteBuffers( 1, &m_vbo );
	if( m_cmdBuf )
		glDeleteBuffers( 1, &m_cmdBuf );
	if( m_stateBuf )
		glDeleteBuffers( 1, &m_stateBuf );
	if( m_genProg )
		glDeleteProgram( m_genProg );
	if( m_meshMaterialTex )
		glDeleteTextures( 1, &m_meshMaterialTex );
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
	m_lastTime = time;      // the indirect generator needs it in draw()
}

void Scene3DShader::applyAudioFeatures( const AudioFeatures &f )
{
	AudioFeatures v = f;
	// Different (non-1:1) multipliers on rotation vs. advance phase so the
	// three offset channels drift out of lockstep with each other across
	// activations, instead of every hue-driven phase just being m_hueOffset
	// again under a different name.
	v.chromaHue    = f.chromaHue + m_hueOffset;
	v.audioRotPhase = f.audioRotPhase + m_hueOffset * 3.1f;
	v.audioAdvance  = f.audioAdvance  + m_hueOffset * 2.3f;
	EffectShader::applyAudioFeatures( v );
	// Kept for the indirect generator, which is a separate program and so is
	// not reached by the shared uniform upload above.
	m_lastAudio = v;
}

// A generator can sample the host's data textures too, and the host only
// uploads and binds those while something on screen actually wants them.  The
// base class only inspects the render program, so a scene whose ONLY reader is
// its compute generator would find unit 28 empty.
bool Scene3DShader::usesSpectro()
{
	if( EffectShader::usesSpectro() )
		return true;
	if( m_genSpectro < 0 )
		m_genSpectro = ( m_genProg != 0 &&
		                 glGetUniformLocation( m_genProg, "texSpectro" ) >= 0 ) ? 1 : 0;
	return m_genSpectro == 1;
}

// Interleaved layout: attrA.xyzw, attrB.xyzw = 8 floats per vertex.
void Scene3DShader::buildGeometry()
{
	std::vector<float> v;

	if( m_geomKind == GEOM_INDIRECT )
	{
		// Nothing to build: setupIndirect() allocates an empty vertex buffer
		// that a compute shader fills every frame.  Returning here keeps the
		// vector empty, and the code below uploads a zero-sized buffer, which
		// setupIndirect() then resizes.
	}
	else if( m_geomKind == GEOM_POINTS || m_geomKind == GEOM_SCATTER )
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
	else if( m_geomKind == GEOM_PATCHES )
	{
		// A 64 x 64 field of QUAD PATCHES — four control points each, in CCW
		// order, which is what a tessellation control shader consumes.  The
		// corners carry their global (u,v) so the evaluation shader can place
		// and displace them; the actual triangle count is decided on the GPU.
		const int W = 64, H = 64;
		v.reserve( size_t(W) * H * 4 * 8 );
		for( int cy = 0; cy < H; ++cy )
			for( int cx = 0; cx < W; ++cx )
			{
				const float u0 = float(cx)     / float(W);
				const float u1 = float(cx + 1) / float(W);
				const float w0 = float(cy)     / float(H);
				const float w1 = float(cy + 1) / float(H);
				const float c[4][2] = {
					{ u0, w0 }, { u1, w0 }, { u1, w1 }, { u0, w1 }
				};
				const unsigned int cell = (unsigned int)( cy * W + cx );
				for( int k = 0; k < 4; ++k )
				{
					v.push_back( c[k][0] ); v.push_back( c[k][1] );
					v.push_back( 0.f );
					v.push_back( float(cell) );
					v.push_back( hash01( cell * 4u + 0u ) );
					v.push_back( hash01( cell * 4u + 1u ) );
					v.push_back( hash01( cell * 4u + 2u ) );
					v.push_back( hash01( cell * 4u + 3u ) );
				}
			}
	}
	else if( m_geomKind == GEOM_MESH )
	{
		// The only non-procedural kind: v comes from a real file instead of a
		// generated pattern, but still lands in the same 8-floats-per-vertex
		// layout (attrA.xyz=pos/.w=U, attrB.xyz=normal/.w=V) every other kind
		// uses, so the upload code below needs no branch of its own.
		MeshAsset asset;
		if( loadMeshAsset( m_modelPath, asset ) )
		{
			v = std::move( asset.vertices );
			if( asset.materialLayers > 0 )
			{
				if( m_meshMaterialTex == 0 )
					glGenTextures( 1, &m_meshMaterialTex );
				glBindTexture( GL_TEXTURE_2D_ARRAY, m_meshMaterialTex );
				glTexImage3D( GL_TEXTURE_2D_ARRAY, 0, GL_RGBA8,
				              asset.materialW, asset.materialH, asset.materialLayers,
				              0, GL_RGBA, GL_UNSIGNED_BYTE, asset.materialRGBA.data() );
				glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
				glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
				glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_REPEAT );
				glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_REPEAT );
				glGenerateMipmap( GL_TEXTURE_2D_ARRAY );
				glBindTexture( GL_TEXTURE_2D_ARRAY, 0 );
				m_meshMaterialLayers = asset.materialLayers;
			}
		}
		else
		{
			fprintf( stderr, "Scene3DShader: failed to load mesh '%s'\n", m_modelPath.c_str() );
		}

		// Append a big enclosing "sky shell" after the loaded mesh's own
		// vertices (same 36-corner unit-cube table GEOM_CUBES builds,
		// scaled way up and centered on the origin, NOT on the mesh's own
		// on-screen position) -- every geom="mesh" scene now renders
		// against this procedural backdrop instead of flat black. Skipped
		// if the mesh itself failed to load (v is empty; m_meshOwnVertexCount
		// stays 0), matching this class's existing fail-soft convention.
		// attrB carries the outward DIRECTION here (not a real lighting
		// normal) -- each geom="mesh" fragment shader uses it as the "sky
		// direction" for procedural nebula/asteroid-field/planet noise.
		if( !v.empty() )
		{
			m_meshOwnVertexCount = int( v.size() / 8 );
			static const float SC[36][3] = {
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
			const float kSide = 2.f * float( kSkyShellRadius );   // corners are +-0.5 -> +-R
			for( int k = 0; k < 36; ++k )
			{
				const float px = SC[k][0] * kSide, py = SC[k][1] * kSide, pz = SC[k][2] * kSide;
				const float len = sqrtf( px * px + py * py + pz * pz );
				v.push_back( px );          v.push_back( py );          v.push_back( pz );          v.push_back( 0.f );
				v.push_back( px / len );    v.push_back( py / len );    v.push_back( pz / len );    v.push_back( 0.f );
			}
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
	if( m_geomKind == GEOM_INDIRECT )
	{
		// Room for the generator's output.  GL_DYNAMIC_COPY says what actually
		// happens to this buffer: written by the GPU, read by the GPU, never
		// touched by the CPU at all.
		//
		// 200k triangles is several times what an isosurface over a 64^3 field
		// produces, which is the headroom a generator needs to stay safe on a
		// loud frame.  MUST stay a multiple of 3 — the overflow guard relies on
		// a three-vertex reservation either fitting entirely or starting at or
		// past the end, so that no half-written triangle lands inside the
		// clamped range.  Allocated lazily, on the scene's first appearance.
		m_meshCapacity = 600000;                       // vertices (19.2 MB)
		glBufferData( GL_ARRAY_BUFFER,
		              GLsizeiptr(size_t(m_meshCapacity) * 8 * sizeof(float)),
		              NULL, GL_DYNAMIC_COPY );
	}
	else
	{
		glBufferData( GL_ARRAY_BUFFER, GLsizeiptr(v.size() * sizeof(float)),
		              v.data(), GL_STATIC_DRAW );
	}
	glBindBuffer( GL_ARRAY_BUFFER, 0 );
}

// Compile the scene's generator and allocate the indirect command buffer.
// Fails soft in every direction: no compute support, no .comp file, a compile
// error — the scene simply draws nothing rather than taking the app down.
bool Scene3DShader::setupIndirect()
{
	if( m_genTried )
		return m_genProg != 0;
	m_genTried = true;

	if( !glcoreHasCompute || !glDrawArraysIndirect || !m_compFilename )
		return false;

	m_genProg = setComputeShader( m_compFilename );      // 0 on any failure
	if( m_genProg == 0 )
		return false;

	// The clamp pass is shared by every indirect scene, so it is compiled once
	// for the whole process.
	if( s_clampProg == 0 )
		s_clampProg = setComputeShader( "..\\Engine\\IndirectClamp.comp" );
	if( s_clampProg == 0 )
	{
		glDeleteProgram( m_genProg );
		m_genProg = 0;
		return false;
	}

	// DrawArraysIndirectCommand = { count, instanceCount, first, baseInstance },
	// plus a fifth slot the generator counts into.  instanceCount/first/
	// baseInstance are set once here and never change.  This is the whole point
	// of the indirect path: the vertex count is produced and consumed on the
	// GPU, so the CPU never has to wait for a readback to learn how much
	// geometry there is.
	const GLuint cmd[8] = { 0u, 1u, 0u, 0u, 0u, 0u, 0u, 0u };
	glGenBuffers( 1, &m_cmdBuf );
	glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
	glBufferData( GL_DRAW_INDIRECT_BUFFER, sizeof(cmd), cmd, GL_DYNAMIC_COPY );
	glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );

	// Persistent state, zeroed exactly once.  From here it belongs entirely to
	// the generator; the host never reads or writes it again, which is what
	// makes it cheap — no readback, no synchronisation, no per-frame upload.
	//
	// The zeroing goes through a CPU-side buffer rather than glClearBufferData.
	// It is a few hundred kilobytes, once, at scene load — while a state buffer
	// that came up holding whatever the driver left behind is a generator that
	// starts from garbage, and the symptom of that is a scene that looks wrong
	// on some machines and fine on others.
	if( m_stateBytes > 0 )
	{
		std::vector<unsigned char> zero( size_t(m_stateBytes), 0 );
		glGenBuffers( 1, &m_stateBuf );
		glBindBuffer( GL_SHADER_STORAGE_BUFFER, m_stateBuf );
		glBufferData( GL_SHADER_STORAGE_BUFFER, GLsizeiptr(m_stateBytes),
		              &zero[0], GL_DYNAMIC_COPY );
		glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );
	}
	return true;
}

// Run the generator, clamp its counter, and fence the results for both the
// vertex fetch and the indirect command fetch.  The raw counter is reset by the
// clamp pass, so there is no CPU-side buffer touch here at all.
void Scene3DShader::runGenerator( float time )
{
	glUseProgram( m_genProg );

	// The generator is a SECOND program, so it does not get the shared audio
	// uniforms.  It takes a deliberately small set by hand, plus the scene's
	// own preset <float> params looked up by name — which is what lets a
	// generator be tuned from the preset exactly like the render stages.
	// Per-program location cache (mirrors EffectShader::applyAudioFeatures's
	// m_audioLocs -- see GenLocCache's doc comment in the header for why this
	// is a SEPARATE cache rather than a reuse of m_exprs' own loc/progId
	// fields). Re-resolved once whenever m_genProg changes (first run, or a
	// hot-reload recompile), never per frame.
	if( m_genLocs.progId != m_genProg )
	{
		GLuint p = m_genProg;
		m_genLocs.time          = glGetUniformLocation( p, "time" );
		m_genLocs.sceneSeed     = glGetUniformLocation( p, "sceneSeed" );
		m_genLocs.audioAdvance  = glGetUniformLocation( p, "audioAdvance" );
		m_genLocs.audioLevel    = glGetUniformLocation( p, "audioLevel" );
		m_genLocs.audioBeat     = glGetUniformLocation( p, "audioBeat" );
		m_genLocs.audioKick     = glGetUniformLocation( p, "audioKick" );
		m_genLocs.audioSubBass  = glGetUniformLocation( p, "audioSubBass" );
		m_genLocs.audioHigh     = glGetUniformLocation( p, "audioHigh" );
		m_genLocs.audioBass     = glGetUniformLocation( p, "audioBass" );
		m_genLocs.audioMid      = glGetUniformLocation( p, "audioMid" );
		m_genLocs.audioChroma   = glGetUniformLocation( p, "audioChroma" );
		m_genLocs.audioSpectrum = glGetUniformLocation( p, "audioSpectrum" );
		m_genLocs.audioPhase    = glGetUniformLocation( p, "audioPhase" );
		m_genLocs.audioSwell    = glGetUniformLocation( p, "audioSwell" );
		m_genLocs.texSpectro    = glGetUniformLocation( p, "texSpectro" );
		m_genLocs.spectroHead   = glGetUniformLocation( p, "spectroHead" );
		m_genLocs.spectroFill   = glGetUniformLocation( p, "spectroFill" );
		m_genLocs.maxVertices   = glGetUniformLocation( p, "maxVertices" );
		m_genLocs.frameIndex    = glGetUniformLocation( p, "frameIndex" );
		m_genLocs.genPass       = glGetUniformLocation( p, "genPass" );

		m_genUniformLocs.resize( m_uniforms.size() );
		for( size_t i = 0; i < m_uniforms.size(); ++i )
			m_genUniformLocs[i] = glGetUniformLocation( p, m_uniforms[i]->getName().c_str() );

		m_genExprLocs.resize( m_exprs.size() );
		for( size_t i = 0; i < m_exprs.size(); ++i )
			m_genExprLocs[i] = glGetUniformLocation( p, m_exprs[i].name.c_str() );

		m_genLocs.progId = m_genProg;
	}

	auto setF = [&]( GLint l, float v ) { if( l >= 0 ) glUniform1f( l, v ); };
	const AudioFeatures &a = m_lastAudio;      // already carries this scene's offsets
	setF( m_genLocs.time,         m_timeOffset + time * m_speedFactor );
	setF( m_genLocs.sceneSeed,    m_sceneSeed );
	setF( m_genLocs.audioAdvance, a.audioAdvance );
	setF( m_genLocs.audioLevel,   a.overallLevel );
	setF( m_genLocs.audioBeat,    a.beatDecay );
	setF( m_genLocs.audioKick,    a.onsetKick );
	setF( m_genLocs.audioSubBass, a.subBassLevel );
	setF( m_genLocs.audioHigh,    a.highLevel );
	setF( m_genLocs.audioBass,    a.bassLevel );
	setF( m_genLocs.audioMid,     a.midLevel );
	setF( m_genLocs.audioPhase,   a.audioRotPhase );
	setF( m_genLocs.audioSwell,   a.swell );
	if( m_genLocs.audioChroma >= 0 )
		glUniform1fv( m_genLocs.audioChroma, 12, a.chroma );
	if( m_genLocs.audioSpectrum >= 0 )
		glUniform1fv( m_genLocs.audioSpectrum, AudioFeatures::kSpectrumBands, a.spectrum );
	// The host binds the spectrogram to unit 28 whenever usesSpectro() says
	// somebody wants it — which, for an indirect scene, includes this program.
	if( m_genLocs.texSpectro >= 0 )
		glUniform1i( m_genLocs.texSpectro, 28 );
	setF( m_genLocs.spectroHead, a.spectroHead );
	setF( m_genLocs.spectroFill, a.spectroFill );
	if( m_genLocs.maxVertices >= 0 )
		glUniform1ui( m_genLocs.maxVertices, GLuint(m_meshCapacity) );
	for( size_t i = 0; i < m_uniforms.size(); ++i )
		setF( m_genUniformLocs[i], m_uniforms[i]->snapshotValue() );

	// FORMULA-LAYER CONSISTENCY: the render stages get their uniforms
	// remapped by the formula layer — applyAudioFeatures evaluates the
	// preset's <expr> entries AFTER the raw uploads and overrides them by
	// name (audio remaps AND scripted config params alike).  The generator
	// is a SECOND program whose uniforms were just set by hand above, so
	// without this pass a scene with a formula on a uniform BOTH programs
	// read would half-follow two different values: fragment stage on the
	// formula, compute-built geometry on the raw/rolled value.
	if( !m_exprs.empty() )
	{
		float ev[ExprVars::V_COUNT];
		fillExprVars( a, m_exprTime, m_exprSeeds, ev );
		for( size_t i = 0; i < m_exprs.size(); ++i )
		{
			if( !m_exprs[i].prog.valid() || m_genExprLocs[i] < 0 )
				continue;
			glUniform1f( m_genExprLocs[i], m_exprs[i].prog.eval( ev ) );
		}
	}

	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, m_vbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_cmdBuf );
	if( m_stateBuf )
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_stateBuf );

	if( m_genLocs.frameIndex >= 0 )
		glUniform1ui( m_genLocs.frameIndex, GLuint(m_frameIndex) );
	GLint passLoc = m_genLocs.genPass;

	// A fixed invocation budget: 64^3 = 262144, in 4x4x4 blocks.  What one
	// invocation MEANS is entirely the generator's business — a voxel for an
	// isosurface, a node for a tree, a lot for a city.  A generator that needs
	// fewer simply returns early, which costs nothing worth measuring.
	//
	// A stateful generator runs TWICE: once to advance its simulation, then —
	// after a barrier — once to build geometry from the result.  Doing both in
	// one dispatch would race, because invocations within a dispatch have no
	// ordering, and the meshing half would read state the stepping half had not
	// finished writing.
	//
	// A scene that called setGenPassCount(N > 0) (the "genPasses" preset
	// attribute) gets N passes instead of the fixed 2 (0..N-1, barrier
	// between each) -- for pipelines that need more than "advance, then
	// mesh" (a grid-based fluid sim needs e.g. clear-density / splat /
	// integrate-forces / mesh, four passes that each depend on the previous
	// one having finished writing). A GLSL shader can't tell the host how
	// many passes it wants -- uniforms are host-to-shader, not the other way
	// around -- so this is scene-configured (like stateBytes/shadowExtent),
	// not shader-declared. Purely additive: a scene that never calls
	// setGenPassCount() is completely unaffected, still runs through the
	// exact branch below it always did.
	if( passLoc >= 0 && m_genPassCount > 0 )
	{
		for( int p = 0; p < m_genPassCount; ++p )
		{
			glUniform1f( passLoc, float(p) );
			glDispatchCompute( 16, 16, 16 );
			glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT
			                | GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		}
	}
	else if( passLoc >= 0 && m_stateBuf )
	{
		glUniform1f( passLoc, 0.f );
		glDispatchCompute( 16, 16, 16 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
		glUniform1f( passLoc, 1.f );
		glDispatchCompute( 16, 16, 16 );
	}
	else
	{
		if( passLoc >= 0 ) glUniform1f( passLoc, 1.f );
		glDispatchCompute( 16, 16, 16 );
	}
	++m_frameIndex;

	// The clamp pass has to see the finished counter, so it needs its own
	// barrier before it runs — not just one at the end.
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	glUseProgram( s_clampProg );
	// s_clampProg is process-shared (one compute program for every indirect
	// scene), so its two locations are cached in function-local statics
	// rather than per-instance -- resolved once for the program's whole
	// lifetime (it is compiled once and never relinked; the progId guard is
	// just cheap insurance against that changing later).
	static GLuint s_clampLocProg   = 0;
	static GLint  s_clampLocMaxV   = -1;
	static GLint  s_clampLocBudget = -1;
	if( s_clampLocProg != s_clampProg )
	{
		s_clampLocMaxV   = glGetUniformLocation( s_clampProg, "maxVertices" );
		s_clampLocBudget = glGetUniformLocation( s_clampProg, "budget" );
		s_clampLocProg   = s_clampProg;
	}
	if( s_clampLocMaxV >= 0 )
		glUniform1ui( s_clampLocMaxV, GLuint(m_meshCapacity) );
	// Same FPS-driven detail knob GEOM_CUBES scenes already read as
	// `cubeBudget` -- indirect generators had no way to shed triangles under
	// load before this. GLSL floats default to 0 (not 1) when never set, so
	// this MUST be uploaded every dispatch, not just when it changes -- a
	// missed upload after a program relink would silently clamp every
	// indirect scene to zero vertices.
	if( s_clampLocBudget >= 0 )
		glUniform1f( s_clampLocBudget, s_cubeBudget );
	glDispatchCompute( 1, 1, 1 );

	// Three consumers to fence against: the vertex puller, the indirect command
	// fetch, and any later shader read.  Missing the COMMAND bit is the classic
	// bug here — the draw then reads a stale vertex count and the mesh flickers
	// between this frame's size and the last frame's.
	glMemoryBarrier( GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT
	               | GL_COMMAND_BARRIER_BIT
	               | GL_SHADER_STORAGE_BARRIER_BIT );

	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, 0 );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, 0 );
	if( m_stateBuf )
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, 0 );
}

void Scene3DShader::initUniforms( int width, int height )
{
	m_width  = width;
	m_height = height;

	// NOT the base initUniforms: setShaders() is deliberately fragment-only
	// (the classic effects run on the fixed-function vertex path) — a real
	// 3D scene needs its vertex shader actually attached.
	// Tessellation / geometry stages join in automatically when their file is
	// present next to the .vert/.frag — no engine change per scene.
	m_sh_prog_id = setShadersPipeline( m_vertexShaderFilename,
	                                   m_tescFilename, m_teseFilename,
	                                   m_geomFilename, m_fragmentShaderFilename );
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
	m_meshMaterialUni = glGetUniformLocation( m_sh_prog_id, "texMeshMaterial" );
	m_meshMaterialLayersUni = glGetUniformLocation( m_sh_prog_id, "texMeshMaterialLayers" );
	m_meshVertexCountUni = glGetUniformLocation( m_sh_prog_id, "meshVertexCount" );
	m_attrA   = glGetAttribLocation( m_sh_prog_id, "attrA" );
	m_attrB   = glGetAttribLocation( m_sh_prog_id, "attrB" );

	if( m_vbo == 0 )
		buildGeometry();

	// Built here rather than lazily on the first draw, so the generator program
	// exists before RenderPipeline asks which host textures this scene needs —
	// usesSpectro() inspects the generator too.
	if( m_geomKind == GEOM_INDIRECT )
		setupIndirect();

	// Core profile: vertex attribs live in a VAO, baked once here (the
	// attrib locations are program-specific, so the VAO is per-scene).
	if( m_vao == 0 )
		glGenVertexArrays( 1, &m_vao );
	glBindVertexArray( m_vao );
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
	glBindVertexArray( 0 );
	glBindBuffer( GL_ARRAY_BUFFER, 0 );

	checkGLErrors( "Scene3DShader::initUniforms" );
}

void Scene3DShader::draw()
{
	// Perspective projection (55° vertical FOV, near 0.5, far 220).  The
	// aspect uses the FULL frame even for a half-viewport stereo eye — the
	// display/HMD player unsqueezes the halves back to full width.
	// The three numbers come from EffectShader, because the combine stage needs
	// the same ones to turn a depth sample back into a view-space position.
	// Two copies would drift, and every depth-based effect would then be
	// subtly, invisibly wrong.
	const float aspect = (m_height > 0) ? float(m_width) / float(m_height) : 1.f;
	const float zn = kSceneNear, zf = kSceneFar;
	const float f = 1.f / kSceneTanHalfFovY;
	float proj[16] = {
		f / aspect, 0.f, 0.f,                            0.f,
		0.f,        f,   0.f,                            0.f,
		0.f,        0.f, (zf + zn) / (zn - zf),         -1.f,
		0.f,        0.f, (2.f * zf * zn) / (zn - zf),    0.f
	};

	// CAMERA RIG: preset formulas named rig* steer the view.  Evaluated
	// CPU-side against the same variable set as every other formula, then
	// composed INTO projM, so all Scene3D scenes get pitch/yaw/roll/dolly
	// (+ host-integrated V rates) without touching a single shader.  The
	// shadow pass renders through lightM, so shadows stay world-anchored.
	{
		bool hasRig = false;
		for( ExprEntry &e : m_exprs )
			if( e.prog.valid() && e.name.rfind( "rig", 0 ) == 0 ) { hasRig = true; break; }
		if( hasRig )
		{
			float ev[ExprVars::V_COUNT];
			fillExprVars( m_lastAudio, m_exprTime, m_exprSeeds, ev );
			float absv[4] = { 0, 0, 0, 0 };            // pitch yaw roll dolly
			float vel[4]  = { 0, 0, 0, 0 };
			static const char *kAbs[4] = { "rigPitch",  "rigYaw",  "rigRoll",  "rigDolly"  };
			static const char *kVel[4] = { "rigPitchV", "rigYawV", "rigRollV", "rigDollyV" };
			for( ExprEntry &e : m_exprs )
			{
				if( !e.prog.valid() ) continue;
				for( int i = 0; i < 4; ++i )
				{
					if( e.name == kAbs[i] ) absv[i] = e.prog.eval( ev );
					if( e.name == kVel[i] ) vel[i]  = e.prog.eval( ev );
				}
			}
			// integrate rates once per FRAME (same m_exprTime across the
			// shadow/opaque/OIT draws of one frame)
			if( m_exprTime != m_rigLastT )
			{
				float dt = m_exprTime - m_rigLastT;
				if( dt < 0.f || dt > 0.1f ) dt = 0.f;   // activation / reset
				for( int i = 0; i < 4; ++i ) m_rigAcc[i] += vel[i] * dt;
				m_rigLastT = m_exprTime;
			}
			// The dolly accumulator is the one rig channel that must not run
			// away: rotations wrap harmlessly, but an integrated rigDollyV
			// with any non-zero mean would march the camera INTO the scene's
			// geometry without bound -- a camera collision by construction.
			// No catalogue entry uses the V channels today (audited: all 236
			// dolly formulas are the bounded absolute 0.5*swell), so this
			// clamp costs nothing now and defuses the first future one.
			m_rigAcc[3] = std::max( -1.5f, std::min( m_rigAcc[3], 1.5f ) );
			const float px = absv[0] + m_rigAcc[0], yw = absv[1] + m_rigAcc[1];
			const float rl = absv[2] + m_rigAcc[2], dl = absv[3] + m_rigAcc[3];
			// M = T(0,0,dolly) * Rz(roll) * Ry(yaw) * Rx(pitch), column-major.
			// dolly > 0 pushes the camera IN (view-space z is negative ahead).
			const float cx = cosf( px ), sx = sinf( px );
			const float cy = cosf( yw ), sy = sinf( yw );
			const float cz = cosf( rl ), sz = sinf( rl );
			const float R[16] = {                       // Rz*Ry*Rx
				 cz*cy,            sz*cy,            -sy,    0.f,
				 cz*sy*sx - sz*cx, sz*sy*sx + cz*cx,  cy*sx, 0.f,
				 cz*sy*cx + sz*sx, sz*sy*cx - cz*sx,  cy*cx, 0.f,
				 0.f,              0.f,               dl,    1.f
			};
			float pr[16];
			for( int c = 0; c < 4; ++c )
				for( int r = 0; r < 4; ++r )
					pr[c*4+r] = proj[0*4+r]*R[c*4+0] + proj[1*4+r]*R[c*4+1]
					          + proj[2*4+r]*R[c*4+2] + proj[3*4+r]*R[c*4+3];
			memcpy( proj, pr, sizeof(proj) );
		}
	}

	if( m_projUni   >= 0 ) glUniformMatrix4fv( m_projUni, 1, GL_FALSE, proj );
	if( m_eyeUni    >= 0 ) glUniform1f( m_eyeUni,    m_eyeOffset );
	if( m_seedUni   >= 0 ) glUniform1f( m_seedUni,   m_sceneSeed );
	if( m_budgetUni >= 0 ) glUniform1f( m_budgetUni, s_cubeBudget );

	if( m_meshMaterialLayers > 0 )
	{
		if( m_meshMaterialUni >= 0 ) glUniform1i( m_meshMaterialUni, kMeshMaterialTexUnit );
		if( m_meshMaterialLayersUni >= 0 ) glUniform1i( m_meshMaterialLayersUni, m_meshMaterialLayers );
		glActiveTexture( GL_TEXTURE0 + kMeshMaterialTexUnit );
		glBindTexture( GL_TEXTURE_2D_ARRAY, m_meshMaterialTex );
		glActiveTexture( GL_TEXTURE0 );
	}
	if( m_geomKind == GEOM_MESH && m_meshVertexCountUni >= 0 )
		glUniform1i( m_meshVertexCountUni, m_meshOwnVertexCount );

	// During the OIT accumulation pass, the caller (RenderPipeline::renderOitPass
	// / Scene3DPreview::renderOitPass) has ALREADY bound the two-target OIT
	// FBO, cleared it to its own per-attachment values (0 for accumulation,
	// 1 for revealage -- NOT the same value, so a blanket glClear here would
	// stomp the revealage back to 0), and set up the additive/multiplicative
	// blend it needs.  Below, every geometry branch forces its own opaque
	// blend/depth state for the normal case; both the clear and that
	// per-branch state-forcing must defer to the OIT pass instead.
	const bool inOitPass = ( EffectShader::s_oitPass >= 0.5f );

	if( !inOitPass )
	{
		// Clear colour AND depth (scissored to the eye viewport in true stereo).
		glClearColor( 0.f, 0.f, 0.f, 1.f );
		glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	}

	glBindVertexArray( m_vao );

	if( m_geomKind == GEOM_INDIRECT )
	{
		// Compute builds the mesh, then the draw reads its vertex count out of
		// a buffer the GPU just wrote.  Nothing about the geometry — not even
		// how much of it there is — passes through the CPU this frame.
		if( setupIndirect() )
		{
			// The generator binds its own program.  Uniform values live in the
			// program object, not in the context, so simply switching back
			// restores everything the host already uploaded for this frame —
			// no need to replay setUniforms().
			//
			// A shadowed scene reaches draw() TWICE per frame.  The mesh is
			// built in the first of those passes and reused in the second:
			// regenerating would double the compute for an identical result,
			// and — worse — the shadow map would then describe a mesh the
			// camera pass no longer draws if any input changed between them.
			bool generate = ( EffectShader::s_shadowPass > 0.5f ) || !usesShadow();
			if( generate )
			{
				glBindVertexArray( 0 );
				runGenerator( m_lastTime );
			}
			glUseProgram( m_sh_prog_id );

			glBindVertexArray( m_vao );
			if( !inOitPass ) { glEnable( GL_DEPTH_TEST ); glDisable( GL_BLEND ); }
			glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
			glDrawArraysIndirect( GL_TRIANGLES, 0 );
			glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );
			if( !inOitPass ) glDisable( GL_DEPTH_TEST );

			// Diagnostic: KALEIDO_INDIRECT_LOG=1 appends the buffer's ACTUAL
			// vertex count (read back from the GPU, not inferred from a
			// screenshot) plus the pass flags that gated whether this call
			// regenerated the mesh, to indirect_diag.log next to the exe.
			// Written with a plain fopen/fclose, not stderr: Scene3DPreview::
			// captureStderr() (used by ensureCompiled() to capture shader
			// compile logs) freopen()s the process-global stderr mid-frame,
			// and under a piped/captured process (any headless run, this
			// tool's own testing included) its restore step can leave stderr
			// broken for the rest of the process -- so anything logged here
			// via stderr can silently vanish for reasons that have nothing
			// to do with the geometry itself.
			if( getenv( "KALEIDO_INDIRECT_LOG" ) )
			{
				glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
				GLuint *cmd4 = (GLuint *) glMapBuffer( GL_DRAW_INDIRECT_BUFFER, GL_READ_ONLY );
				GLuint count = cmd4 ? cmd4[0] : 0xffffffffu;
				if( cmd4 ) glUnmapBuffer( GL_DRAW_INDIRECT_BUFFER );
				glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );
				FILE *df = fopen( "indirect_diag.log", "a" );
				if( df )
				{
					fprintf( df,
					    "shadowPass=%.0f oitPass=%.0f generate=%d count=%u frameIndex=%d\n",
					    EffectShader::s_shadowPass, EffectShader::s_oitPass, generate,
					    count, m_frameIndex );
					fclose( df );
				}
			}
		}
	}
	else if( m_geomKind == GEOM_PATCHES )
	{
		// Tessellated surface: the patch is the primitive, and the tessellator
		// decides how many triangles it becomes.
		if( !inOitPass ) { glEnable( GL_DEPTH_TEST ); glDisable( GL_BLEND ); }
		if( glPatchParameteri )
			glPatchParameteri( GL_PATCH_VERTICES, 4 );
		glDrawArrays( GL_PATCHES, 0, m_vertexCount );
		if( !inOitPass ) glDisable( GL_DEPTH_TEST );
	}
	else if( m_geomKind == GEOM_SCATTER )
	{
		// Points that a geometry shader grows into solid bodies: depth-tested
		// and opaque, so a near blade hides the ones behind it.
		if( !inOitPass ) { glEnable( GL_DEPTH_TEST ); glDisable( GL_BLEND ); }
		glDrawArrays( GL_POINTS, 0, m_vertexCount );
		if( !inOitPass ) glDisable( GL_DEPTH_TEST );
	}
	else if( m_geomKind == GEOM_CUBES || m_geomKind == GEOM_GRID
	 || m_geomKind == GEOM_QUADS || m_geomKind == GEOM_MESH )
	{
		// Solid geometry: depth-tested, opaque -- EXCEPT during the OIT
		// accumulation pass, whose caller has already set up the blend and
		// depth state a transparent pass needs (additive/multiplicative
		// blending, depth-test on but depth-WRITE off); forcing this
		// branch's normal opaque state here would silently turn the whole
		// accumulation into an ordinary non-blended overwrite (GlassStack,
		// the first geom="cubes" scene to use OIT, was invisible-as-glass
		// this way -- flat opaque shards instead of layered translucency).
		if( !inOitPass ) { glEnable( GL_DEPTH_TEST ); glDisable( GL_BLEND ); }
		glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
		if( !inOitPass ) glDisable( GL_DEPTH_TEST );
	}
	else
	{
		// Glowing geometry: additive, order-independent (no depth test).
		// (Core profile: point sprites are always on; only the programmable
		// point size still needs its enable.)
		if( !inOitPass )
		{
			glDisable( GL_DEPTH_TEST );
			glEnable( GL_BLEND );
			glBlendFunc( GL_ONE, GL_ONE );
		}
		if( m_geomKind == GEOM_POINTS )
		{
			glEnable( GL_VERTEX_PROGRAM_POINT_SIZE );
			glDrawArrays( GL_POINTS, 0, m_vertexCount );
			glDisable( GL_VERTEX_PROGRAM_POINT_SIZE );
		}
		else
			glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
		if( !inOitPass ) glDisable( GL_BLEND );
	}

	glBindVertexArray( 0 );

	checkGLErrors( "Scene3DShader::draw" );
}

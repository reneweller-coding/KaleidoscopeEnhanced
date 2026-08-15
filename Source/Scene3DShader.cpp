// Scene3DShader.cpp — see Scene3DShader.h.
#include "glcore.h"          // MUST come before any gl.h include (Qt's qopengl.h)
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

// Shared by all geom="indirect" scenes (see setupIndirect()).
GLuint Scene3DShader::s_clampProg = 0;

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
	else                          m_geomKind = GEOM_POINTS;

	rollVariation();

	// The matching vertex shader sits next to the fragment shader
	// ("..\Scene3D\X.frag" -> "..\Scene3D\X.vert").
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
		s_clampProg = setComputeShader( "..\\Blend\\IndirectClamp.comp" );
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
	auto setF = [&]( const char *n, float v )
	{
		GLint l = glGetUniformLocation( m_genProg, n );
		if( l >= 0 ) glUniform1f( l, v );
	};
	const AudioFeatures &a = m_lastAudio;      // already carries this scene's offsets
	setF( "time",         m_timeOffset + time * m_speedFactor );
	setF( "sceneSeed",    m_sceneSeed );
	setF( "audioAdvance", a.audioAdvance );
	setF( "audioLevel",   a.overallLevel );
	setF( "audioBeat",    a.beatDecay );
	setF( "audioKick",    a.onsetKick );
	setF( "audioSubBass", a.subBassLevel );
	setF( "audioHigh",    a.highLevel );
	setF( "audioBass",    a.bassLevel );
	setF( "audioMid",     a.midLevel );
	{
		GLint l = glGetUniformLocation( m_genProg, "audioChroma" );
		if( l >= 0 ) glUniform1fv( l, 12, a.chroma );
	}
	{
		GLint l = glGetUniformLocation( m_genProg, "audioSpectrum" );
		if( l >= 0 ) glUniform1fv( l, AudioFeatures::kSpectrumBands, a.spectrum );
	}
	// The host binds the spectrogram to unit 28 whenever usesSpectro() says
	// somebody wants it — which, for an indirect scene, includes this program.
	{
		GLint l = glGetUniformLocation( m_genProg, "texSpectro" );
		if( l >= 0 ) glUniform1i( l, 28 );
	}
	setF( "spectroHead", a.spectroHead );
	setF( "spectroFill", a.spectroFill );
	{
		GLint l = glGetUniformLocation( m_genProg, "maxVertices" );
		if( l >= 0 ) glUniform1ui( l, GLuint(m_meshCapacity) );
	}
	for( unsigned int i = 0; i < m_uniforms.size(); ++i )
	{
		setF( m_uniforms[i]->getName().c_str(), m_uniforms[i]->snapshotValue() );
	}

	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, m_vbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_cmdBuf );
	if( m_stateBuf )
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_stateBuf );

	{
		GLint l = glGetUniformLocation( m_genProg, "frameIndex" );
		if( l >= 0 ) glUniform1ui( l, GLuint(m_frameIndex) );
	}
	GLint passLoc = glGetUniformLocation( m_genProg, "genPass" );

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
	if( passLoc >= 0 && m_stateBuf )
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
	{
		GLint l = glGetUniformLocation( s_clampProg, "maxVertices" );
		if( l >= 0 ) glUniform1ui( l, GLuint(m_meshCapacity) );
	}
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
	m_attrA   = glGetAttribLocation( m_sh_prog_id, "attrA" );
	m_attrB   = glGetAttribLocation( m_sh_prog_id, "attrB" );

	if( m_vbo == 0 )
		buildGeometry();

	// Built here rather than lazily on the first draw, so the generator program
	// exists before FilterShader asks which host textures this scene needs —
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

	if( m_projUni   >= 0 ) glUniformMatrix4fv( m_projUni, 1, GL_FALSE, proj );
	if( m_eyeUni    >= 0 ) glUniform1f( m_eyeUni,    m_eyeOffset );
	if( m_seedUni   >= 0 ) glUniform1f( m_seedUni,   m_sceneSeed );
	if( m_budgetUni >= 0 ) glUniform1f( m_budgetUni, s_cubeBudget );

	// Clear colour AND depth (scissored to the eye viewport in true stereo).
	glClearColor( 0.f, 0.f, 0.f, 1.f );
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );

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
			glEnable( GL_DEPTH_TEST );
			glDisable( GL_BLEND );
			glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
			glDrawArraysIndirect( GL_TRIANGLES, 0 );
			glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );
			glDisable( GL_DEPTH_TEST );

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
		glEnable( GL_DEPTH_TEST );
		glDisable( GL_BLEND );
		if( glPatchParameteri )
			glPatchParameteri( GL_PATCH_VERTICES, 4 );
		glDrawArrays( GL_PATCHES, 0, m_vertexCount );
		glDisable( GL_DEPTH_TEST );
	}
	else if( m_geomKind == GEOM_SCATTER )
	{
		// Points that a geometry shader grows into solid bodies: depth-tested
		// and opaque, so a near blade hides the ones behind it.
		glEnable( GL_DEPTH_TEST );
		glDisable( GL_BLEND );
		glDrawArrays( GL_POINTS, 0, m_vertexCount );
		glDisable( GL_DEPTH_TEST );
	}
	else if( m_geomKind == GEOM_CUBES || m_geomKind == GEOM_GRID
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
		// (Core profile: point sprites are always on; only the programmable
		// point size still needs its enable.)
		glDisable( GL_DEPTH_TEST );
		glEnable( GL_BLEND );
		glBlendFunc( GL_ONE, GL_ONE );
		if( m_geomKind == GEOM_POINTS )
		{
			glEnable( GL_VERTEX_PROGRAM_POINT_SIZE );
			glDrawArrays( GL_POINTS, 0, m_vertexCount );
			glDisable( GL_VERTEX_PROGRAM_POINT_SIZE );
		}
		else
			glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
		glDisable( GL_BLEND );
	}

	glBindVertexArray( 0 );

	checkGLErrors( "Scene3DShader::draw" );
}

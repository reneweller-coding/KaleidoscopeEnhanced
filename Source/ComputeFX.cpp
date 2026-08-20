/**
 * @file ComputeFX.cpp
 * @brief Implements ComputeFX: per-kind GPU resource management and the
 *        compute-shader dispatch sequence for every simulation kind.
 */
// ComputeFX.cpp — see ComputeFX.h.
#include "ComputeFX.h"
#include "shader_setup.h"

#include <stdio.h>
#include <math.h>
#include <string.h>
#include <vector>
#include <algorithm>

// Global sampler units.  Units 0..11 are taken by the slideshow images and the
// older sims (texSim 7, texFluid 8, texSmoke3D 9, texSSM 10, texPhysarum 11).
/// Per-kind sampler name + texture unit table, indexed by CfxKind (see CfxTypes.h).
const CfxInfo kCfxInfo[CFX_COUNT] = {
	{ "texFlame",     12 },
	{ "texParticles", 13 },
	{ "texNBody",     14 },
	{ "texBoids",     15 },
	{ "texCrystal",   16 },
	{ "texLightning", 17 },
	{ "texCaustics",  18 },
	{ "texSorted",    19 },
	{ "texFFT",       20 },
	{ "texFerro",     21 },
	{ "texErosion",   22 },
	{ "texMetal",     23 },
	{ "texShards",    24 },
	{ "texNSFluid",   25 },
	{ "texCloth",     26 },
	{ "texSculpt",    27 },
};

namespace {

// Fixed-point scale for the uint accumulator: atomicAdd on floats needs an
// optional extension, uint atomics are core.  256 keeps ~2 decimal digits of
// colour precision and still allows ~16M accumulated units per pixel.
/// @brief Fixed-point multiplier the splat shaders use before atomicAdd into a Canvas::ssbo.
const float kSplatScale = 256.f;

// Splat canvases run at a fixed short side; they are smooth density fields, so
// rendering them at display resolution buys nothing and costs a lot.
/// @brief Fixed short-side width (texels) used for every splat Canvas, regardless of display resolution.
const int kCanvasW = 1280;

// Compute-program slots (index into ComputeFX::m_prog).
/// @brief Indices into ComputeFX::m_prog / m_progTried, one per distinct .comp shader file.
/// Not every slot is used by a shipped kind: P_METAL_SPLAT and P_SCULPT are
/// reserved but currently unreferenced (stepSculpt is a stub).
enum {
	P_RESOLVE = 0, P_FLAME, P_PART_INIT, P_PART_STEP, P_NBODY_INIT, P_NBODY_STEP,
	P_BOIDS_INIT, P_BOIDS_GRID, P_BOIDS_STEP, P_CRYSTAL, P_CRYSTAL_SEED,
	P_LIGHT_FIELD, P_LIGHT_GROW, P_CAUSTIC_WAVE, P_CAUSTIC_PHOTON,
	P_SORT, P_FFT_H, P_FFT_V, P_FFT_MASK, P_FFT_STORE, P_FERRO, P_EROSION,
	P_EROSION_SEED, P_METAL_STEP, P_METAL_SPLAT, P_SHARD_INIT, P_SHARD_STEP,
	P_NS_ADVECT, P_NS_DIV, P_NS_JACOBI, P_NS_PROJECT, P_CLOTH_INIT, P_CLOTH_STEP,
	P_SCULPT, P_MANDELBROT
};

/// @brief Ceiling-divides `n` by `local` to get the compute-dispatch group count for a given workgroup size.
inline int groups( int n, int local ) { return ( n + local - 1 ) / local; }

} // namespace

// Unconditionally tears down every kind's GPU resources, whether or not that
// kind was ever actually requested (freeXxx()/glDelete* on a zero handle is a
// harmless no-op), plus the whole compute-program cache.
ComputeFX::~ComputeFX()
{
	for( int k = 0; k < CFX_COUNT; ++k )
	{
		freeCanvas( m_canvas[k] );
		freeField( m_field[k] );
		freeField( m_field2[k] );
		if( m_buf[k] )  glDeleteBuffers( 1, &m_buf[k] );
		if( m_buf2[k] ) glDeleteBuffers( 1, &m_buf2[k] );
	}
	freeField( m_nsPressure );
	freeField( m_mandelbrotField );
	for( int i = 0; i < kProgSlots; ++i )
		if( m_prog[i] ) glDeleteProgram( m_prog[i] );
}

void ComputeFX::init()
{
	m_ok = glcoreHasCompute != 0;
	glGetIntegerv( GL_MAX_TEXTURE_IMAGE_UNITS, &m_maxTexUnits );
	fprintf( stderr, "ComputeFX: %s, %d fragment texture units\n",
	         m_ok ? "enabled" : "disabled", m_maxTexUnits );
	// Kinds are pre-emptively killed here (once) rather than checked every
	// step(): a GPU with few fragment texture units cannot bind that kind's
	// unit at all, so retrying per frame would just fail identically forever.
	if( m_ok )
		for( int k = 0; k < CFX_COUNT; ++k )
			if( kCfxInfo[k].unit >= m_maxTexUnits )
			{
				m_dead[k] = true;
				fprintf( stderr, "ComputeFX: %s disabled (needs unit %d)\n",
				         kCfxInfo[k].sampler, kCfxInfo[k].unit );
			}
}

GLuint ComputeFX::prog( int slot, const char *file )
{
	if( slot < 0 || slot >= kProgSlots ) return 0;
	// m_progTried latches on the FIRST attempt regardless of outcome, so a
	// compile failure is reported once to stderr and then silently returns 0
	// on every later call instead of re-attempting (and re-spamming) the
	// same doomed compile every frame.
	if( !m_progTried[slot] )
	{
		m_progTried[slot] = 1;
		m_prog[slot] = setComputeShader( file );
		if( !m_prog[slot] )
			fprintf( stderr, "ComputeFX: program FAILED: %s\n", file );
	}
	return m_prog[slot];
}

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

bool ComputeFX::ensureBuffer( GLuint &b, size_t bytes )
{
	if( b ) return true;   // never resizes: callers pass a fixed byte count per kind
	glGenBuffers( 1, &b );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, b );
	glBufferData( GL_SHADER_STORAGE_BUFFER, GLsizeiptr(bytes), NULL, GL_DYNAMIC_COPY );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );
	return b != 0;
}

bool ComputeFX::ensureCanvas( Canvas &c, int w, int h )
{
	if( c.tex && c.w == w && c.h == h ) return true;
	freeCanvas( c );
	c.w = w; c.h = h;

	glGenTextures( 1, &c.tex );
	glBindTexture( GL_TEXTURE_2D, c.tex );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, w, h, 0, GL_RGBA, GL_FLOAT, NULL );
	glBindTexture( GL_TEXTURE_2D, 0 );

	// Zero the canvas so the first frame never shows uninitialised memory.
	std::vector<float> zero( size_t(w) * h * 4, 0.f );
	glBindTexture( GL_TEXTURE_2D, c.tex );
	glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, w, h, GL_RGBA, GL_FLOAT, zero.data() );
	glBindTexture( GL_TEXTURE_2D, 0 );

	glGenBuffers( 1, &c.ssbo );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, c.ssbo );
	glBufferData( GL_SHADER_STORAGE_BUFFER,
	              GLsizeiptr( size_t(w) * h * 4 * sizeof(unsigned int) ),
	              NULL, GL_DYNAMIC_COPY );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );

	c.seeded = false;
	return c.tex != 0 && c.ssbo != 0;
}

void ComputeFX::freeCanvas( Canvas &c )
{
	if( c.tex )  { glDeleteTextures( 1, &c.tex );  c.tex = 0; }
	if( c.ssbo ) { glDeleteBuffers( 1, &c.ssbo );  c.ssbo = 0; }
	c.w = c.h = 0; c.seeded = false;
}

// Every kind that owns a Canvas clears its accumulator at the start of each
// frame and re-scatters from scratch; there is no cross-frame accumulation
// at the uint level.  Any persistence across frames (motion trails) instead
// happens in resolve()'s `decay` blend into the RGBA16F texture below.
void ComputeFX::clearAccum( const Canvas &c )
{
	const unsigned int zero = 0;
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, c.ssbo );
	glClearBufferData( GL_SHADER_STORAGE_BUFFER, GL_R32UI, GL_RED_INTEGER,
	                   GL_UNSIGNED_INT, &zero );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );
}

// uint accumulator -> RGBA16F canvas.  mode 0 = linear exposure, mode 1 = the
// fractal-flame log-density tonemap (average colour x log(1+density)).
void ComputeFX::resolve( const Canvas &c, int mode, float exposure,
                         float gammaInv, float decay )
{
	GLuint p = prog( P_RESOLVE, "..\\Engine\\CfxResolve.comp" );
	if( !p ) return;
	glUseProgram( p );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindImageTexture( 0, c.tex, 0, GL_FALSE, 0, GL_READ_WRITE, GL_RGBA16F );
	glUniform2i( glGetUniformLocation( p, "size" ), c.w, c.h );
	glUniform1i( glGetUniformLocation( p, "mode" ), mode );
	glUniform1f( glGetUniformLocation( p, "exposure" ), exposure );
	glUniform1f( glGetUniformLocation( p, "gammaInv" ), gammaInv );
	glUniform1f( glGetUniformLocation( p, "decay" ), decay );
	glDispatchCompute( groups( c.w, 16 ), groups( c.h, 16 ), 1 );
	glMemoryBarrier( GL_TEXTURE_FETCH_BARRIER_BIT | GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
}

bool ComputeFX::ensureField( Field &f, int w, int h, GLenum fmt )
{
	if( f.tex[0] && f.w == w && f.h == h ) return true;
	freeField( f );
	f.w = w; f.h = h; f.idx = 0;
	std::vector<float> zero( size_t(w) * h * 4, 0.f );
	for( int i = 0; i < 2; ++i )
	{
		glGenTextures( 1, &f.tex[i] );
		glBindTexture( GL_TEXTURE_2D, f.tex[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GLint(fmt), w, h, 0, GL_RGBA, GL_FLOAT,
		              zero.data() );
	}
	glBindTexture( GL_TEXTURE_2D, 0 );
	f.seeded = false;
	return f.tex[0] != 0 && f.tex[1] != 0;
}

void ComputeFX::freeField( Field &f )
{
	for( int i = 0; i < 2; ++i )
		if( f.tex[i] ) { glDeleteTextures( 1, &f.tex[i] ); f.tex[i] = 0; }
	f.w = f.h = 0; f.seeded = false;
}

// Drop the GPU memory of sims that have not been requested for a while; with
// 13 possible sims the resident set would otherwise grow to hundreds of MB.
void ComputeFX::retireIdle( float now )
{
	const float kIdle = 25.f;
	for( int k = 0; k < CFX_COUNT; ++k )
	{
		if( m_canvas[k].tex && now - m_canvas[k].lastUse > kIdle )
			freeCanvas( m_canvas[k] );
		if( m_field[k].tex[0] && now - m_field[k].lastUse > kIdle )
		{
			freeField( m_field[k] );
			freeField( m_field2[k] );
			if( m_buf[k] )  { glDeleteBuffers( 1, &m_buf[k] );  m_buf[k] = 0; }
			if( m_buf2[k] ) { glDeleteBuffers( 1, &m_buf2[k] ); m_buf2[k] = 0; }
		}
	}
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

GLuint ComputeFX::step( int k, const AudioFeatures &a, float dt, float t,
                        GLuint srcImage, int outW, int outH )
{
	if( !m_ok || k < 0 || k >= CFX_COUNT || m_dead[k] ) return 0;
	m_now = t;
	if( dt <= 0.f || dt > 0.25f ) dt = 1.f / 60.f;

	GLuint tex = 0;
	switch( k )
	{
		case CFX_FLAME:     tex = stepFlame( a, dt, t ); break;
		case CFX_PARTICLES: tex = stepParticles( a, dt, t, srcImage ); break;
		case CFX_NBODY:     tex = stepNBody( a, dt, t ); break;
		case CFX_BOIDS:     tex = stepBoids( a, dt, t ); break;
		case CFX_CRYSTAL:   tex = stepCrystal( a, dt, t ); break;
		case CFX_LIGHTNING: tex = stepLightning( a, dt, t ); break;
		case CFX_CAUSTICS:  tex = stepCaustics( a, dt, t, srcImage ); break;
		case CFX_PIXELSORT: tex = stepPixelSort( a, dt, t, srcImage, outW, outH ); break;
		case CFX_FFT:       tex = stepFFT( a, dt, t, srcImage ); break;
		case CFX_FERRO:     tex = stepFerro( a, dt, t ); break;
		case CFX_EROSION:   tex = stepErosion( a, dt, t ); break;
		case CFX_METAL:     tex = stepMetal( a, dt, t, srcImage ); break;
		case CFX_SHARDS:    tex = stepShards( a, dt, t, srcImage ); break;
		case CFX_NSFLUID:   tex = stepNSFluid( a, dt, t, srcImage ); break;
		case CFX_CLOTH:     tex = stepCloth( a, dt, t ); break;
		case CFX_SCULPT:    tex = stepSculpt( a, dt, t ); break;
	}
	if( !tex ) m_dead[k] = true;    // a failed program never becomes good again
	// Stamped unconditionally on all three per-kind containers even though a
	// given kind only ever allocates one or two of them — harmless, since
	// retireIdle() only acts on a container whose GL handle is non-zero, and
	// it keeps this bookkeeping a single unconditional write instead of a
	// per-kind "which resources does this one actually use" branch.
	m_canvas[k].lastUse = t;
	m_field[k].lastUse  = t;
	m_field2[k].lastUse = t;
	glUseProgram( 0 );
	return tex;
}

// Canvas geometry for the splat sims: fixed short side, display aspect kept.
/// @brief Computes a splat Canvas's texel size: fixed kCanvasW short side, display aspect, clamped and rounded to whole 16-texel workgroups.
static void canvasSize( int outW, int outH, int &w, int &h )
{
	w = kCanvasW;
	float aspect = ( outW > 0 && outH > 0 ) ? float(outH) / float(outW) : 0.5625f;
	h = int( kCanvasW * aspect + 0.5f );
	if( h < 360 )  h = 360;
	if( h > 1024 ) h = 1024;
	h = ( h / 16 ) * 16;            // whole workgroups
}

// ---------------------------------------------------------------------------
// 1. Fractal flames — the chaos game with an atomic density histogram.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepFlame( const AudioFeatures &a, float dt, float t )
{
	Canvas &c = m_canvas[CFX_FLAME];
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;
	GLuint p = prog( P_FLAME, "..\\Engine\\CfxFlame.comp" );
	if( !p ) return 0;

	// The transforms morph on HOST-INTEGRATED phases (never time x audio, which
	// would jitter the whole attractor whenever the level moves).
	static float phase = 0.f, warp = 0.f, spin = 0.f;
	phase += dt * ( 0.055f + 0.10f * a.overallLevel );
	warp  += dt * ( 0.021f + 0.16f * a.spectralFlux );
	spin  += dt * ( 0.034f + 0.22f * a.beatDecay );

	clearAccum( c );
	glUseProgram( p );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glUniform2i( glGetUniformLocation( p, "size" ), c.w, c.h );
	glUniform1f( glGetUniformLocation( p, "phase" ), phase );
	glUniform1f( glGetUniformLocation( p, "warp" ), warp );
	glUniform1f( glGetUniformLocation( p, "spin" ), spin );
	glUniform1ui( glGetUniformLocation( p, "frame" ), (GLuint)( t * 1000.f ) );
	glUniform1f( glGetUniformLocation( p, "hue" ), a.chromaHue );
	glUniform1f( glGetUniformLocation( p, "level" ), a.overallLevel );
	glUniform1f( glGetUniformLocation( p, "kick" ), a.onsetKick );
	glUniform1f( glGetUniformLocation( p, "bright" ), a.spectralCentroid );
	glUniform1f( glGetUniformLocation( p, "drop" ), a.dropPulse );
	glDispatchCompute( 256, 1, 1 );          // 256 x 256 walkers
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	// Long temporal integration: one frame of the chaos game is sparse, the
	// decaying canvas is what makes the flame smooth and silky.
	resolve( c, 1, 0.55f + 1.4f * a.overallLevel, 0.62f, 0.90f );
	return c.tex;
}

// ---------------------------------------------------------------------------
// 2. Millions of particles advected through a curl-noise flow field.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepParticles( const AudioFeatures &a, float dt, float t,
                                 GLuint srcImage )
{
	// 2M particles covered every pixel twice over and the result read as flat
	// paint; at ~0.8 per pixel the individual streaks stay visible and the
	// convergence lines of the flow field are what lights up.
	const int kParticles = 1280 * 1024;
	Canvas &c = m_canvas[CFX_PARTICLES];
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_PARTICLES], size_t(kParticles) * 4 * sizeof(float) ) )
		return 0;

	GLuint pi = prog( P_PART_INIT, "..\\Engine\\CfxParticleInit.comp" );
	GLuint ps = prog( P_PART_STEP, "..\\Engine\\CfxParticleStep.comp" );
	if( !pi || !ps ) return 0;

	if( !c.seeded )
	{
		glUseProgram( pi );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_PARTICLES] );
		glUniform1ui( glGetUniformLocation( pi, "count" ), (GLuint)kParticles );
		glDispatchCompute( groups( kParticles, 256 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
		c.seeded = true;
	}

	static float flow = 0.f, curlPhase = 0.f;
	flow      += dt * ( 0.30f + 0.85f * a.overallLevel );
	curlPhase += dt * ( 0.05f + 0.22f * a.spectralFlux );

	clearAccum( c );
	glUseProgram( ps );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_PARTICLES] );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, srcImage );
	glUniform1i( glGetUniformLocation( ps, "texPhoto" ), 0 );
	glUniform2i( glGetUniformLocation( ps, "size" ), c.w, c.h );
	glUniform1ui( glGetUniformLocation( ps, "count" ), (GLuint)kParticles );
	glUniform1f( glGetUniformLocation( ps, "dt" ), dt );
	glUniform1f( glGetUniformLocation( ps, "flow" ), flow );
	glUniform1f( glGetUniformLocation( ps, "curlPhase" ), curlPhase );
	glUniform1f( glGetUniformLocation( ps, "kick" ), a.onsetKick );
	glUniform1f( glGetUniformLocation( ps, "level" ), a.overallLevel );
	glUniform1f( glGetUniformLocation( ps, "hue" ), a.chromaHue );
	glUniform1f( glGetUniformLocation( ps, "drop" ), a.dropPulse );
	glUniform1ui( glGetUniformLocation( ps, "frame" ), (GLuint)( t * 1000.f ) );
	glDispatchCompute( groups( kParticles, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	resolve( c, 0, 0.55f, 1.f, 0.86f );
	return c.tex;
}

// ---------------------------------------------------------------------------
// 3. N-body galaxy — the classic shared-memory tiled force accumulation.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepNBody( const AudioFeatures &a, float dt, float t )
{
	// A star field needs DENSITY to read as a galaxy: 32k points over a 1280px
	// canvas leaves 0.03 stars per pixel and looks like faint dust.  Forces are
	// evaluated against a 1/32 sample (2048 bodies) so quadrupling the star
	// count costs nothing — the sampled masses carry the compensating weight.
	const int kBodies = 1 << 16;             // 65,536
	Canvas &c = m_canvas[CFX_NBODY];
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;
	// pos.xyz + mass, vel.xyz + colour index
	if( !ensureBuffer( m_buf[CFX_NBODY],  size_t(kBodies) * 4 * sizeof(float) ) ) return 0;
	if( !ensureBuffer( m_buf2[CFX_NBODY], size_t(kBodies) * 4 * sizeof(float) ) ) return 0;

	GLuint pi = prog( P_NBODY_INIT, "..\\Engine\\CfxNBodyInit.comp" );
	GLuint ps = prog( P_NBODY_STEP, "..\\Engine\\CfxNBodyStep.comp" );
	if( !pi || !ps ) return 0;

	// A drop restarts the pair of galaxies on a fresh collision course.
	// A merger is the whole arc of this scene — two discs approaching, tidal
	// tails, then the starburst.  Restarting every 12 s never let it play out.
	bool reseed = !c.seeded || a.dropPulse > 0.85f;
	static float lastSeed = -100.f;
	if( reseed && t - lastSeed > 45.f )
	{
		lastSeed = t;
		glUseProgram( pi );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_NBODY] );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_NBODY] );
		glUniform1ui( glGetUniformLocation( pi, "count" ), (GLuint)kBodies );
		glUniform1ui( glGetUniformLocation( pi, "seed" ), (GLuint)( t * 977.f ) );
		glDispatchCompute( groups( kBodies, 256 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
		c.seeded = true;
	}

	clearAccum( c );
	glUseProgram( ps );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_NBODY] );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_NBODY] );
	glUniform2i( glGetUniformLocation( ps, "size" ), c.w, c.h );
	glUniform1ui( glGetUniformLocation( ps, "count" ), (GLuint)kBodies );
	glUniform1f( glGetUniformLocation( ps, "dt" ), dt * 0.60f );
	glUniform1f( glGetUniformLocation( ps, "bass" ), a.bassRel );
	glUniform1f( glGetUniformLocation( ps, "kick" ), a.onsetKick );
	glUniform1f( glGetUniformLocation( ps, "hue" ), a.chromaHue );
	glUniform1f( glGetUniformLocation( ps, "level" ), a.overallLevel );
	glDispatchCompute( groups( kBodies, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	resolve( c, 0, 1.3f, 1.f, 0.93f );
	return c.tex;
}

// ---------------------------------------------------------------------------
// 4. Boids with a real neighbourhood (spatial hash built with atomics).
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepBoids( const AudioFeatures &a, float dt, float t )
{
	const int kBoids = 1 << 17;              // 131,072
	const int kGrid  = 128;                  // 128x128 cells
	const int kPerCell = 24;                 // capacity per cell
	Canvas &c = m_canvas[CFX_BOIDS];
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_BOIDS], size_t(kBoids) * 4 * sizeof(float) ) ) return 0;
	// grid: [count, idx0..idx(kPerCell-1)] per cell
	if( !ensureBuffer( m_buf2[CFX_BOIDS],
	                   size_t(kGrid) * kGrid * ( kPerCell + 1 ) * sizeof(unsigned int) ) )
		return 0;

	GLuint pi = prog( P_BOIDS_INIT, "..\\Engine\\CfxBoidsInit.comp" );
	GLuint pg = prog( P_BOIDS_GRID, "..\\Engine\\CfxBoidsGrid.comp" );
	GLuint ps = prog( P_BOIDS_STEP, "..\\Engine\\CfxBoidsStep.comp" );
	if( !pi || !pg || !ps ) return 0;

	if( !c.seeded )
	{
		glUseProgram( pi );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_BOIDS] );
		glUniform1ui( glGetUniformLocation( pi, "count" ), (GLuint)kBoids );
		glDispatchCompute( groups( kBoids, 256 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
		c.seeded = true;
	}

	// Rebuild the hash grid: clear the per-cell counters, then bin every boid.
	const unsigned int zero = 0;
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, m_buf2[CFX_BOIDS] );
	glClearBufferData( GL_SHADER_STORAGE_BUFFER, GL_R32UI, GL_RED_INTEGER,
	                   GL_UNSIGNED_INT, &zero );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );

	glUseProgram( pg );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_BOIDS] );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_BOIDS] );
	glUniform1ui( glGetUniformLocation( pg, "count" ), (GLuint)kBoids );
	glUniform1i( glGetUniformLocation( pg, "gridN" ), kGrid );
	glUniform1i( glGetUniformLocation( pg, "perCell" ), kPerCell );
	glDispatchCompute( groups( kBoids, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	static float goal = 0.f;
	goal += dt * ( 0.09f + 0.30f * a.overallLevel );

	clearAccum( c );
	glUseProgram( ps );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_BOIDS] );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_BOIDS] );
	glUniform2i( glGetUniformLocation( ps, "size" ), c.w, c.h );
	glUniform1ui( glGetUniformLocation( ps, "count" ), (GLuint)kBoids );
	glUniform1i( glGetUniformLocation( ps, "gridN" ), kGrid );
	glUniform1i( glGetUniformLocation( ps, "perCell" ), kPerCell );
	glUniform1f( glGetUniformLocation( ps, "dt" ), dt );
	glUniform1f( glGetUniformLocation( ps, "goalPhase" ), goal );
	glUniform1f( glGetUniformLocation( ps, "kick" ), a.onsetKick );
	glUniform1f( glGetUniformLocation( ps, "level" ), a.overallLevel );
	glUniform1f( glGetUniformLocation( ps, "drop" ), a.dropPulse );
	glUniform1f( glGetUniformLocation( ps, "hue" ), a.chromaHue );
	glUniform1f( glGetUniformLocation( ps, "bright" ), a.spectralCentroid );
	glDispatchCompute( groups( kBoids, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	// Short trails: a flock must stay CRISP.  A long decay smears the density
	// variation away and the whole thing turns into two glowing clouds.
	resolve( c, 0, 0.85f, 1.f, 0.45f );
	return c.tex;
}

// ---------------------------------------------------------------------------
// Later waves (stubs return 0 -> the kind marks itself dead and the effect
// simply shows an empty field).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Diffusion-limited aggregation — frost creeping across the frame.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepCrystal( const AudioFeatures &a, float dt, float t )
{
	const int kWalkers = 1 << 15;            // 32,768
	Field &f = m_field[CFX_CRYSTAL];
	if( !ensureField( f, 1024, 576, GL_RGBA16F ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_CRYSTAL], size_t(kWalkers) * 4 * sizeof(float) ) )
		return 0;

	GLuint pseed = prog( P_CRYSTAL_SEED, "..\\Engine\\CfxCrystalSeed.comp" );
	GLuint pstep = prog( P_CRYSTAL,      "..\\Engine\\CfxCrystal.comp" );
	if( !pseed || !pstep ) return 0;

	// Re-seed when the structure has had its run, or on a big drop.
	static float lastSeed = -1000.f;
	if( !f.seeded || a.dropPulse > 0.85f )
	{
		if( t - lastSeed > 30.f )
		{
			lastSeed = t;
			glUseProgram( pseed );
			glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
			glUniform2i( glGetUniformLocation( pseed, "size" ), f.w, f.h );
			glUniform1ui( glGetUniformLocation( pseed, "seed" ), (GLuint)( t * 613.f ) + 1u );
			glUniform1f( glGetUniformLocation( pseed, "hue" ), a.chromaHue );
			glDispatchCompute( groups( f.w, 16 ), groups( f.h, 16 ), 1 );
			glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
			f.seeded = true;
		}
	}

	glUseProgram( pstep );
	glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_READ_WRITE, GL_RGBA16F );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_CRYSTAL] );
	glUniform2i( glGetUniformLocation( pstep, "size" ), f.w, f.h );
	glUniform1ui( glGetUniformLocation( pstep, "count" ), (GLuint)kWalkers );
	glUniform1ui( glGetUniformLocation( pstep, "frame" ), (GLuint)( t * 1000.f ) );
	glUniform1f( glGetUniformLocation( pstep, "now" ), t );
	glUniform1f( glGetUniformLocation( pstep, "hue" ), a.chromaHue );
	// Stickiness has to stay LOW: at high values a walker freezes on first
	// contact, which is Eden growth — a compact blob with no branches at all.
	// Below ~0.1 walkers can slip past the tips into the fjords and the
	// characteristic dendrites appear.
	glUniform1f( glGetUniformLocation( pstep, "stickiness" ),
	             0.015f + 0.075f * a.overallLevel + 0.05f * a.onsetKick );
	glUniform1f( glGetUniformLocation( pstep, "drift" ),
	             0.55f + 0.8f * a.overallLevel );
	glDispatchCompute( groups( kWalkers, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT );

	return f.tex[0];
}

// ---------------------------------------------------------------------------
// 6. Dielectric breakdown — a branching bolt that grows itself on the GPU.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepLightning( const AudioFeatures &a, float dt, float t )
{
	const int kTips = 4096;
	Canvas &c = m_canvas[CFX_LIGHTNING];
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_LIGHTNING], size_t(kTips) * 4 * sizeof(float) ) )
		return 0;
	if( !ensureBuffer( m_buf2[CFX_LIGHTNING], 4 * sizeof(unsigned int) ) ) return 0;

	GLuint pseed = prog( P_LIGHT_FIELD, "..\\Engine\\CfxLightningSeed.comp" );
	GLuint pstep = prog( P_LIGHT_GROW,  "..\\Engine\\CfxLightningStep.comp" );
	if( !pseed || !pstep ) return 0;

	// A new bolt on every strong onset, and a fallback so quiet passages are
	// not left with an empty sky.  Cadence tightened (was 3.5s) so the storm
	// stays visibly alive even without percussive onsets.
	static float lastBolt = -100.f;
	bool strike = ( a.onsetKick > 0.55f || a.dropPulse > 0.6f )
	              && ( t - lastBolt > 0.5f );
	if( !c.seeded || strike || t - lastBolt > 2.2f )
	{
		lastBolt = t;
		c.seeded = true;
		glUseProgram( pseed );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_LIGHTNING] );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_LIGHTNING] );
		glUniform1ui( glGetUniformLocation( pseed, "capacity" ), (GLuint)kTips );
		glUniform1ui( glGetUniformLocation( pseed, "seed" ), (GLuint)( t * 811.f ) );
		float sx = 0.5f + 0.42f * sinf( t * 2.7f ) * cosf( t * 1.3f );
		glUniform1f( glGetUniformLocation( pseed, "startX" ), sx );
		// War 55+35*level: bei ruhigem Pegel starben die Laeufer nach nur
		// ~55 Schritten * 0.01 Schrittweite = 0.55 der Bildhoehe - der GESAMTE
		// untere Bildbereich blieb ausserhalb der Screen-Space-Beleuchtung
		// dauerhaft schwarz ("LightningStorm ist einfach nur schwarz").  Jetzt
		// mit satter Reserve (Wander-Ineffizienz durch die Winkel-Drift
		// eingerechnet) IMMER bis zum unteren Rand, unabhaengig vom Pegel.
		glUniform1f( glGetUniformLocation( pseed, "life" ), 170.f + 70.f * a.overallLevel );
		glDispatchCompute( groups( kTips, 128 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
	}

	clearAccum( c );
	glUseProgram( pstep );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_LIGHTNING] );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_LIGHTNING] );
	glUniform2i( glGetUniformLocation( pstep, "size" ), c.w, c.h );
	glUniform1ui( glGetUniformLocation( pstep, "capacity" ), (GLuint)kTips );
	glUniform1ui( glGetUniformLocation( pstep, "frame" ), (GLuint)( t * 1000.f ) );
	glUniform1f( glGetUniformLocation( pstep, "hue" ), a.chromaHue );
	glUniform1f( glGetUniformLocation( pstep, "level" ), a.overallLevel );
	glUniform1f( glGetUniformLocation( pstep, "branchP" ),
	             0.030f + 0.055f * a.spectralCentroid );
	glUniform1f( glGetUniformLocation( pstep, "charge" ),
	             std::min( 1.f, a.onsetKick + 0.35f * a.overallLevel ) );
	glDispatchCompute( groups( kTips, 128 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	// Long afterglow: the eye keeps a bolt far longer than it exists.
	resolve( c, 0, 3.2f, 1.f, 0.90f );
	return c.tex;
}

// ---------------------------------------------------------------------------
// 7. Caustics — wave surface + photon splatting onto the pool floor.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepCaustics( const AudioFeatures &a, float dt, float t,
                                GLuint srcImage )
{
	Field &f = m_field[CFX_CAUSTICS];
	Canvas &c = m_canvas[CFX_CAUSTICS];
	const int wW = 512, wH = 288;
	if( !ensureField( f, wW, wH, GL_RGBA16F ) ) return 0;
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;

	GLuint pw = prog( P_CAUSTIC_WAVE,   "..\\Engine\\CfxWave.comp" );
	GLuint pp = prog( P_CAUSTIC_PHOTON, "..\\Engine\\CfxPhoton.comp" );
	if( !pw || !pp ) return 0;

	// Two sub-steps: the wave then travels at a believable speed without
	// pushing the explicit integrator past its stability limit.
	for( int s = 0; s < 2; ++s )
	{
		const int cur = f.idx, nxt = 1 - f.idx;
		glUseProgram( pw );
		glBindImageTexture( 0, f.tex[cur], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 1, f.tex[nxt], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glUniform2i( glGetUniformLocation( pw, "size" ), wW, wH );
		glUniform1f( glGetUniformLocation( pw, "damp" ), 0.9965f );
		glUniform1f( glGetUniformLocation( pw, "speed" ), 0.30f );
		glUniform1f( glGetUniformLocation( pw, "kick" ), a.onsetKick );
		// One stone per sub-step at most; kicks and snares drop them in
		// different places so the surface never looks periodic.
		float amp = 0.f; float dx = 0.5f, dy = 0.5f;
		if( s == 0 && a.onsetKick > 0.45f )
		{
			amp = 0.55f * a.onsetKick;
			dx = 0.5f + 0.36f * sinf( t * 5.1f );
			dy = 0.5f + 0.30f * cosf( t * 3.7f );
		}
		else if( s == 1 && a.onsetSnare > 0.5f )
		{
			amp = 0.35f * a.onsetSnare;
			dx = 0.5f + 0.34f * cosf( t * 4.3f );
			dy = 0.5f + 0.28f * sinf( t * 6.2f );
		}
		glUniform1f( glGetUniformLocation( pw, "dropAmp" ), amp );
		glUniform2f( glGetUniformLocation( pw, "dropPos" ), dx, dy );
		glDispatchCompute( groups( wW, 16 ), groups( wH, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		f.idx = nxt;
	}

	clearAccum( c );
	glUseProgram( pp );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindImageTexture( 1, f.tex[f.idx], 0, GL_FALSE, 0, GL_READ_ONLY, GL_RGBA16F );
	glUniform2i( glGetUniformLocation( pp, "size" ), c.w, c.h );
	glUniform2i( glGetUniformLocation( pp, "waveSize" ), wW, wH );
	glUniform1f( glGetUniformLocation( pp, "depth" ), 0.55f + 0.35f * a.bassRel );
	glUniform1f( glGetUniformLocation( pp, "hue" ), a.chromaHue );
	glUniform1f( glGetUniformLocation( pp, "level" ), a.overallLevel );
	glUniform1f( glGetUniformLocation( pp, "disperse" ), 0.06f + 0.05f * a.spectralCentroid );
	glDispatchCompute( groups( wW, 16 ), groups( wH, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	resolve( c, 0, 0.30f, 1.f, 0.35f );
	return c.tex;
}
// ---------------------------------------------------------------------------
// 8. Pixel sorting — one workgroup per row, counting sort in shared memory.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepPixelSort( const AudioFeatures &a, float dt, float t,
                                 GLuint srcImage, int outW, int outH )
{
	Field &f = m_field[CFX_PIXELSORT];
	int w, h; canvasSize( outW, outH, w, h );
	if( !ensureField( f, w, h, GL_RGBA16F ) ) return 0;
	GLuint p = prog( P_SORT, "..\\Engine\\CfxPixelSort.comp" );
	if( !p ) return 0;

	// The sort KEY rotates slowly, which makes the melt appear to flow rather
	// than settling into one fixed arrangement.
	static float bias = 0.f;
	bias += dt * ( 0.03f + 0.22f * a.overallLevel );
	if( bias > 1.f ) bias -= 1.f;

	glUseProgram( p );
	glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, srcImage );
	glUniform1i( glGetUniformLocation( p, "texSrc" ), 0 );
	glUniform2i( glGetUniformLocation( p, "size" ), f.w, f.h );
	glUniform1f( glGetUniformLocation( p, "bias" ), bias );
	glUniform1i( glGetUniformLocation( p, "reverse" ), ( a.beatPhase > 0.5f ) ? 1 : 0 );
	glDispatchCompute( f.h, 1, 1 );          // one workgroup per row
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT );

	return f.tex[0];
}
// ---------------------------------------------------------------------------
// 9. 2D FFT — the audio spectrum filters the image's spatial frequencies.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepFFT( const AudioFeatures &a, float dt, float t, GLuint srcImage )
{
	const int N = 256;
	Field &f = m_field[CFX_FFT];
	if( !ensureField( f, N, N, GL_RGBA16F ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_FFT], size_t(N) * N * 2 * sizeof(float) ) ) return 0;

	GLuint pl = prog( P_FFT_H,    "..\\Engine\\CfxFFTLoad.comp" );
	GLuint pf = prog( P_FFT_V,    "..\\Engine\\CfxFFT.comp" );
	GLuint pm = prog( P_FFT_MASK, "..\\Engine\\CfxFFTMask.comp" );
	GLuint ps = prog( P_FFT_STORE, "..\\Engine\\CfxFFTStore.comp" );
	if( !pl || !pf || !pm || !ps ) return 0;

	// Bound once: the SSBO binding at index 0 persists across the glUseProgram
	// switches below, so every stage (load/transform/mask/store) reads and
	// writes the same NxN complex scratch buffer without re-binding it.
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, m_buf[CFX_FFT] );

	// 1) photo luminance -> complex
	glUseProgram( pl );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, srcImage );
	glUniform1i( glGetUniformLocation( pl, "texSrc" ), 0 );
	glUniform1i( glGetUniformLocation( pl, "N" ), N );
	glDispatchCompute( groups( N, 16 ), groups( N, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	// 2) forward transform: rows then columns
	auto fftPass = [&]( int axis, int inv )
	{
		glUseProgram( pf );
		glUniform1i( glGetUniformLocation( pf, "N" ), N );
		glUniform1i( glGetUniformLocation( pf, "axis" ), axis );
		glUniform1i( glGetUniformLocation( pf, "inverse" ), inv );
		glDispatchCompute( N, 1, 1 );          // one workgroup per line
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
	};
	fftPass( 0, 0 );
	fftPass( 1, 0 );

	// 3) the mask: 32 audio bands mapped onto the radius (= spatial frequency)
	glUseProgram( pm );
	glUniform1i( glGetUniformLocation( pm, "N" ), N );
	glUniform1fv( glGetUniformLocation( pm, "spec" ), 32, a.spectrum );
	glUniform1f( glGetUniformLocation( pm, "gain" ), 7.5f );
	glUniform1f( glGetUniformLocation( pm, "tilt" ), 0.35f + 0.9f * a.spectralCentroid );
	glUniform1f( glGetUniformLocation( pm, "swirl" ), t * 0.35f );
	glDispatchCompute( groups( N, 16 ), groups( N, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	// 4) inverse transform
	fftPass( 1, 1 );
	fftPass( 0, 1 );

	// 5) back into a texture
	glUseProgram( ps );
	glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, srcImage );
	glUniform1i( glGetUniformLocation( ps, "texSrc" ), 0 );
	glUniform1i( glGetUniformLocation( ps, "N" ), N );
	glDispatchCompute( groups( N, 16 ), groups( N, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT );

	return f.tex[0];
}
// ---------------------------------------------------------------------------
// 10. Ferrofluid — Swift-Hohenberg pattern formation (Rosensweig spikes).
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepFerro( const AudioFeatures &a, float dt, float t )
{
	// A COARSE grid on purpose.  Swift-Hohenberg selects k = 1/sqrt(qScale)
	// radians per texel, so a visible spike spacing needs qScale near 1 — and
	// then the biharmonic's stiffness (q^2 * 64) still allows a usable dt.
	// Trying to get 34-pixel spikes on a 512-wide grid put the selected mode
	// above Nyquist, which is why the first attempts aliased into fine worms.
	// Here one texel is ~10 display pixels and the spikes land ~40 px apart.
	Field &f = m_field[CFX_FERRO];
	if( !ensureField( f, 176, 99, GL_RGBA16F ) ) return 0;
	GLuint p = prog( P_FERRO, "..\\Engine\\CfxFerro.comp" );
	if( !p ) return 0;

	// The bass IS the magnet: below the threshold the surface stays flat,
	// above it the spike lattice stands up.
	// Hexagonal spikes only win NEAR the threshold; push r far above it and the
	// stripe (labyrinth) phase takes over, so keep the ceiling low.
	float r = -0.15f + 0.40f * a.bassRel * ( 0.35f + a.overallLevel )
	          + 0.25f * a.onsetKick;
	if( r > 0.30f ) r = 0.30f;

	for( int s = 0; s < 8; ++s )
	{
		const int cur = f.idx, nxt = 1 - f.idx;
		glUseProgram( p );
		glBindImageTexture( 0, f.tex[cur], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 1, f.tex[nxt], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glUniform2i( glGetUniformLocation( p, "size" ), f.w, f.h );
		glUniform1f( glGetUniformLocation( p, "rParam" ), r );
		// The selected mode is where q * |laplacian eigenvalue| = 1.  The
		// small-k shortcut |lap| = k^2 is what made the first guesses come out
		// too fine: at these wavenumbers the DISCRETE eigenvalue 2(1-cos k) per
		// axis is what counts.  q = 1.2 puts it at k ~ 0.95 rad/texel, i.e. a
		// ~7-texel spacing.  dt must stay under 2/(q^2 * 64) for stability.
		glUniform1f( glGetUniformLocation( p, "qScale" ), 1.20f );
		glUniform1f( glGetUniformLocation( p, "gQuad" ), 0.60f );
		glUniform1f( glGetUniformLocation( p, "dt" ), 0.018f );
		glUniform1f( glGetUniformLocation( p, "kick" ), a.onsetKick );
		// A flat field is a fixed point of the equation, so it needs a seed to
		// break symmetry — always a trickle, a burst on transients.
		glUniform1f( glGetUniformLocation( p, "seedAmp" ),
		             f.seeded ? ( 0.004f + 0.10f * a.onsetKick ) : 0.9f );
		glUniform1ui( glGetUniformLocation( p, "frame" ),
		              (GLuint)( t * 997.f ) + (GLuint)s );
		glDispatchCompute( groups( f.w, 16 ), groups( f.h, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		f.idx = nxt;
	}
	f.seeded = true;
	glMemoryBarrier( GL_TEXTURE_FETCH_BARRIER_BIT );
	return f.tex[f.idx];
}

// ---------------------------------------------------------------------------
// 11. Hydraulic erosion — droplets carving a landscape in real time.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepErosion( const AudioFeatures &a, float dt, float t )
{
	// 8k droplets x 64 steps x a 3x3 kernel rewrote every texel ~18 times per
	// frame and sanded the whole landscape flat within seconds.  2k keeps it
	// near one touch per texel per frame, which carves instead of polishing.
	const int kDrops = 1 << 11;              // 2,048 droplets per frame
	Field &f = m_field[CFX_EROSION];
	if( !ensureField( f, 512, 512, GL_RGBA16F ) ) return 0;

	GLuint pseed = prog( P_EROSION_SEED, "..\\Engine\\CfxErosionSeed.comp" );
	GLuint pstep = prog( P_EROSION,      "..\\Engine\\CfxErosion.comp" );
	if( !pseed || !pstep ) return 0;

	// Erosion has no counterbalance here, so left running it does exactly what
	// it does in nature: it grinds the mountains down to a plain, and the scene
	// goes dead.  Re-raising the land every ~14 s turns that into the point of
	// the effect — peaks appear, the drainage network cuts in, repeat.
	static float lastSeed = -1000.f;
	if( ( !f.seeded || a.dropPulse > 0.85f ) && t - lastSeed > 14.f )
	{
		lastSeed = t;
		glUseProgram( pseed );
		glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glUniform2i( glGetUniformLocation( pseed, "size" ), f.w, f.h );
		glUniform1ui( glGetUniformLocation( pseed, "seed" ), (GLuint)( t * 331.f ) + 1u );
		glDispatchCompute( groups( f.w, 16 ), groups( f.h, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		f.seeded = true;
	}

	glUseProgram( pstep );
	glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_READ_WRITE, GL_RGBA16F );
	glUniform2i( glGetUniformLocation( pstep, "size" ), f.w, f.h );
	glUniform1ui( glGetUniformLocation( pstep, "count" ), (GLuint)kDrops );
	glUniform1ui( glGetUniformLocation( pstep, "frame" ), (GLuint)( t * 1000.f ) );
	glUniform1f( glGetUniformLocation( pstep, "rain" ), 0.5f + 1.6f * a.overallLevel );
	glUniform1f( glGetUniformLocation( pstep, "capacityK" ),
	             2.2f + 2.5f * a.onsetKick );
	glDispatchCompute( groups( kDrops, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT );

	return f.tex[0];
}

// ---------------------------------------------------------------------------
// 12. Navier-Stokes with a real pressure projection.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepNSFluid( const AudioFeatures &a, float dt, float t,
                               GLuint srcImage )
{
	const int W = 512, H = 288;
	Field &vel = m_field[CFX_NSFLUID];     // RG = velocity
	Field &dye = m_field2[CFX_NSFLUID];    // RGB = colour, A = density
	Canvas &out = m_canvas[CFX_NSFLUID];   // published result (tex only)
	if( !ensureField( vel, W, H, GL_RGBA16F ) ) return 0;
	if( !ensureField( dye, W, H, GL_RGBA16F ) ) return 0;
	if( !ensureCanvas( out, W, H ) ) return 0;

	GLuint pa = prog( P_NS_ADVECT,  "..\\Engine\\CfxNSAdvect.comp" );
	GLuint pd = prog( P_NS_DIV,     "..\\Engine\\CfxNSDiv.comp" );
	GLuint pj = prog( P_NS_JACOBI,  "..\\Engine\\CfxNSJacobi.comp" );
	GLuint pp = prog( P_NS_PROJECT, "..\\Engine\\CfxNSProject.comp" );
	if( !pa || !pd || !pj || !pp ) return 0;

	Field &prs = m_nsPressure;
	if( !ensureField( prs, W, H, GL_RGBA16F ) ) return 0;

	static float jetPhase = 0.f;
	jetPhase += dt * ( 0.35f + 1.1f * a.overallLevel );

	// ---- 1) advect velocity + dye, apply forces ----
	{
		const int vc = vel.idx, vn = 1 - vel.idx;
		const int dc = dye.idx, dn = 1 - dye.idx;
		glUseProgram( pa );
		glBindImageTexture( 0, vel.tex[vc], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 1, vel.tex[vn], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glBindImageTexture( 2, dye.tex[dc], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 3, dye.tex[dn], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, srcImage );
		glUniform1i( glGetUniformLocation( pa, "texPhoto" ), 0 );
		glUniform2i( glGetUniformLocation( pa, "size" ), W, H );
		glUniform1f( glGetUniformLocation( pa, "dt" ), 0.9f );
		glUniform1f( glGetUniformLocation( pa, "dissipation" ), 0.994f );
		glUniform1f( glGetUniformLocation( pa, "kick" ), a.onsetKick );
		glUniform1f( glGetUniformLocation( pa, "level" ), a.overallLevel );
		glUniform1f( glGetUniformLocation( pa, "hue" ), a.chromaHue );
		float jx = 0.5f + 0.32f * sinf( jetPhase * 0.7f );
		float jy = 0.5f + 0.26f * cosf( jetPhase * 0.53f );
		glUniform2f( glGetUniformLocation( pa, "jetPos" ), jx, jy );
		glUniform2f( glGetUniformLocation( pa, "jetDir" ),
		             cosf( jetPhase * 1.7f ), sinf( jetPhase * 1.7f ) );
		glUniform1f( glGetUniformLocation( pa, "jetAmp" ),
		             0.010f + 0.055f * a.onsetKick + 0.020f * a.overallLevel );
		glDispatchCompute( groups( W, 16 ), groups( H, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		vel.idx = vn; dye.idx = dn;
	}

	// ---- 2) divergence ----
	glUseProgram( pd );
	glBindImageTexture( 0, vel.tex[vel.idx], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
	glBindImageTexture( 1, prs.tex[0],       0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
	glUniform2i( glGetUniformLocation( pd, "size" ), W, H );
	glDispatchCompute( groups( W, 16 ), groups( H, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );

	// ---- 3) Jacobi iterations on the pressure Poisson equation ----
	prs.idx = 0;
	for( int i = 0; i < 24; ++i )
	{
		const int c = prs.idx, n = 1 - prs.idx;
		glUseProgram( pj );
		glBindImageTexture( 0, prs.tex[c], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 1, prs.tex[n], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glUniform2i( glGetUniformLocation( pj, "size" ), W, H );
		glDispatchCompute( groups( W, 16 ), groups( H, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		prs.idx = n;
	}

	// ---- 4) subtract the pressure gradient, publish ----
	glUseProgram( pp );
	glBindImageTexture( 0, vel.tex[vel.idx], 0, GL_FALSE, 0, GL_READ_WRITE, GL_RGBA16F );
	glBindImageTexture( 1, prs.tex[prs.idx], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
	glBindImageTexture( 2, dye.tex[dye.idx], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
	glBindImageTexture( 3, out.tex,          0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
	glUniform2i( glGetUniformLocation( pp, "size" ), W, H );
	glDispatchCompute( groups( W, 16 ), groups( H, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT );

	return out.tex;
}
// ---------------------------------------------------------------------------
// 13. Liquid metal — cohesive particles rendered as a screen-space surface.
// ---------------------------------------------------------------------------

// The trailing GLuint (srcImage) is intentionally unnamed: this kind's
// particles are self-contained and never sample the photo, but the parameter
// is kept so step()'s call site stays uniform with the other photo-consuming
// kinds.
GLuint ComputeFX::stepMetal( const AudioFeatures &a, float dt, float t, GLuint )
{
	const int kParts = 1 << 16;              // 65,536
	const int kGrid = 96, kPerCell = 32;
	Canvas &c = m_canvas[CFX_METAL];
	// A DELIBERATELY small canvas.  Screen-space fluid needs the particle
	// discs to overlap into a continuous density field; at 1280x720 the same
	// population reads as speckle, and no amount of thresholding recovers a
	// surface from it.  640x360 quadruples the density per pixel.
	if( !ensureCanvas( c, 640, 360 ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_METAL], size_t(kParts) * 4 * sizeof(float) ) ) return 0;
	if( !ensureBuffer( m_buf2[CFX_METAL],
	                   size_t(kGrid) * kGrid * ( kPerCell + 1 ) * sizeof(unsigned int) ) )
		return 0;

	GLuint pi = prog( P_PART_INIT,  "..\\Engine\\CfxParticleInit.comp" );
	GLuint ps = prog( P_METAL_STEP, "..\\Engine\\CfxMetalStep.comp" );
	if( !pi || !ps ) return 0;

	if( !c.seeded )
	{
		glUseProgram( pi );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_METAL] );
		glUniform1ui( glGetUniformLocation( pi, "count" ), (GLuint)kParts );
		glDispatchCompute( groups( kParts, 256 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
		c.seeded = true;
	}

	static float swirl = 0.f;
	swirl = 0.25f + 0.5f * sinf( t * 0.11f );

	const unsigned int zero = 0;
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, m_buf2[CFX_METAL] );
	glClearBufferData( GL_SHADER_STORAGE_BUFFER, GL_R32UI, GL_RED_INTEGER,
	                   GL_UNSIGNED_INT, &zero );
	glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );

	clearAccum( c );
	for( int pass = 1; pass >= 0; --pass )     // 1 = bin, 0 = simulate + splat
	{
		glUseProgram( ps );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_METAL] );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_METAL] );
		glUniform2i( glGetUniformLocation( ps, "size" ), c.w, c.h );
		glUniform1ui( glGetUniformLocation( ps, "count" ), (GLuint)kParts );
		glUniform1i( glGetUniformLocation( ps, "gridN" ), kGrid );
		glUniform1i( glGetUniformLocation( ps, "perCell" ), kPerCell );
		glUniform1f( glGetUniformLocation( ps, "dt" ), 0.55f );
		glUniform1f( glGetUniformLocation( ps, "kick" ), a.onsetKick );
		glUniform1f( glGetUniformLocation( ps, "level" ), a.overallLevel );
		glUniform1f( glGetUniformLocation( ps, "swirl" ), swirl );
		glUniform1i( glGetUniformLocation( ps, "buildGrid" ), pass );
		glDispatchCompute( groups( kParts, 256 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
	}

	resolve( c, 0, 1.0f, 1.f, 0.0f );          // no trails: it is a SURFACE
	return c.tex;
}

// ---------------------------------------------------------------------------
// 14. Shatter & reassemble.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepShards( const AudioFeatures &a, float dt, float t,
                              GLuint srcImage )
{
	const int gx = 48, gy = 27;
	const int kShards = gx * gy;
	Canvas &c = m_canvas[CFX_SHARDS];
	int w, h; canvasSize( 1920, 1080, w, h );
	if( !ensureCanvas( c, w, h ) ) return 0;
	if( !ensureBuffer( m_buf[CFX_SHARDS],  size_t(kShards) * 4 * sizeof(float) ) ) return 0;
	if( !ensureBuffer( m_buf2[CFX_SHARDS], size_t(kShards) * 4 * sizeof(float) ) ) return 0;

	GLuint pi = prog( P_SHARD_INIT, "..\\Engine\\CfxShardInit.comp" );
	GLuint ps = prog( P_SHARD_STEP, "..\\Engine\\CfxShardStep.comp" );
	if( !pi || !ps ) return 0;

	// Every strong transient blows the picture apart again; between bursts the
	// spring pulls every shard home and it re-assembles.
	static float lastBurst = -100.f;
	bool burst = ( a.onsetKick > 0.62f || a.dropPulse > 0.6f )
	             && ( t - lastBurst > 3.2f );
	if( !c.seeded || burst )
	{
		lastBurst = t;
		c.seeded = true;
		glUseProgram( pi );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_SHARDS] );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_SHARDS] );
		glUniform1ui( glGetUniformLocation( pi, "count" ), (GLuint)kShards );
		glUniform1ui( glGetUniformLocation( pi, "seed" ), (GLuint)( t * 733.f ) + 1u );
		glUniform1f( glGetUniformLocation( pi, "burst" ),
		             0.10f + 0.16f * a.onsetKick + 0.18f * a.dropPulse );
		glDispatchCompute( groups( kShards, 256 ), 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
	}

	clearAccum( c );
	glUseProgram( ps );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, c.ssbo );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_buf[CFX_SHARDS] );
	glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_buf2[CFX_SHARDS] );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, srcImage );
	glUniform1i( glGetUniformLocation( ps, "texPhoto" ), 0 );
	glUniform2i( glGetUniformLocation( ps, "size" ), c.w, c.h );
	glUniform2i( glGetUniformLocation( ps, "grid" ), gx, gy );
	glUniform1f( glGetUniformLocation( ps, "dt" ), 0.9f );
	glUniform1f( glGetUniformLocation( ps, "springK" ), 2.2f );
	glUniform1f( glGetUniformLocation( ps, "damp" ), 0.985f );
	glUniform1f( glGetUniformLocation( ps, "gravity" ), 0.35f );
	glUniform1f( glGetUniformLocation( ps, "level" ), a.overallLevel );
	glDispatchCompute( groups( kShards, 256 ), 1, 1 );
	glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

	resolve( c, 0, 1.0f, 1.f, 0.0f );
	return c.tex;
}

// ---------------------------------------------------------------------------
// 15. Cloth — a Verlet mass-spring sheet as a displacement field.
// ---------------------------------------------------------------------------

GLuint ComputeFX::stepCloth( const AudioFeatures &a, float dt, float t )
{
	// Verlet needs x(t) and x(t-1) — and x(t-1) is dead once x(t+1) exists, so
	// the new state goes straight into the slot the old one occupied.  Two
	// textures are enough; a third "previous" field would just be bookkeeping.
	Field &f = m_field[CFX_CLOTH];
	const int W = 256, H = 144;
	if( !ensureField( f, W, H, GL_RGBA16F ) ) return 0;

	GLuint pi = prog( P_CLOTH_INIT, "..\\Engine\\CfxClothInit.comp" );
	GLuint ps = prog( P_CLOTH_STEP, "..\\Engine\\CfxCloth.comp" );
	if( !pi || !ps ) return 0;

	if( !f.seeded )
	{
		glUseProgram( pi );
		glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glBindImageTexture( 1, f.tex[1], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glUniform2i( glGetUniformLocation( pi, "size" ), W, H );
		glDispatchCompute( groups( W, 16 ), groups( H, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		f.seeded = true;
	}

	static float wind = 0.f;
	wind += dt * ( 0.5f + 1.6f * a.overallLevel );

	// Several relaxation steps per frame: one Jacobi pass on a 256-wide sheet
	// propagates a disturbance by one texel, which would look like treacle.
	for( int s = 0; s < 4; ++s )
	{
		const int cur = f.idx, prev = 1 - f.idx;
		glUseProgram( ps );
		glBindImageTexture( 0, f.tex[cur],  0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 1, f.tex[prev], 0, GL_FALSE, 0, GL_READ_ONLY,  GL_RGBA16F );
		glBindImageTexture( 2, f.tex[prev], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
		glUniform2i( glGetUniformLocation( ps, "size" ), W, H );
		glUniform1f( glGetUniformLocation( ps, "damp" ), 0.988f );
		glUniform1f( glGetUniformLocation( ps, "stiff" ), 0.22f );
		glUniform1f( glGetUniformLocation( ps, "gravity" ), 0.00035f );
		glUniform1f( glGetUniformLocation( ps, "windPhase" ), wind );
		glUniform1f( glGetUniformLocation( ps, "windAmp" ), 0.0016f );
		glUniform1f( glGetUniformLocation( ps, "kick" ), a.onsetKick * 0.004f );
		glUniform1f( glGetUniformLocation( ps, "level" ), a.overallLevel );
		glUniform1f( glGetUniformLocation( ps, "time" ), t );
		glDispatchCompute( groups( W, 16 ), groups( H, 16 ), 1 );
		glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
		f.idx = prev;              // what we just wrote is the new current
	}
	glMemoryBarrier( GL_TEXTURE_FETCH_BARRIER_BIT );
	return f.tex[f.idx];
}

GLuint ComputeFX::stepSculpt( const AudioFeatures &, float, float ) { return 0; }

// ---------------------------------------------------------------------------
// 17. Deep-zoom Mandelbrot — double-single emulated precision per pixel.
// ---------------------------------------------------------------------------

// A small set of hand-picked boundary coordinates known to have interesting
// filament/spiral structure at depth; cycled through on each zoom-depth
// reset so the dive never repeats the same neighbourhood twice in a row.
// Split into a (hi, lo) float32 pair at file-load time via real double
// arithmetic -- exact to full double precision, which is all the
// double-single GLSL representation can use anyway.
namespace {
struct MbTarget { double re, im; };
const MbTarget kMbTargets[] = {
	{ -0.7453983606667815,  0.1125046349959942 },   // "seahorse valley" spiral
	{ -0.235125,            0.827215           },   // mini-Mandelbrot approach
	{ -1.7490597277748394,  0.0000005996817   },   // deep filament off the main cusp
	{ -0.16070135,         -1.0375665         },   // dendrite cluster
};
const int kMbTargetCount = int( sizeof(kMbTargets) / sizeof(kMbTargets[0]) );

inline void dsSplit( double v, float &hi, float &lo )
{
	hi = float( v );
	lo = float( v - double( hi ) );
}
}

GLuint ComputeFX::stepMandelbrot( const AudioFeatures &a, float dt, float t, int outW, int outH )
{
	// Deliberately NOT a registered CfxKind/kCfxInfo entry (unlike every
	// other sim in this file): units 0-31 are already fully claimed by
	// existing features on a 32-texture-unit GPU (the common NVIDIA fragment-
	// stage cap), and ComputeFX::init()'s kind-gating pre-emptively kills any
	// kind whose unit doesn't fit under that -- a deliberate safety margin
	// for the OTHER kinds that this one has no room left to share. Bound to
	// its own dedicated unit directly by RenderPipeline.cpp instead, exactly
	// like texBake/texPrevFrame (EffectShader.cpp) already do -- best-effort
	// on GPUs with more headroom, gracefully absent (not force-killed) on
	// GPUs at the 32-unit cap.
	Field &f = m_mandelbrotField;
	int w, h; canvasSize( outW, outH, w, h );
	if( !ensureField( f, w, h, GL_RGBA16F ) ) return 0;
	GLuint p = prog( P_MANDELBROT, "..\\Engine\\CfxMandelbrot.comp" );
	if( !p ) return 0;

	// Log-zoom depth: an integrated accumulator, audio modulates the RATE
	// (never time*audio directly -- V7). Resets to kMinZoomLog (NOT 0 -- the
	// hand-picked targets sit at real boundary filaments, so a truly wide
	// zoomLog=0 view shows mostly the flat exterior "lake" around them; a
	// small starting depth skips straight to filled boundary detail, which
	// is what "screen-filling" actually wants) and advances to the next
	// target once double-single precision runs out.
	static float zoomLog  = 3.5f;
	static int   targetSel = 0;
	const float kMinZoomLog = 3.5f;
	const float kMaxZoomLog = 19.0f;   // e^19 =~ 1.8e-9 window -- inside ds precision headroom
	zoomLog += dt * ( 0.16f + 0.30f * a.overallLevel );
	if( zoomLog > kMaxZoomLog )
	{
		zoomLog   = kMinZoomLog;
		targetSel = ( targetSel + 1 ) % kMbTargetCount;
	}
	const float zoomScale = expf( -zoomLog );

	float cxHi, cxLo, cyHi, cyLo;
	dsSplit( kMbTargets[targetSel].re, cxHi, cxLo );
	dsSplit( kMbTargets[targetSel].im, cyHi, cyLo );

	int maxIter = int( 90.0f + zoomLog * 14.0f );
	if( maxIter > 620 ) maxIter = 620;

	glUseProgram( p );
	glBindImageTexture( 0, f.tex[0], 0, GL_FALSE, 0, GL_WRITE_ONLY, GL_RGBA16F );
	glUniform2i( glGetUniformLocation( p, "size" ), f.w, f.h );
	glUniform2f( glGetUniformLocation( p, "centerHi" ), cxHi, cyHi );
	glUniform2f( glGetUniformLocation( p, "centerLo" ), cxLo, cyLo );
	glUniform1f( glGetUniformLocation( p, "zoomScale" ), zoomScale );
	glUniform1i( glGetUniformLocation( p, "maxIter" ), maxIter );
	glUniform1f( glGetUniformLocation( p, "rot" ), zoomLog * 0.05f + a.spectralCentroid * 0.3f );
	glDispatchCompute( groups( f.w, 16 ), groups( f.h, 16 ), 1 );
	glMemoryBarrier( GL_SHADER_IMAGE_ACCESS_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT );

	f.lastUse = t;   // bespoke field, not covered by step()'s generic per-kind stamping
	return f.tex[0];
}

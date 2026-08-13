// ComputeFX.cpp — see ComputeFX.h.
#include "ComputeFX.h"
#include "shader_setup.h"

#include <stdio.h>
#include <math.h>
#include <string.h>
#include <vector>

// Global sampler units.  Units 0..11 are taken by the slideshow images and the
// older sims (texSim 7, texFluid 8, texSmoke3D 9, texSSM 10, texPhysarum 11).
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
};

namespace {

// Fixed-point scale for the uint accumulator: atomicAdd on floats needs an
// optional extension, uint atomics are core.  256 keeps ~2 decimal digits of
// colour precision and still allows ~16M accumulated units per pixel.
const float kSplatScale = 256.f;

// Splat canvases run at a fixed short side; they are smooth density fields, so
// rendering them at display resolution buys nothing and costs a lot.
const int kCanvasW = 1280;

// Compute-program slots (index into ComputeFX::m_prog).
enum {
	P_RESOLVE = 0, P_FLAME, P_PART_INIT, P_PART_STEP, P_NBODY_INIT, P_NBODY_STEP,
	P_BOIDS_INIT, P_BOIDS_GRID, P_BOIDS_STEP, P_CRYSTAL, P_CRYSTAL_SEED,
	P_LIGHT_FIELD, P_LIGHT_GROW, P_CAUSTIC_WAVE, P_CAUSTIC_PHOTON,
	P_SORT, P_FFT_H, P_FFT_V, P_FFT_MASK, P_FERRO, P_EROSION,
	P_METAL_STEP, P_METAL_SPLAT, P_SHARD_INIT, P_SHARD_STEP
};

inline int groups( int n, int local ) { return ( n + local - 1 ) / local; }

} // namespace

ComputeFX::~ComputeFX()
{
	for( int k = 0; k < CFX_COUNT; ++k )
	{
		freeCanvas( m_canvas[k] );
		freeField( m_field[k] );
		if( m_buf[k] )  glDeleteBuffers( 1, &m_buf[k] );
		if( m_buf2[k] ) glDeleteBuffers( 1, &m_buf2[k] );
	}
	for( int i = 0; i < kProgSlots; ++i )
		if( m_prog[i] ) glDeleteProgram( m_prog[i] );
}

void ComputeFX::init()
{
	m_ok = glcoreHasCompute != 0;
	glGetIntegerv( GL_MAX_TEXTURE_IMAGE_UNITS, &m_maxTexUnits );
	fprintf( stderr, "ComputeFX: %s, %d fragment texture units\n",
	         m_ok ? "enabled" : "disabled", m_maxTexUnits );
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
	if( b ) return true;
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
	GLuint p = prog( P_RESOLVE, "..\\Blend\\CfxResolve.comp" );
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
	}
	if( !tex ) m_dead[k] = true;    // a failed program never becomes good again
	m_canvas[k].lastUse = t;
	m_field[k].lastUse  = t;
	glUseProgram( 0 );
	return tex;
}

// Canvas geometry for the splat sims: fixed short side, display aspect kept.
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
	GLuint p = prog( P_FLAME, "..\\Blend\\CfxFlame.comp" );
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

	GLuint pi = prog( P_PART_INIT, "..\\Blend\\CfxParticleInit.comp" );
	GLuint ps = prog( P_PART_STEP, "..\\Blend\\CfxParticleStep.comp" );
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

	GLuint pi = prog( P_NBODY_INIT, "..\\Blend\\CfxNBodyInit.comp" );
	GLuint ps = prog( P_NBODY_STEP, "..\\Blend\\CfxNBodyStep.comp" );
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

	GLuint pi = prog( P_BOIDS_INIT, "..\\Blend\\CfxBoidsInit.comp" );
	GLuint pg = prog( P_BOIDS_GRID, "..\\Blend\\CfxBoidsGrid.comp" );
	GLuint ps = prog( P_BOIDS_STEP, "..\\Blend\\CfxBoidsStep.comp" );
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

GLuint ComputeFX::stepCrystal  ( const AudioFeatures &, float, float ) { return 0; }
GLuint ComputeFX::stepLightning( const AudioFeatures &, float, float ) { return 0; }
GLuint ComputeFX::stepCaustics ( const AudioFeatures &, float, float, GLuint ) { return 0; }
GLuint ComputeFX::stepPixelSort( const AudioFeatures &, float, float, GLuint, int, int ) { return 0; }
GLuint ComputeFX::stepFFT      ( const AudioFeatures &, float, float, GLuint ) { return 0; }
GLuint ComputeFX::stepFerro    ( const AudioFeatures &, float, float ) { return 0; }
GLuint ComputeFX::stepErosion  ( const AudioFeatures &, float, float ) { return 0; }
GLuint ComputeFX::stepMetal    ( const AudioFeatures &, float, float, GLuint ) { return 0; }
GLuint ComputeFX::stepShards   ( const AudioFeatures &, float, float, GLuint ) { return 0; }

// ComputeFX.h — GL 4.3 compute-shader visual subsystems.
// ---------------------------------------------------------------------------
// Everything in here needs capabilities a fragment shader does not have:
// scattered writes (a thread decides WHERE it writes), atomics, workgroup
// shared memory or shader-storage buffers.  Each "kind" is an independent
// simulation that publishes ONE texture on its own global sampler unit; an
// effect shader opts in simply by declaring that sampler (same convention as
// the older texSim / texFluid / texPhysarum fields).
//
// Every kind fails SOFT: if compute is unavailable, a program fails to build
// or an allocation fails, step() returns 0 and the display effect just sees
// an empty field instead of the app dying.
#pragma once

#include "glcore.h"
#include "AudioFeatures.h"

// Sim identities.  Adding one = an entry here + a row in kCfxInfo + a step
// function; nothing else in the engine needs to change.
enum CfxKind
{
	CFX_FLAME = 0,     // fractal flames (IFS + atomic density histogram)
	CFX_PARTICLES,     // millions of particles advected through a flow field
	CFX_NBODY,         // gravitational N-body galaxy (shared-memory tiling)
	CFX_BOIDS,         // flocking with a real spatial-hash neighbourhood
	CFX_CRYSTAL,       // diffusion-limited aggregation (frost / coral)
	CFX_LIGHTNING,     // dielectric breakdown (Laplace field + growth)
	CFX_CAUSTICS,      // wave surface + photon splatting
	CFX_PIXELSORT,     // per-row bitonic luminance sort (glitch melt)
	CFX_FFT,           // 2D FFT: the audio spectrum filters the image spectrum
	CFX_FERRO,         // ferrofluid spikes (surface tension + magnetic field)
	CFX_EROSION,       // hydraulic erosion heightfield
	CFX_METAL,         // screen-space fluid (metaball mercury)
	CFX_SHARDS,        // shatter & reassemble
	CFX_COUNT
};

struct CfxInfo
{
	const char *sampler;   // uniform name an effect declares to request this sim
	int         unit;      // global texture unit it is published on
};
extern const CfxInfo kCfxInfo[CFX_COUNT];

class ComputeFX
{
public:
	ComputeFX() {}
	~ComputeFX();

	// Query the GL limits + compute availability once (context must be current).
	void init();
	bool available() const { return m_ok; }

	// Advance sim `k` by one frame and return the texture to bind on its unit.
	// `srcImage` is the current slideshow photo (some sims consume it).
	// Returns 0 when the sim is unavailable — caller then binds nothing.
	GLuint step( int k, const AudioFeatures &a, float dt, float time,
	             GLuint srcImage, int outW, int outH );

	// Free a sim's GPU memory when it has not been on screen for a while.
	void retireIdle( float now );

private:
	// ---- shared splat canvas (uint accumulator -> RGBA16F image) ----
	// Used by every sim that scatters colour into the frame.  The accumulator
	// is fixed-point (kSplatScale) because atomicAdd on floats is an optional
	// GL extension, while uint atomics are core.
	struct Canvas
	{
		GLuint ssbo = 0;      // w*h*4 uints: R,G,B,hits
		GLuint tex  = 0;      // RGBA16F result
		int    w = 0, h = 0;
		float  lastUse = 0.f;
		bool   seeded = false;
	};
	bool  ensureCanvas( Canvas &c, int w, int h );
	void  clearAccum( const Canvas &c );
	void  resolve( const Canvas &c, int mode, float exposure, float gamma,
	               float decay );
	void  freeCanvas( Canvas &c );

	// Generic ping-pong field (RGBA16F) for the grid-based sims.
	struct Field
	{
		GLuint tex[2] = { 0, 0 };
		int    w = 0, h = 0, idx = 0;
		float  lastUse = 0.f;
		bool   seeded = false;
	};
	bool  ensureField( Field &f, int w, int h, GLenum fmt );
	void  freeField( Field &f );

	// Storage buffer helper (agent/particle state).
	bool  ensureBuffer( GLuint &b, size_t bytes );

	GLuint prog( int slot, const char *file );   // cached compute program

	// ---- per-kind steps ----
	GLuint stepFlame    ( const AudioFeatures &a, float dt, float t );
	GLuint stepParticles( const AudioFeatures &a, float dt, float t, GLuint src );
	GLuint stepNBody    ( const AudioFeatures &a, float dt, float t );
	GLuint stepBoids    ( const AudioFeatures &a, float dt, float t );
	GLuint stepCrystal  ( const AudioFeatures &a, float dt, float t );
	GLuint stepLightning( const AudioFeatures &a, float dt, float t );
	GLuint stepCaustics ( const AudioFeatures &a, float dt, float t, GLuint src );
	GLuint stepPixelSort( const AudioFeatures &a, float dt, float t, GLuint src,
	                      int outW, int outH );
	GLuint stepFFT      ( const AudioFeatures &a, float dt, float t, GLuint src );
	GLuint stepFerro    ( const AudioFeatures &a, float dt, float t );
	GLuint stepErosion  ( const AudioFeatures &a, float dt, float t );
	GLuint stepMetal    ( const AudioFeatures &a, float dt, float t, GLuint src );
	GLuint stepShards   ( const AudioFeatures &a, float dt, float t, GLuint src );

	bool   m_ok = false;
	int    m_maxTexUnits = 16;
	float  m_now = 0.f;

	enum { kProgSlots = 40 };
	GLuint m_prog[kProgSlots] = { 0 };
	char   m_progTried[kProgSlots] = { 0 };

	// Per-kind resources (only allocated once a kind is actually requested).
	Canvas m_canvas[CFX_COUNT];
	Field  m_field[CFX_COUNT];
	GLuint m_buf[CFX_COUNT] = { 0 };
	GLuint m_buf2[CFX_COUNT] = { 0 };
	bool   m_dead[CFX_COUNT] = { false };   // setup failed -> never retry
};

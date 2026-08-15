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
#include "CfxTypes.h"   // CfxKind / CfxInfo / kCfxInfo -- split out so code that
                        // only needs to name a kind doesn't need glcore.h too.

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
	GLuint stepNSFluid  ( const AudioFeatures &a, float dt, float t, GLuint src );
	GLuint stepCloth    ( const AudioFeatures &a, float dt, float t );
	GLuint stepSculpt   ( const AudioFeatures &a, float dt, float t );

	// Extra ping-pong slot for sims that need a second field (velocity vs dye).
	Field  m_field2[CFX_COUNT];
	// The Navier-Stokes solver needs a third: the pressure it iterates on.
	Field  m_nsPressure;

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

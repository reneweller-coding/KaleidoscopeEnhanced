//---------------------------------------------------------------------------
//                              ComputeFX
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Declares ComputeFX, the GL 4.3 compute-shader subsystem that runs ~26 audio-reactive simulations (fractal
 *  flames, particle flow, N-body, fluids, etc.) and publishes each as a texture.
 *
 *  GL 4.3 compute-shader visual subsystems.
 *  Everything in here needs capabilities a fragment shader does not have:
 *  scattered writes (a thread decides WHERE it writes), atomics, workgroup
 *  shared memory or shader-storage buffers.  Each "kind" is an independent
 *  simulation that publishes ONE texture on its own global sampler unit; an
 *  effect shader opts in simply by declaring that sampler (same convention as
 *  the older texSim / texFluid / texPhysarum fields).
 *
 *  Every kind fails SOFT: if compute is unavailable, a program fails to build
 *  or an allocation fails, step() returns 0 and the display effect just sees
 *  an empty field instead of the app dying.
 *
 *  @author René Weller
 */

#pragma once

#include "glcore.h"
#include "AudioFeatures.h"
#include "CfxTypes.h" // CfxKindE / CfxInfo / CfxInfoTable -- split out so code that
                      // only needs to name a kind doesn't need glcore.h too.

/** @class ComputeFX
 *
 * Owns and drives every GL 4.3 compute-shader simulation ("kind").
 *
 * ComputeFX is a grab-bag of independent GPU simulations — fractal flames,
 * particle flow, N-body gravity, boids, DLA crystal growth, lightning,
 * caustics, pixel sorting, an audio-driven 2D FFT filter, ferrofluid,
 * hydraulic erosion, liquid metal, shatter/reassemble, Navier-Stokes fluid,
 * cloth, and a (stubbed) 3D sculpt — each identified by a CfxKindE. Per-kind
 * GPU resources (a splat Canvas, a ping-pong Field, and/or raw SSBOs) are
 * allocated lazily the first time that kind is stepped, and freed again by
 * retireIdle() once a kind has not been requested for a while, so the
 * resident GPU memory tracks only the kinds actually in use. Every kind
 * fails soft: if compute is unavailable, a shader fails to compile, or an
 * allocation fails, the corresponding step function returns 0, step() marks
 * the kind dead so it is never retried, and the caller just sees an empty
 * texture instead of the application crashing.
 **/
class ComputeFX
{
public:
    /** Default-constructs with no GL resources allocated; call init() once a context is current. */
    ComputeFX() {}
    /** Frees every GL object (canvases, fields, buffers, programs) owned by any kind. */
    ~ComputeFX();

    // Query the GL limits + compute availability once (context must be current).
    /**  Detects compute-shader availability and GL texture-unit limits.
     *
     * Must be called once with a current GL context, before any step() call.
     * Sets m_ok from glcoreHasCompute and queries GL_MAX_TEXTURE_IMAGE_UNITS;
     * any CfxKindE whose published unit (CfxInfoTable) does not fit under that
     * limit is immediately marked dead so it is never attempted.
     **/
    void init();
    /**  Whether compute-shader support was detected by init().
     *
     * @return
     *   true if GL 4.3 compute is usable, false if every kind will fail soft.
     **/
    bool available() const { return m_ok; }

    // Advance sim `k` by one frame and return the texture to bind on its unit.
    // `srcImage` is the current slideshow photo (some sims consume it).
    // Returns 0 when the sim is unavailable — caller then binds nothing.
    /**  Advances one simulation kind by a frame and returns its output texture.
     *
     * @param k         Which simulation to advance (a CfxKindE index). (in)
     * @param a         Current audio-reactive features driving the sim's parameters. (in)
     * @param dt        Frame delta time in seconds. (in)
     * @param t         Elapsed time in seconds (used to integrate host-side phases). (in)
     * @param srcImage  The current slideshow photo texture; consumed by sims that use it as input. (in)
     * @param outW      Current output/display width, used to size some sims' canvases to the display aspect. (in)
     * @param outH      Current output/display height, used to size some sims' canvases to the display aspect. (in)
     *
     * @return
     *   The GL texture name to bind for this kind, or 0 if unavailable.
     *
     * Dispatches the compute shader(s) for kind `k`, driven by the current
     * audio features and elapsed time, and returns the GL texture name the
     * effect shader should bind on that kind's sampler unit (see CfxInfoTable).
     * A non-positive or too-large `dt` is clamped to a nominal 1/60s so a
     * stall or hitch never destabilises an integrator. If the kind is
     * unavailable, disabled, or its step fails, it is marked dead and 0 is
     * returned; the caller then simply binds nothing on that unit.
     **/
    GLuint step( int k, const AudioFeatures &a, float dt, float t,
                 GLuint srcImage, int outW, int outH );

    /**  Advances the deep-zoom Mandelbrot fractal by one frame.
     *
     * @param a     Current audio features driving zoom rate and iteration count. (in)
     * @param dt    Frame delta time in seconds. (in)
     * @param t     Elapsed time in seconds (unused directly; zoom depth is its own integrator). (in)
     * @param outW  Output width, used to size the field to the display aspect. (in)
     * @param outH  Output height, used to size the field to the display aspect. (in)
     *
     * @return
     *   The resolved Mandelbrot field texture, or 0 on failure.
     *
     * Called DIRECTLY (not through step()/CfxKindE) -- see the definition's
     * comment for why: units 0-31 are already fully claimed on a 32-unit
     * GPU, so this sim is bound to its own dedicated unit straight from
     * RenderPipeline.cpp, the same way texBake/texPrevFrame already are,
     * rather than competing for the generic CfxInfoTable table's headroom. A
     * per-pixel escape-time iteration using double-single (Dekker/Knuth
     * error-free-transformation) emulated precision for the complex
     * coordinate, so the zoom can go roughly 10,000x deeper than plain
     * float32 before banding sets in. Zoom depth is a host-integrated log
     * accumulator (audio-modulated rate, never time*audio -- see
     * Tools/SHADER_AUTHORING.md V7); once it reaches the double-single
     * precision ceiling, it resets to a shallow zoom and advances to the
     * next of a small set of hand-picked interesting boundary coordinates.
     **/
    GLuint stepMandelbrot( const AudioFeatures &a, float dt, float t, int outW, int outH );

    // Free a sim's GPU memory when it has not been on screen for a while.
    /**  Frees GPU memory for any kind that has been idle too long.
     *
     * @param now  Current elapsed time in seconds, compared against each resource's last-use time. (in)
     *
     * Called once per frame with the current time; any kind whose canvas or
     * field has not been touched by step() for more than the idle threshold
     * has its textures/buffers deleted, so resident GPU memory only reflects
     * kinds actually in recent use.
     **/
    void retireIdle( float now );

private:
    // ---- shared splat canvas (uint accumulator -> RGBA16F image) ----
    // Used by every sim that scatters colour into the frame.  The accumulator
    // is fixed-point (SplatScale) because atomicAdd on floats is an optional
    // GL extension, while uint atomics are core.
    /** GPU state for a "splat" sim: an atomic uint accumulator resolved to an RGBA16F texture.
     *
     * Sims that scatter colour into the frame (a thread decides which pixel
     * to touch) accumulate into the fixed-point `ssbo` using uint atomics,
     * since atomicAdd on floats is only an optional GL extension. Each frame
     * the accumulator is cleared (clearAccum), the sim's compute shader
     * scatters into it, and resolve() tonemaps it into `tex`, which is what
     * gets published to the effect shaders.
     **/
    struct Canvas
    {
        GLuint ssbo = 0; ///< w*h*4 uints: R,G,B,hits accumulator, atomically scattered into
        GLuint tex = 0;  ///< RGBA16F result texture published to effect shaders
        /** Canvas width in texels (0 until ensureCanvas() allocates it; a size change reallocates). */
        int          w = 0, h = 0;   ///< canvas height in texels (0 until allocated)
        float        lastUse = 0.f;  ///< last step() time this canvas was touched; drives retireIdle()
        bool         seeded = false; ///< whether this canvas's sim state has been initialised at least once
        unsigned int frame = 0;      ///< steps since seeding: a sim that ping-pongs its state reads half ( frame & 1 )
    };
    /**  Lazily (re)allocates a Canvas's texture and accumulator SSBO for the given size.
     *
     * @param c  Canvas to allocate or validate. (in,out)
     * @param w  Requested width in texels. (in)
     * @param h  Requested height in texels. (in)
     *
     * @return
     *   true if the canvas's texture and SSBO are both valid.
     *
     * A no-op if the canvas already exists at this size. On a size change the
     * old GL objects are freed first. The texture is zero-filled immediately
     * so the first frame never shows uninitialised GPU memory.
     **/
    bool ensureCanvas( Canvas &c, int w, int h );
    /**  Zeroes a canvas's uint accumulator SSBO ahead of this frame's scatter pass.
     *
     * @param c  Canvas whose accumulator is cleared. (in)
     **/
    void clearAccum( const Canvas &c );
    /**  Tonemaps a canvas's uint accumulator into its RGBA16F result texture.
     *
     * @param c         Canvas to resolve. (in)
     * @param mode      Tonemap mode: 0 = linear exposure, 1 = fractal-flame log-density (average colour x
     *                  log(1+density)). (in)
     * @param exposure  Linear brightness multiplier applied before gamma. (in)
     * @param gammaInv  Inverse-gamma exponent applied to the resolved colour. (in)
     * @param decay     How much of the previous frame's texture content is retained (0 = no trail, closer to 1 =
     *                  long trail). (in)
     *
     * Runs the CfxResolve compute shader, blending the newly scattered
     * accumulator into the previous frame's texture content by `decay` so
     * splat sims can show motion trails rather than a single frame's sparse
     * scatter.
     **/
    void resolve( const Canvas &c, int mode, float exposure, float gammaInv,
                  float decay );
    /**  Deletes a Canvas's GL texture and SSBO and resets it to empty.
     *
     * @param c  Canvas to free. (in,out)
     **/
    void freeCanvas( Canvas &c );

    // Generic ping-pong field (RGBA16F) for the grid-based sims.
    /** A ping-pong pair of RGBA16F textures used by grid-based sims.
     *
     * Each step reads from `tex[idx]` and writes the new state into
     * `tex[1-idx]`, then flips `idx`; this is the standard double-buffering
     * pattern needed because a compute shader cannot safely read and write
     * the same image at the same texel concurrently. Some kinds (pixel sort,
     * DLA crystal, erosion) only ever use tex[0] as a single read-write
     * image instead, when the update does not need the previous state kept
     * intact.
     **/
    struct Field
    {
        GLuint tex[2] = { 0, 0 }; ///< the two ping-pong textures
        /** Field width in texels (0 until ensureField() allocates it; a size change reallocates both textures). */
        int w = 0, h = 0, idx = 0; ///< which of tex[] is "current" (read side), 0 or 1; flipped after each ping-pong
                                   ///< step
        float lastUse = 0.f;       ///< last step() time this field was touched; drives retireIdle()
        bool  seeded = false;      ///< whether this field's sim state has been initialised at least once
    };
    /** @var ComputeFX::Field::h
     *  @brief Field height in texels (0 until allocated). */
    /**  Lazily (re)allocates both ping-pong textures of a Field for the given size/format.
     *
     * @param f    Field to allocate or validate. (in,out)
     * @param w    Requested width in texels. (in)
     * @param h    Requested height in texels. (in)
     * @param fmt  GL internal format for both textures (e.g. GL_RGBA16F). (in)
     *
     * @return
     *   true if both textures are valid.
     *
     * A no-op if the field already exists at this size. On a size change the
     * old textures are freed first. Both textures are zero-filled immediately.
     **/
    bool ensureField( Field &f, int w, int h, GLenum fmt );
    /**  Deletes both of a Field's GL textures and resets it to empty.
     *
     * @param f  Field to free. (in,out)
     **/
    void freeField( Field &f );

    // Storage buffer helper (agent/particle state).
    /**  Lazily allocates a shader-storage buffer of the given size if not already allocated.
     *
     * @param b      Buffer name to allocate into; left unchanged if already valid. (in,out)
     * @param bytes  Size in bytes to allocate for the buffer's storage. (in)
     *
     * @return
     *   true if the buffer is a valid, non-zero name.
     *
     * A no-op (returns true) if `b` is already a non-zero buffer name; this
     * function never resizes an existing buffer, only creates one the first
     * time it is needed.
     **/
    bool ensureBuffer( GLuint &b, size_t bytes );

    /**  Returns the cached compute program for a slot, compiling it on first use.
     *
     * @param slot  Index into the program cache (one of the anonymous P_* enum values in ComputeFX.cpp). (in)
     * @param file  Path to the .comp shader source to compile if not already cached. (in)
     *
     * @return
     *   The cached/compiled GL program name, or 0 if compilation failed.
     *
     * Each slot is only ever compiled once: on the first call m_progTried[slot]
     * is latched so a failed compile is never retried on subsequent frames
     * (it would just fail again and spam stderr).
     **/
    GLuint prog( int slot, const char *file ); // cached compute program

    // ---- per-kind steps ----
    /**  Advances the fractal-flame chaos-game simulation by one frame.
     *
     * @param a   Current audio features driving transform phase and colour. (in)
     * @param dt  Frame delta time in seconds. (in)
     * @param t   Elapsed time in seconds. (in)
     *
     * @return
     *   The resolved flame canvas texture, or 0 on failure.
     *
     * 256x256 walkers iterate IFS transforms whose phase/warp/spin are
     * host-integrated from dt and audio features (never time multiplied
     * directly by an audio value, to avoid jitter), scattering an atomic
     * density histogram that is resolved with the log-density tonemap and a
     * long decay for a smooth, silky flame.
     **/
    GLuint stepFlame( const AudioFeatures &a, float dt, float t );
    /**  Advances ~1.3M particles through a curl-noise flow field.
     *
     * @param a         Current audio features driving flow speed and colour. (in)
     * @param dt        Frame delta time in seconds. (in)
     * @param t         Elapsed time in seconds. (in)
     * @param srcImage  The current slideshow photo texture sampled by the flow/advection shader. (in)
     *
     * @return
     *   The resolved particle canvas texture, or 0 on failure.
     *
     * Particle state is seeded once into an SSBO on first use, then advected
     * each frame by a curl-noise field whose phase integrates from audio
     * level/flux; particles are scattered onto the splat canvas and resolved
     * with a moderate decay.
     **/
    GLuint stepParticles( const AudioFeatures &a, float dt, float t, GLuint srcImage );
    /**  Advances a 65,536-body N-body galaxy simulation by one frame.
     *
     * @param a   Current audio features driving gravity/kick response and colour. (in)
     * @param dt  Frame delta time in seconds. (in)
     * @param t   Elapsed time in seconds. (in)
     *
     * @return
     *   The resolved N-body canvas texture, or 0 on failure.
     *
     * Forces are evaluated with shared-memory tiling against a 2048-body
     * sample so the full star count can be quadrupled at no extra cost. Two
     * colliding galaxies are (re)seeded at most every 45s, triggered by a
     * strong drop pulse, so a merger's full arc (approach, tidal tails,
     * starburst) can play out instead of being cut short.
     **/
    GLuint stepNBody( const AudioFeatures &a, float dt, float t );
    /**  Advances a 131,072-boid flocking simulation with a real spatial-hash neighbourhood.
     *
     * @param a   Current audio features driving goal-seeking speed and colour. (in)
     * @param dt  Frame delta time in seconds. (in)
     * @param t   Elapsed time in seconds. (in)
     *
     * @return
     *   The resolved boids canvas texture, or 0 on failure.
     *
     * Each frame rebuilds a 128x128 spatial-hash grid (via atomics) that the
     * flocking step then queries for neighbours, giving genuine local
     * cohesion/alignment/separation. Resolved with a short decay so the
     * flock stays visually crisp rather than smearing into two clouds.
     **/
    GLuint stepBoids( const AudioFeatures &a, float dt, float t );
    /**  Advances a diffusion-limited-aggregation (frost/coral) growth field.
     *
     * @param a   Current audio features driving stickiness/drift and colour. (in)
     * @param dt  Frame delta time in seconds. (in)
     * @param t   Elapsed time in seconds. (in)
     *
     * @return
     *   The crystal field texture, or 0 on failure.
     *
     * Random walkers stick to the existing structure with a deliberately low
     * probability so growth stays dendritic instead of collapsing into a
     * compact Eden-growth blob; the structure is re-seeded at most every 30s,
     * triggered by a big drop pulse. Unlike the splat sims, the field texture
     * itself is the published result — there is no separate canvas resolve.
     **/
    GLuint stepCrystal( const AudioFeatures &a, float dt, float t );
    /**  Advances a dielectric-breakdown lightning bolt that grows itself on the GPU.
     *
     * @param a   Current audio features driving strike triggers and branching. (in)
     * @param dt  Frame delta time in seconds. (in)
     * @param t   Elapsed time in seconds. (in)
     *
     * @return
     *   The resolved lightning canvas texture, or 0 on failure.
     *
     * A new bolt is (re)seeded on a strong onset/drop (at least 0.5s apart)
     * or, as a fallback, every 2.2s so the storm stays visibly alive through
     * quiet passages. Growth is resolved with high exposure and a long decay
     * so a bolt's afterglow lingers well past its actual lifetime.
     **/
    GLuint stepLightning( const AudioFeatures &a, float dt, float t );
    /**  Advances a wave-surface simulation and splats caustic photons from it.
     *
     * @param a         Current audio features driving ripple triggers and colour. (in)
     * @param dt        Frame delta time in seconds. (in)
     * @param t         Elapsed time in seconds. (in)
     * @param srcImage  The current slideshow photo texture (currently unused by the wave/photon shaders themselves,
     *                  kept for interface symmetry). (in)
     *
     * @return
     *   The resolved caustics canvas texture, or 0 on failure.
     *
     * Runs two wave sub-steps per frame for stable propagation at a
     * believable speed, dropping a "stone" ripple on kicks and/or snares at
     * pseudo-randomised positions (so the pattern never looks periodic), then
     * splats photons refracted through the resulting wave field onto the
     * canvas. Resolved with low exposure/decay since this reads as a surface,
     * not as trails.
     **/
    GLuint stepCaustics( const AudioFeatures &a, float dt, float t, GLuint srcImage );
    /**  Advances the per-row luminance pixel-sort ("glitch melt") effect.
     *
     * @param a         Current audio features driving the bias rate and sort direction. (in)
     * @param dt        Frame delta time in seconds. (in)
     * @param t         Elapsed time in seconds. (in)
     * @param srcImage  The current slideshow photo texture being sorted. (in)
     * @param outW      Output width, used to size the field to the display resolution. (in)
     * @param outH      Output height, used to size the field to the display resolution. (in)
     *
     * @return
     *   The sorted field texture, or 0 on failure.
     *
     * One compute workgroup sorts each row of the source photo by luminance
     * around a slowly rotating bias key, so the melt appears to flow instead
     * of settling into a fixed arrangement; sort direction flips with the
     * beat phase. Writes directly into the field's tex[0] (no ping-pong).
     **/
    GLuint stepPixelSort( const AudioFeatures &a, float dt, float t, GLuint srcImage,
                          int outW, int outH );
    /**  Advances the 2D-FFT audio-spectrum image filter.
     *
     * @param a         Current audio features supplying the 32-band spectrum used as the frequency mask. (in)
     * @param dt        Frame delta time in seconds (unused by this kind's shaders). (in)
     * @param t         Elapsed time in seconds, used to slowly rotate the mask. (in)
     * @param srcImage  The current slideshow photo texture whose luminance is transformed. (in)
     *
     * @return
     *   The filtered field texture, or 0 on failure.
     *
     * Loads the photo's luminance as a complex field, runs a forward 2D FFT
     * (row pass then column pass), multiplies by a radial mask built from the
     * 32-band audio spectrum (so spatial frequency maps to audio frequency),
     * runs the inverse FFT, and stores the result back into a texture.
     **/
    GLuint stepFFT( const AudioFeatures &a, float dt, float t, GLuint srcImage );
    /**  Advances a Swift-Hohenberg ferrofluid spike-pattern simulation.
     *
     * @param a   Current audio features driving the magnetic-field control parameter. (in)
     * @param dt  Frame delta time in seconds (unused; the shader uses a fixed internal dt for stability). (in)
     * @param t   Elapsed time in seconds, used to vary the per-substep RNG seed. (in)
     *
     * @return
     *   The ferrofluid field texture, or 0 on failure.
     *
     * Runs 8 sub-steps per frame on a deliberately coarse grid sized so the
     * pattern's selected wavenumber lands well under Nyquist (see the inline
     * comments in the .cpp for the discrete-eigenvalue derivation). Bass
     * level drives the field's control parameter, capped so the hexagonal
     * spike phase is favoured over the stripe/labyrinth phase; a small
     * continual noise seed keeps breaking the flat field's fixed point.
     **/
    GLuint stepFerro( const AudioFeatures &a, float dt, float t );
    /**  Advances a hydraulic-erosion heightfield simulation.
     *
     * @param a   Current audio features driving rainfall rate and droplet capacity. (in)
     * @param dt  Frame delta time in seconds (unused by this kind's shaders). (in)
     * @param t   Elapsed time in seconds. (in)
     *
     * @return
     *   The eroded heightfield texture, or 0 on failure.
     *
     * 2,048 rain droplets per frame carve the heightfield; since erosion
     * alone has no counterbalance and would grind the terrain flat, the
     * landscape is re-raised (re-seeded) roughly every 14s, or sooner on a
     * big drop, turning the flattening into a repeating cycle of peaks and
     * drainage networks appearing and eroding away.
     **/
    GLuint stepErosion( const AudioFeatures &a, float dt, float t );
    /**  Advances a screen-space "liquid metal" fluid rendered from cohesive particles.
     *
     * @param a    Current audio features driving swirl/cohesion response. (in)
     * @param dt   Frame delta time in seconds (unused; the shader uses a fixed internal dt). (in)
     * @param t    Elapsed time in seconds. (in)
     * @param src  Unused by this kind (kept for interface symmetry with the other photo-consuming steps). (in)
     *
     * @return
     *   The resolved metal canvas texture, or 0 on failure.
     *
     * 65,536 particles are binned each frame into a spatial-hash grid (via
     * atomics) and simulated/splatted onto a deliberately small 640x360
     * canvas so the particle discs overlap into a continuous surface instead
     * of reading as speckle. Resolved with no temporal decay, since the
     * effect is meant to read as a surface, not as accumulating trails.
     **/
    GLuint stepMetal( const AudioFeatures &a, float dt, float t, GLuint src );
    /**  Advances the shatter-and-reassemble effect.
     *
     * @param a         Current audio features driving burst triggers and spring response. (in)
     * @param dt        Frame delta time in seconds (unused; the shader uses a fixed internal dt). (in)
     * @param t         Elapsed time in seconds. (in)
     * @param srcImage  The current slideshow photo texture the shards are cut from. (in)
     *
     * @return
     *   The resolved shards canvas texture, or 0 on failure.
     *
     * The photo is divided into a 48x27 grid of spring-mass shards; a strong
     * onset or drop (at least 3.2s apart) blows the picture apart again,
     * and between bursts each shard's spring pulls it back to its home
     * position so the image re-assembles.
     **/
    GLuint stepShards( const AudioFeatures &a, float dt, float t, GLuint srcImage );
    /**  Advances a full incompressible Navier-Stokes fluid (advect, project, publish).
     *
     * @param a         Current audio features driving the jet's strength and colour. (in)
     * @param dt        Frame delta time in seconds (unused; the shader uses a fixed internal dt for stability).
     *                  (in)
     * @param t         Elapsed time in seconds, used to orbit the jet position/direction. (in)
     * @param srcImage  The current slideshow photo texture the dye/jet colour is sampled from. (in)
     *
     * @return
     *   The published fluid output texture, or 0 on failure.
     *
     * Runs the classic stable-fluids pipeline: advect velocity and dye
     * (injecting a photo-sampled, audio-driven orbiting jet), compute
     * divergence, solve the pressure Poisson equation with 24 Jacobi
     * iterations, then subtract the pressure gradient and write the final
     * velocity/dye composite into its own output Canvas texture (distinct
     * from the internal ping-pong velocity/dye/pressure fields).
     **/
    GLuint stepNSFluid( const AudioFeatures &a, float dt, float t, GLuint srcImage );
    /**  Advances a Verlet mass-spring cloth sheet stored as a displacement field.
     *
     * @param a   Current audio features driving wind phase and kick impulses. (in)
     * @param dt  Frame delta time in seconds, integrated into the wind phase. (in)
     * @param t   Elapsed time in seconds, passed through to the shader. (in)
     *
     * @return
     *   The cloth displacement field texture, or 0 on failure.
     *
     * Runs 4 relaxation sub-steps per frame (a single Jacobi pass on a
     * 256-wide sheet only propagates a disturbance by one texel, which would
     * look like treacle). Needs only two texture slots because the previous
     * state is dead as soon as the next state exists — the new state is
     * written straight into the slot the old one occupied.
     **/
    GLuint stepCloth( const AudioFeatures &a, float dt, float t );
    /**  3D raymarched-isosurface sculpt simulation — not implemented.
     *
     * @param a   Unused. (in)
     * @param dt  Unused. (in)
     * @param t   Unused. (in)
     *
     * @return
     *   Always 0.
     *
     * Always returns 0; step() then marks CFX_SCULPT dead on the first call
     * so it is never retried. Present as a placeholder slot in CfxKindE.
     **/
    GLuint stepSculpt( const AudioFeatures &a, float dt, float t );

    // Extra ping-pong slot for sims that need a second field (velocity vs dye).
    Field m_field2[CFX_COUNT]; ///< second per-kind field; only Navier-Stokes uses it, for the dye field (m_field holds
                               ///< velocity)
    // The Navier-Stokes solver needs a third: the pressure it iterates on.
    Field m_nsPressure; ///< shared third ping-pong field, used only by stepNSFluid for the pressure Jacobi iteration
    // Deliberately outside the per-CfxKindE arrays -- see stepMandelbrot()'s
    // comment for why this sim is not a registered CfxKindE.
    Field m_mandelbrotField; ///< dedicated field for stepMandelbrot(), bound directly by RenderPipeline.cpp rather than
                             ///< through the generic CfxInfoTable unit table

    bool  m_ok = false;       ///< true once init() has detected usable GL compute support
    int   m_maxTexUnits = 16; ///< cached GL_MAX_TEXTURE_IMAGE_UNITS, used to decide which kinds fit
    float m_now = 0.f;        ///< last time value seen by step(); recorded for bookkeeping

    enum
    {
        PROG_SLOTS = 40
    }; ///< size of the compute-program cache; see the P_* slot enum in ComputeFX.cpp
    GLuint m_prog[PROG_SLOTS] = { 0 };      ///< cached compute program per slot (0 = not yet built or build failed)
    char   m_progTried[PROG_SLOTS] = { 0 }; ///< guards each slot so a failed compile is only ever attempted once

    // Per-kind resources (only allocated once a kind is actually requested).
    Canvas m_canvas[CFX_COUNT];         ///< per-kind splat canvas, for sims that scatter into an atomic accumulator
    Field  m_field[CFX_COUNT]; ///< per-kind primary ping-pong field, for grid-based sims (also the velocity field for
                               ///< Navier-Stokes)
    GLuint m_buf[CFX_COUNT] = { 0 };    ///< per-kind primary SSBO (particle/agent/shard state, meaning depends on the
                                        ///< kind)
    GLuint m_buf2[CFX_COUNT] = { 0 }; ///< per-kind secondary SSBO (spatial-hash grid, atomic counters, or paired state,
                                      ///< depending on the kind)
    bool m_dead[CFX_COUNT] = { false }; ///< per-kind: setup or step failed once -> never retried again
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    ComputeFX( const ComputeFX & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    ComputeFX &operator=( const ComputeFX & ) = delete;
};

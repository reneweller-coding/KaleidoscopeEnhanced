#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file QuantumSpinLiquidKagomeSpinonLattice.frag
 * @brief QUANTUM SPIN LIQUID KAGOME SPINON LATTICE: 59,319 geometrically frustrated quantum spins
 * in a Kagome-pyrochlore lattice (Herbertsmithite), stacked into a WIDE SLAB of kagome planes that
 * overflows both frame edges. Long-range quantum entanglement prevents magnetic
 * ordering down to absolute zero, hosting fractionalized spinon excitations and emergent gauge fields:
 * three interfering spinon plane waves light whole cells of the lattice while the sites between
 * them fade into voids, and both sprite size and luminance fall off with depth.
 *   audioAdvance -> navigates spinon continuum dispersion & emergent gauge field fluctuations,
 *                   and slowly drifts the S(q,omega) colour index
 *   audioPhase   -> walks the spinon interference fronts across the lattice
 *   audioKick    -> flashes fractionalized spinon pair creation & topological entanglement bursts
 *   audioSwell   -> widens quantum spin liquid correlation length & spinon halo luminance
 *   audioCentroid-> nudges dynamic spin structure factor S(q,omega) color spectra (damped: the
 *                   colour index is now mostly spatial, so a transient no longer lurches the frame)
 *
 * Per-activation variety:
 *   pointGainP float point sprite base luminance gain (0.5..1.8)
 *   haloP      float gaussian spin core halo profile  (0.6..2.2)
 */

in vec3 vCol;   ///< Colour (from the vertex stage).
in float vSpinon;
in float vPointSize;
in float vLum;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float pointGainP;
uniform float haloP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 pc = gl_PointCoord - vec2(0.5);
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;

    // haloP shapes the spin's core profile, but its 0.6..2.2 range changed the
    // TOTAL flux of every sprite by more than 2x, i.e. it was really an exposure
    // control in disguise.  Compressed, and divided back out so haloP now only
    // trades a tight bright core against a soft wide one.
    float hScale = 0.90 + 0.50 * clamp((haloP > 0.01 ? haloP : 1.2), 0.6, 2.2);
    float core   = exp(-r2 * 15.0 / hScale);
    float fluxN  = 1.50 / hScale;

    // The per-SITE level -- depth, spinon occupation, triangle corner vs bond --
    // is decided in the .vert.  This stage only applies the sprite profile and
    // the preset gains.  The old flat 0.26 base gave every one of 19,000
    // on-screen sprites the same luminance, which is what an even wash IS.
    float gain = (0.75 + 0.35 * clamp((pointGainP > 0.01 ? pointGainP : 1.1), 0.5, 1.8)) * fluxN;
    float lit  = vLum * gain;

    vec2 photoUv = fract(gl_PointCoord + vSpinon * 0.3);
    vec3 photo = img(photoUv);

    vec3 col = vCol * (0.6 + 0.4 * photo) * core * lit;
    // Spinon pair creation: a white-blue burst, and ONLY on the excited sites --
    // a term spread over every sprite is a flat lift, not a highlight.
    col += vec3(0.95, 0.95, 1.0) * core * lit
         * min(1.0 + 1.6 * audioKick, 2.2) * vSpinon * 0.55;
    col *= (0.85 + 0.35 * audioSwell);

    // Still an additive GL_ONE/GL_ONE pass with no depth test: overlapping
    // lattice layers ADD, so cap the FINAL tinted vec3 (not just the scalar
    // feeding it) well below 1.0 or the stack burns to white.
    col = min(col, vec3(0.55));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

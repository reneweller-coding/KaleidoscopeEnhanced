#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RydbergAtomQuantumSimulatorArray.frag
 * @brief RYDBERG ATOM QUANTUM SIMULATOR ARRAY: 59,319 neutral alkali atoms trapped in a 3D optical
 * tweezer array -- a WIDE SLAB of tweezer planes that overflows both frame edges. Laser driving to
 * high principal quantum number Rydberg states (n ~ 70) creates
 * strong Van der Waals Rydberg blockade interactions, crystalline quantum states, and photo texturing.
 *   audioAdvance -> navigates Rabi frequency detuning & quantum simulator adiabatic sweeps
 *   audioKick    -> flashes collective Rydberg excitation & quantum Zeno blockade avalanches
 *   audioSwell   -> widens Rydberg blockade radius sphere & atom cloud fluorescence
 *   audioCentroid-> shifts atomic D2 line / Rydberg laser transition color spectra (damped, so a
 *                   transient tints the array rather than lurching every atom's hue at once)
 *
 * Per-activation variety:
 *   pointGainP float point sprite base luminance gain (0.5..1.8)
 *   haloP      float gaussian atom core halo profile  (0.6..2.2)
 */

in vec3 vCol;   ///< Colour (from the vertex stage).
in float vBlockade;
in float vPointSize;

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

    float hScale = (haloP > 0.01 ? haloP : 1.2);
    float core = exp(-r2 * 18.0 / hScale);

    // EXPOSURE REBALANCE: the array used to heap ~20 layers of sprites into one
    // small central disc, so every sprite had to be near-black to keep that
    // disc off the clip point.  Now that the slab spans the whole frame the
    // stack is only ~1 deep, so each sprite carries roughly 6x the luminance --
    // the same total light, spread over the picture instead of piled up.
    float baseLum = (pointGainP > 0.01 ? pointGainP : 1.1) * 0.26;

    // The excitation wave used to SLIDE each sprite's photo window as it
    // passed (photoUv += vBlockade*0.3), so every wavefront crossing re-drew
    // every atom's colours -- measured hueFlickHi 0.30. The window is stable
    // now; excitation still shows through the white blockade-flash term.
    vec2 photoUv = fract(gl_PointCoord * 0.9 + 0.05);
    vec3 photo = img(photoUv);

    vec3 col = vCol * (0.6 + 0.4 * photo) * core * baseLum;
    col += vec3(0.95, 0.95, 1.0) * core * baseLum
         * min(1.0 + 1.1 * audioKick, 1.9) * vBlockade * 0.7;   // flash partly restored: the flicker was the racing WAVE (vert), not the flash; contrast needs it
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * min(audioKick * 0.03, 0.05);

    // Still an additive GL_ONE/GL_ONE pass with no depth test: overlapping
    // tweezer planes ADD, so cap the FINAL tinted vec3 (not just the scalar
    // feeding it) well below 1.0 or the stack burns to white.
    col *= 8.0;                       // round 2: the soft knee eats half the gain
    col = min(col, vec3(0.95));   // 0.50 capped every highlight at half grey

    // FLAT fix: the additive white terms dominate the tinted base; push
    // the chroma back up before the knee (luma-preserving saturation).
    float _lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(_lum), col, 1.30);
    col = max(col, 0.0);
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SuperfluidVortexRingPinchOff.frag
 * @brief SUPERFLUID VORTEX RING PINCH OFF: Quantized vortex filament reconnection and ring pinch-off
 * in superfluid Helium-II. Crow instability on anti-parallel vortex pairs undergoes topological
 * reconnection, launching stable self-propelling quantized vortex rings with Kelvin wave cascades.
 * A ring GAS of 168 rings fills the cell, laid out on a jittered lattice in frustum
 * coordinates by the sibling .comp so it covers the frame at every depth.
 *   audioAdvance -> propels vortex rings along self-induced velocity drift axes
 *   audioKick    -> flashes vortex core reconnection topological pinch-off bursts
 *   audioSwell   -> widens vortex ring core diameter & superfluid luminescence
 *   audioCentroid-> shifts vortex core circulation phase color spectra
 *
 * Per-activation variety:
 *   pinchGlowP float reconnection pinch-off luminance gain  (0.8..2.5)
 *   kelvinP    float Kelvin wave cascade ripple intensity    (0.6..2.2)
 */

in vec3 vPos;   ///< Position (from the vertex stage).
in float vDepth;   ///< Depth (from the vertex stage).
in float vGlow;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float pinchGlowP;
uniform float kelvinP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Tints a colour toward the house palette at t, keeping its brightness.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    // Superfluid cryogenic cyan/violet palette
    vec3 superfluidCol = vec3(0.15, 0.85, 0.95);
    vec3 coreCol       = palTint(superfluidCol, vDepth * 0.4 + audioCentroid, 0.25);
    
    vec2 photoUv = fract(vPos.xy * 0.3 + 0.5);
    vec3 photoSample = img(photoUv);
    
    vec3 col = coreCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (pinchGlowP > 0.01 ? pinchGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += vec3(0.95, 0.95, 1.0) * (audioKick * 0.35);

    // The frame now carries 168 rings instead of one central knot, so the hot
    // end of the range has to be held BELOW the knee's clipping point (1.47
    // in, 0.97 out) rather than being left to the clamp.
    col = min(col, vec3(1.40));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

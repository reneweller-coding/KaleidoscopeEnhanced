#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FresnelDiffractionEdge.frag
 * @brief TRANSITION FRESNEL DIFFRACTION EDGE: Straight knife-edge optical Fresnel diffraction.
 * A straight absorbing edge sweeps across the optical field, creating decaying
 * sinusoidal diffraction fringes governed by Cornu spirals that bridge the transition.
 *   interpolation -> sweeps knife-edge shadow boundary across the screen
 *   audioKick     -> flashes principal diffraction fringe maxima
 *
 * Per-activation variety:
 *   edgeP   float Fresnel zone parameter v scale      (0.5..2.2)
 *   fringeP float diffraction fringe visibility ratio (0.5..2.0)
 *   speedP  float animation speed multiplier          (0.5..2.0)
 *   hueP    float diffraction fringe hue offset       (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float edgeP;
uniform float fringeP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float edg = (edgeP   > 0.0) ? edgeP   : 1.0;
    float frg = (fringeP > 0.0) ? fringeP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Knife edge position sweeping left to right
    float edgePos = mix(-1.2, 1.2, tProg);
    float v = (p.x - edgePos) * 20.0 * edg; // Dimensionless Fresnel parameter

    // audioBass undulates the Fresnel zone distance, i.e. the spacing of the
    // diffraction zones inside the fringe term.  It is deliberately kept OUT of
    // v itself, which is the knife-edge coordinate driving the wipe mask.
    // midTransition returns it to exactly 1.0 at both fade endpoints, and
    // fresnelIntensity only reaches the frame through the midTransition-gated
    // diffDisp below.
    float zoneDist = 1.0;   // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)

    // Analytical approximation of straight-edge Fresnel diffraction intensity
    float fresnelIntensity;
    if (v > 0.0) {
        // Illuminated region: decaying oscillations
        fresnelIntensity = 1.0 + (sin(0.5 * 3.14159265 * v * v * zoneDist) / (3.14159265 * v + 1e-3)) * frg;
    } else {
        // Geometrical shadow: exponential decay
        fresnelIntensity = exp(v * 2.0) * 0.25;
    }

    // Diffraction phase displacement
    float diffDisp = (fresnelIntensity - 1.0) * 0.03 * midTransition;
    vec2 warpUV = uv + vec2(diffDisp, 0.0);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    float wipeMask = smoothstep(-0.5, 0.5, v);
    vec4 col = mix(c0, c1, wipeMask);

    // Glowing primary fringe maximum
    float primaryPeak = exp(-abs(v - 1.22) * 10.0) * midTransition;
    col.rgb += primaryPeak * vec3(0.2, 0.9, 1.0) * (1.5 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}

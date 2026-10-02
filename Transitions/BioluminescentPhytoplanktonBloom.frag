#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BioluminescentPhytoplanktonBloom.frag
 * @brief TRANSITION BIOLUMINESCENT PHYTOPLANKTON BLOOM: Marine algal bloom current transition.
 * Millions of single-celled phytoplankton form luminous cyan-turquoise swirling
 * bloom currents that illuminate fluid vortex streamlines and reveal the next scene.
 *   interpolation -> sweeps phytoplankton algal density buildup & dissipation
 *   audioKick     -> flashes shear-stress enzymatic luciferin light emission
 *   audioSwell    -> undulates oceanic fluid vortex swirl velocity
 *
 * Per-activation variety:
 *   bloomP float phytoplankton bloom density scale  (0.5..2.2)
 *   swirlP float ocean eddy streamline swirl ratio  (0.5..2.0)
 *   speedP float animation speed multiplier         (0.5..2.0)
 *   hueP   float bioluminescent turquoise hue offset(0..6.28)
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

uniform float bloomP;
uniform float swirlP;   ///< Swirl knob, 0..1.
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
    float blm = (bloomP > 0.0) ? bloomP : 1.0;
    float swr = (swirlP > 0.0) ? swirlP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.07 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Oceanic fluid eddy streamline fields
    vec2 q1 = p * 8.0 * blm + vec2(sin(p.y * 5.0 + t), cos(p.x * 5.0 - t));
    vec2 q2 = p * 15.0 * blm - vec2(cos(p.y * 8.0 - t * 1.5), sin(p.x * 8.0 + t * 1.5));

    float eddy1 = sin(q1.x + sin(q1.y + t * 2.0));
    float eddy2 = sin(q2.y + sin(q2.x - t * 2.0));
    float bloomField = (eddy1 + eddy2) * 0.5;

    // Shear-stress-induced displacement
    vec2 shearDisp = vec2(eddy1, eddy2) * 0.035 * midTransition * swr * (1.0 + audioSwell * 0.7);

    vec4 c1 = texture(tex1, fract(uv + shearDisp));
    vec4 c0 = texture(tex0, fract(uv - shearDisp));

    vec4 col = mix(c1, c0, tProg);

    // Bioluminescent turquoise emission
    float lightEmission = pow(max(0.0, bloomField), 3.0) * midTransition;
    vec3 bioTurquoise = vec3(0.08, 0.96, 0.88);
    col.rgb += lightEmission * bioTurquoise * (1.5 + audioKick * 1.17);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}

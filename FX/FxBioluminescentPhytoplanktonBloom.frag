#version 330 core
out vec4 fragColor;
// FxBioluminescentPhytoplanktonBloom.frag
// -----------------------------------------------------------------------
// FX BIOLUMINESCENT PHYTOPLANKTON BLOOM: Marine algal bloom current transition.
// Millions of single-celled phytoplankton form luminous cyan-turquoise swirling
// bloom currents that illuminate fluid vortex streamlines and reveal the next scene.
//   interpolation -> sweeps phytoplankton algal density buildup & dissipation
//   audioKick     -> flashes shear-stress enzymatic luciferin light emission
//   audioBass     -> undulates oceanic fluid vortex swirl velocity
//
// Per-activation variety:
//   bloomP float phytoplankton bloom density scale  (0.5..2.2)
//   swirlP float ocean eddy streamline swirl ratio  (0.5..2.0)
//   speedP float animation speed multiplier         (0.5..2.0)
//   hueP   float bioluminescent turquoise hue offset(0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float bloomP;
uniform float swirlP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float blm = (bloomP > 0.0) ? bloomP : 1.0;
    float swr = (swirlP > 0.0) ? swirlP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Oceanic fluid eddy streamline fields
    vec2 q1 = p * 8.0 * blm + vec2(sin(p.y * 5.0 + t), cos(p.x * 5.0 - t));
    vec2 q2 = p * 15.0 * blm - vec2(cos(p.y * 8.0 - t * 1.5), sin(p.x * 8.0 + t * 1.5));

    float eddy1 = sin(q1.x + sin(q1.y + t * 2.0));
    float eddy2 = sin(q2.y + sin(q2.x - t * 2.0));
    float bloomField = (eddy1 + eddy2) * 0.5;

    // Shear-stress-induced displacement
    vec2 shearDisp = vec2(eddy1, eddy2) * 0.035 * midTransition * swr * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + shearDisp));
    vec4 c0 = texture(tex0, fract(uv - shearDisp));

    vec4 col = mix(c1, c0, tProg);

    // Bioluminescent turquoise emission
    float lightEmission = pow(max(0.0, bloomField), 3.0) * midTransition;
    vec3 bioTurquoise = vec3(0.08, 0.96, 0.88);
    col.rgb += lightEmission * bioTurquoise * (1.5 + audioKick * 3.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}

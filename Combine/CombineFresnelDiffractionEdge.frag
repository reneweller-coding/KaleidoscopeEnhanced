#version 330 core
out vec4 fragColor;
// CombineFresnelDiffractionEdge.frag
// -----------------------------------------------------------------------
// COMBINE FRESNEL DIFFRACTION EDGE: Straight knife-edge optical Fresnel diffraction.
// A straight absorbing edge sweeps across the optical field, creating decaying
// sinusoidal diffraction fringes governed by Cornu spirals that bridge the transition.
//   interpolation -> sweeps knife-edge shadow boundary across the screen
//   audioKick     -> flashes principal diffraction fringe maxima
//   audioBass     -> undulates Fresnel diffraction zone distance
//
// Per-activation variety:
//   edgeP   float Fresnel zone parameter v scale      (0.5..2.2)
//   fringeP float diffraction fringe visibility ratio (0.5..2.0)
//   speedP  float animation speed multiplier          (0.5..2.0)
//   hueP    float diffraction fringe hue offset       (0..6.28)
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

uniform float edgeP;
uniform float fringeP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float edg = (edgeP   > 0.0) ? edgeP   : 1.0;
    float frg = (fringeP > 0.0) ? fringeP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Knife edge position sweeping left to right
    float edgePos = mix(-1.2, 1.2, tProg);
    float v = (p.x - edgePos) * 20.0 * edg; // Dimensionless Fresnel parameter

    // Analytical approximation of straight-edge Fresnel diffraction intensity
    float fresnelIntensity;
    if (v > 0.0) {
        // Illuminated region: decaying oscillations
        fresnelIntensity = 1.0 + (sin(0.5 * 3.14159265 * v * v) / (3.14159265 * v + 1e-3)) * frg;
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
    col.rgb += primaryPeak * vec3(0.2, 0.9, 1.0) * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}

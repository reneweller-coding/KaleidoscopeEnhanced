#version 330 core
out vec4 fragColor;
// CombineRayleighTaylorInstability.frag
// -----------------------------------------------------------------------
// COMBINE RAYLEIGH TAYLOR INSTABILITY: Fluid density stratification transition.
// A denser fluid layer sinks into a lighter fluid layer under gravity, forming
// mushrooming Rayleigh-Taylor instability fingers and curling vortex plumes.
//   interpolation -> drives finger penetration depth & vortex roll-up growth
//   audioKick     -> flashes turbulent finger tip vortex swirls
//   audioBass     -> widens Rayleigh-Taylor finger spacing & buoyancy acceleration
//
// Per-activation variety:
//   fingerP float instability wavenumber & finger density (0.5..2.2)
//   growthP float vortex roll-up curl magnitude           (0.5..2.0)
//   speedP  float downward buoyancy speed multiplier       (0.5..2.0)
//   hueP    float fluid interface hue offset              (0..6.28)
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

uniform float fingerP;
uniform float growthP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float fng = (fingerP > 0.0) ? fingerP : 1.0;
    float grw = (growthP > 0.0) ? growthP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Rayleigh-Taylor harmonic interface: y = y_0 + A * cos(kx) * exp(gamma*t)
    float k = 14.0 * fng;
    float wave = cos(p.x * k);
    float mushroom = sin(p.x * k * 2.0) * sin(p.y * 10.0 + t * 2.0) * 0.2 * grw;

    float interfaceY = mix(-0.8, 0.8, tProg) + (wave + mushroom) * 0.15 * midTransition * (1.0 + audioBass * 0.7);
    float distToInterface = p.y - interfaceY;

    // Vortex roll-up displacement
    vec2 vortexDisp = vec2(sin(p.y * 15.0), cos(p.x * 15.0)) * 0.03 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + vortexDisp));
    vec4 c0 = texture(tex0, fract(uv - vortexDisp));

    float wipeMask = smoothstep(-0.05, 0.05, distToInterface);
    vec4 col = mix(c0, c1, wipeMask);

    // Glowing fluid interface boundary
    float interfaceGlow = exp(-abs(distToInterface) * 20.0) * midTransition;
    col.rgb += interfaceGlow * vec3(0.2, 0.9, 0.6) * (1.4 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}

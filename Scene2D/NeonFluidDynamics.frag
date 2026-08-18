#version 330 core
out vec4 fragColor;
/**
 * @file NeonFluidDynamics.frag
 * @brief NEON FLUID DYNAMICS: Multi-scale Navier-Stokes curl-noise vorticity fluid
 * advection. High-luminance neon ink plumes, collision shockwaves, turbulent
 * viscous marbling, and audio-driven dye injection pulses over photos.
 *   audioKick    -> injects explosive new expanding neon dye vortex rings
 *   audioBass    -> swirls macroscopic fluid bodies and advection currents
 *   audioHigh    -> creates fine turbulent viscous tendrils and sparkling eddies
 *   audioSwell   -> thickens fluid viscosity & increases color saturation
 *
 * Per-activation variety:
 *   viscosityP  float fluid drag / viscosity modifier     (0.5..1.8)
 *   swirlP      float curl vortex rotation intensity      (0.5..2.2)
 *   flowP       float overall advection velocity          (0.4..1.8)
 *   hueP        float dye color palette shift             (0..6.28)
 */

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

uniform float viscosityP;
uniform float swirlP;
uniform float flowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(345.67, 567.89));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Analytical curl of noise potential field to generate divergence-free velocity field
vec2 getVelocity(vec2 p, float t, float swirl) {
    const float eps = 0.04;
    float n1 = noise(p + vec2(0.0, eps) + vec2(t * 0.2));
    float n2 = noise(p - vec2(0.0, eps) + vec2(t * 0.2));
    float n3 = noise(p + vec2(eps, 0.0) + vec2(t * 0.2));
    float n4 = noise(p - vec2(eps, 0.0) + vec2(t * 0.2));
    
    vec2 curl = vec2(n1 - n2, -(n3 - n4)) / (2.0 * eps);

    // Add rotating vortex centers
    vec2 center1 = vec2(sin(t * 0.7) * 0.5, cos(t * 0.5) * 0.3);
    vec2 d1 = p - center1;
    vec2 v1 = vec2(-d1.y, d1.x) / (dot(d1, d1) + 0.15);

    vec2 center2 = vec2(cos(t * 0.6) * 0.6, sin(t * 0.8) * 0.4);
    vec2 d2 = p - center2;
    vec2 v2 = vec2(d2.y, -d2.x) / (dot(d2, d2) + 0.15);

    return (curl * 1.5 + (v1 - v2) * 0.8) * swirl;
}

void main() {
    float visc = (viscosityP > 0.0) ? viscosityP : 1.0;
    float swrl = (swirlP     > 0.0) ? swirlP     : 1.0;
    float flw  = (flowP      > 0.0) ? flowP      : 1.0;
    float hue  = (hueP       > 0.0) ? hueP       : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * flw + audioAdvance * 0.15;

    // Multi-step Runge-Kutta 2nd order advection simulation in fragment shader
    vec2 p = uv * 2.2;
    vec2 advectedP = p;
    float dt = 0.12 / visc;

    // Advect across 4 time steps
    for (int step = 0; step < 4; step++) {
        vec2 v1 = getVelocity(advectedP, t - float(step) * dt, swrl);
        vec2 midP = advectedP - 0.5 * dt * v1;
        vec2 v2 = getVelocity(midP, t - (float(step) + 0.5) * dt, swrl);
        advectedP -= dt * v2;
    }

    // Dye density accumulation from advected coordinates
    float dye1 = noise(advectedP * 2.0 + vec2(t * 0.1, -t * 0.15));
    float dye2 = noise(advectedP * 4.5 - vec2(t * 0.2, t * 0.1));
    float dye3 = noise(advectedP * 9.0 + vec2(t * 0.3, t * 0.2));

    float fluidPattern = (dye1 * 0.5 + dye2 * 0.3 + dye3 * 0.2);

    // Neon dye palette generation: Electric cyan, ultraviolet, hot pink, solar gold
    vec3 cCyan = vec3(0.0, 1.0, 0.9);
    vec3 cPink = vec3(1.0, 0.05, 0.6);
    vec3 cGold = vec3(1.0, 0.8, 0.1);
    vec3 cPurple = vec3(0.5, 0.0, 1.0);

    vec3 dyeCol = mix(cCyan, cPink, sin(fluidPattern * 6.28 + t) * 0.5 + 0.5);
    dyeCol = mix(dyeCol, cGold, sin(fluidPattern * 12.56 - t * 2.0) * 0.5 + 0.5);
    dyeCol = mix(dyeCol, cPurple, pow(dye3, 3.0));

    // Dynamic dye injection blast on audioKick
    float shockDist = length(uv);
    float shockwave = sin(shockDist * 16.0 - t * 8.0 - audioSubBass * 6.0) * exp(-shockDist * 2.5);
    float kickBlast = shockwave * audioKick * 2.0;

    // Liquid marbling of input photo
    vec2 photoWarp = st + (advectedP - p) * 0.18 * (1.0 + audioBass * 0.8);
    vec3 photo = img(clamp(photoWarp, 0.0, 1.0));

    // Combine fluid luminescence
    vec3 col = mix(vec3(0.02, 0.01, 0.04), photo * 1.2, 0.45 + 0.3 * audioLevel);
    col += dyeCol * (fluidPattern * 1.5) * (0.8 + audioSwell * 0.6);
    col += kickBlast * vec3(1.0, 0.4, 0.8);

    // Fine viscous sparkles on high frequencies
    if (audioHigh > 0.4) {
        float sparkle = pow(dye3, 6.0) * audioHigh * 3.0;
        col += vec3(0.9, 1.0, 1.0) * sparkle;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Film tone mapping
    col = col / (col + vec3(0.8));
    col = pow(col, vec3(0.9));

    fragColor = vec4(col, 1.0);
}

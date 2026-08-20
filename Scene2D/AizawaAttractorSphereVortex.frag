#version 330 core
out vec4 fragColor;
/**
 * @file AizawaAttractorSphereVortex.frag
 * @brief AIZAWA ATTRACTOR SPHERE VORTEX: 3D Aizawa attractor forming a rotating spherical
 * shell with a penetrating central plasma vortex tube and celestial Saturn rings.
 * High-velocity chaotic flow, glowing orbital particle swarms, and phase flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous integration of Aizawa attractor vortex
 *   audioKick    -> flashes central axial vortex funnel & triggers ring pulse
 *   audioCentroid-> sharpens orbital trajectory lines & sphere shell resolution
 *   audioSubBass -> expands spherical attractor breathing radius
 *   audioChromaHue-> rotates the luminous celestial sphere spectrum
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
uniform float audioChromaHue;

// Per-activation variety
uniform float speedP;
uniform float sphereRadP;
uniform float vortexP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sRad = (sphereRadP > 0.01) ? sphereRadP : 1.0;
    float vrtx = (vortexP > 0.01) ? vortexP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Aizawa system parameters: a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1
    float a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;

    // 3D Orbital rotation of screen plane
    float rotA = t * 0.2 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 pRot = mat2(cs, -sn, sn, cs) * uv * (4.2 / sRad);

    // Multi-step numerical RK2 integration along Aizawa sphere attractor.
    // Seeded from a FIXED point shared by every pixel -- not the pixel's own
    // position -- so the traced curve is one real spatial trajectory instead
    // of every pixel trivially starting AT distance zero from itself (which
    // washed the whole frame out to a near-uniform glow).
    vec3 pAiz = vec3(0.1, 0.05, 0.5 + 0.3 * sin(t * 0.4));
    float minDist = 1e5;
    float vortexEnergy = 0.0;

    float dt = 0.018 * vrtx;

    for (int i = 0; i < 28; i++) {
        // Aizawa equations
        float r2xy = pAiz.x * pAiz.x + pAiz.y * pAiz.y;
        float dx = (pAiz.z - b) * pAiz.x - d * pAiz.y;
        float dy = d * pAiz.x + (pAiz.z - b) * pAiz.y;
        float dz = c + a * pAiz.z - (pAiz.z * pAiz.z * pAiz.z) / 3.0 - r2xy * (1.0 + e * pAiz.z) + f * pAiz.z * (pAiz.x * pAiz.x * pAiz.x);

        pAiz += vec3(dx, dy, dz) * dt;

        float dDist = length(pRot - pAiz.xy);
        minDist = min(minDist, dDist);

        // Core axial tornado energy
        if (abs(pAiz.xy).x < 0.3 && abs(pAiz.xy).y < 0.3) {
            vortexEnergy += exp(-dDist * 3.0);
        }
    }

    // Sample distorted background photo
    vec2 sampleUV = fract(pRot * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing trajectory ribbon lines
    float lineGlow = exp(-minDist * (4.5 + 3.0 * audioCentroid)) * glw;

    // Palette mixing across Aizawa sphere
    float phase = atan(pRot.y, pRot.x) / 6.2831853 + length(pRot) * 0.15;
    vec3 palA = imgPalette(phase + t * 0.05);
    vec3 palB = imgPalette(phase + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(vortexEnergy * 0.5));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing spherical shell and central tornado flares
    vec3 sphereTint = vec3(1.3, 1.1, 1.8) * lineGlow * (1.0 + 2.5 * audioKick);
    vec3 tornadoTint = vec3(1.7, 1.4, 0.5) * vortexEnergy * (1.0 + 3.0 * audioKick);
    col += sphereTint + tornadoTint;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

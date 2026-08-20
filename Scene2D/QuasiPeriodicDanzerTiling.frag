#version 330 core
out vec4 fragColor;
/**
 * @file QuasiPeriodicDanzerTiling.frag
 * @brief QUASI PERIODIC DANZER TILING: 6D-to-3D cut-and-project icosahedral Danzer
 * quasicrystal tiling. Golden ratio (phi = 1.618) fractal star needles, never-repeating
 * aperiodic lattice nodes, and glowing holographic crystal diffraction facets.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous drift of 6D hyperspace cut-and-project plane
 *   audioKick    -> flashes icosahedral quasicrystal vertex nodes & shockwave burst
 *   audioCentroid-> modulates aperiodic needle sharpness & fine grid resolution
 *   audioSubBass -> expands quasicrystal lattice scale breathing
 *   audioChromaHue-> rotates the luminous icosahedral rainbow palette
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
uniform float scaleP;
uniform float starP;
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
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float str = (starP > 0.01) ? starP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Golden ratio constant
    const float PHI = 1.6180339887;

    // 6 Basis vectors projected onto 2D from icosahedral 6D hyper-space
    vec2 p = uv * (8.0 * sc);

    float fieldSum = 0.0;
    float minDist = 1e4;

    // Project 6 symmetric directions (2pi / 6 * k + golden shift)
    for (int i = 0; i < 6; i++) {
        float angle = float(i) * (3.14159265 / 3.0) + t * 0.15;
        vec2 dir = vec2(cos(angle), sin(angle));

        // 6D Cut plane translation offset
        float offset = sin(t * 0.4 + float(i) * PHI);

        float proj = dot(p, dir) + offset;
        float wave = cos(proj * str);
        fieldSum += wave;

        float dGrid = abs(fract(proj * 0.5) - 0.5);
        minDist = min(minDist, dGrid);
    }

    // Quasicrystal aperiodic potential
    float potential = fieldSum / 6.0;

    // Luminous aperiodic lattice nodes
    float nodeGlow = exp(-minDist * (18.0 + 10.0 * audioCentroid)) * glw;
    float peakStar = pow(max(0.0, potential), 6.0) * (1.0 + 3.0 * audioKick);

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(potential * 0.08) + 0.5);
    vec3 texCol = img(sampleUV);

    // Quasicrystal palette
    vec3 palA = imgPalette(potential * 0.4 + t * 0.05);
    vec3 palB = imgPalette(potential * 0.4 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(fieldSum * 2.0));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing aperiodic stars & vertex nodes
    vec3 starTint = vec3(1.4, 1.2, 1.8) * nodeGlow * (1.0 + 2.0 * audioKick);
    col += starTint + vec3(1.6, 1.5, 1.9) * peakStar;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

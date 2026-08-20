#version 330 core
out vec4 fragColor;
/**
 * @file QuantumWavepacketSuperposition.frag
 * @brief QUANTUM WAVEPACKET SUPERPOSITION: Time-dependent 2D Schrödinger wavepacket
 * superposition and collision. High-frequency quantum interference fringes, complex
 * phase rotation coloring, probability density nodes, and measurement collapse flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous wavepacket propagation & quantum phase evolution
 *   audioKick    -> triggers localized quantum wavepacket collapse flash
 *   audioCentroid-> modulates de Broglie wavelength & fine interference fringe spacing
 *   audioSubBass -> expands wavepacket Gaussian envelope width
 *   audioChromaHue-> rotates the quantum complex phase spectrum
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
uniform float waveVectorP;
uniform float packetsP;
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

// 2D Gaussian wavepacket: psi = exp(-|x - x0|^2 / (2*sigma^2)) * exp(i * k * (x - x0) - i * omega * t)
vec2 wavepacket(vec2 p, vec2 pos0, vec2 kVec, float sigma, float omega, float t) {
    vec2 diff = p - pos0;
    float env = exp(-dot(diff, diff) / (2.0 * sigma * sigma));
    float phase = dot(kVec, diff) - omega * t;
    return env * vec2(cos(phase), sin(phase));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float kMod = (waveVectorP > 0.01) ? waveVectorP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    float sigma = 0.45 * (1.0 + 0.15 * audioSubBass);
    float kMag = (18.0 + 10.0 * audioCentroid) * kMod;

    // 3 Colliding Gaussian wavepackets
    vec2 pos1 = vec2(sin(t * 0.5) * 0.4, cos(t * 0.4) * 0.3);
    vec2 pos2 = vec2(cos(t * 0.6 + 2.0) * 0.4, sin(t * 0.5 + 2.0) * 0.3);
    vec2 pos3 = vec2(sin(t * 0.7 + 4.0) * 0.4, cos(t * 0.6 + 4.0) * 0.3);

    vec2 k1 = vec2(cos(t * 0.3), sin(t * 0.3)) * kMag;
    vec2 k2 = vec2(cos(t * 0.3 + 2.094), sin(t * 0.3 + 2.094)) * kMag;
    vec2 k3 = vec2(cos(t * 0.3 + 4.188), sin(t * 0.3 + 4.188)) * kMag;

    vec2 psi1 = wavepacket(uv, pos1, k1, sigma, 4.0, t);
    vec2 psi2 = wavepacket(uv, pos2, k2, sigma, 4.0, t);
    vec2 psi3 = wavepacket(uv, pos3, k3, sigma, 4.0, t);

    // Quantum superposition: Psi_total = psi1 + psi2 + psi3
    vec2 psiTotal = psi1 + psi2 + psi3;

    // Probability density: |Psi|^2
    float probDensity = dot(psiTotal, psiTotal);

    // Complex quantum phase angle
    float quantumPhase = atan(psiTotal.y, psiTotal.x);

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + psiTotal * 0.08 + 0.5);
    vec3 texCol = img(sampleUV);

    // Complex phase coloring
    vec3 palA = imgPalette(quantumPhase / 6.2831853 + t * 0.05);
    vec3 palB = imgPalette(quantumPhase / 6.2831853 + 0.5);
    vec3 waveCol = mix(palA, palB, 0.5 + 0.5 * sin(quantumPhase * 2.0));

    waveCol = mix(waveCol, texCol, 0.35 + 0.15 * audioValence);

    // Glowing quantum interference fringes & collapse burst
    float fringeGlow = probDensity * glw * (1.0 + 2.0 * audioKick);
    vec3 fringeTint = vec3(1.3, 1.1, 1.8) * fringeGlow;

    // Quantum wavepacket measurement collapse flash at wavepacket 1
    float collapseFlash = exp(-length(uv - pos1) * 8.0) * (1.0 + 3.0 * audioKick);
    vec3 finalCol = waveCol * 0.4 + fringeTint + vec3(1.7, 1.6, 2.0) * collapseFlash * 0.6;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

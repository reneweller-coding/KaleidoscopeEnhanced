#version 330 core
out vec4 fragColor;
/**
 * @file QuantumChromaField.frag
 * @brief QUANTUM CHROMA FIELD: Multi-layered complex domain quantum wave interference
 * and Riemann surface vortex field. High-contrast holographic diffraction
 * fringes, phase singularities, quantum spin vortices, and dynamic
 * chromatic dispersion covering 100% of the screen.
 *   audioPhase   -> spins quantum phase vortices
 *   audioSubBass -> expands nodal interference envelope
 *   audioKick    -> excites high-energy quantum state collapse & flash
 *   audioFlux    -> modulates interference density & fine wave harmonics
 *
 * Per-activation variety:
 *   waveFreqP  float nodal wave frequency multiplier   (0.5..2.2)
 *   phaseRotP  float quantum phase spin speed          (0.4..1.8)
 *   glowP      float iridescent fringe intensity       (0.5..2.0)
 *   hueP       float color spectrum offset             (0..6.28)
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

uniform float waveFreqP;
uniform float phaseRotP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Complex multiplication
vec2 cMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex division
vec2 cDiv(vec2 a, vec2 b) {
    float d = dot(b, b);
    return vec2(dot(a, b), a.y * b.x - a.x * b.y) / max(d, 1e-5);
}

// Iridescent spectral palette
vec3 spectral(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
}

void main() {
    float freq = (waveFreqP > 0.0) ? waveFreqP : 1.0;
    float pSpd = (phaseRotP > 0.0) ? phaseRotP : 1.0;
    float glw  = (glowP     > 0.0) ? glowP     : 1.0;
    float hue  = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Center zoom & multi-scale rotation
    float t = time * 0.2 * pSpd + audioAdvance * 0.15;
    mat2 rot = mat2(cos(t * 0.3), -sin(t * 0.3), sin(t * 0.3), cos(t * 0.3));
    vec2 z = rot * uv * (2.8 + 0.6 * sin(time * 0.1) - audioSwell * 0.4);

    // Multi-pole quantum vortex singularities
    int poles = 5;
    vec2 w = vec2(0.0);
    float fieldAmp = 0.0;

    for (int k = 0; k < poles; k++) {
        float theta = float(k) * (6.2831853 / float(poles)) + t * 0.5;
        float r = 0.9 + 0.3 * sin(t * 1.2 + float(k) * 1.5) + 0.2 * audioSubBass;
        vec2 pole = vec2(cos(theta), sin(theta)) * r;

        vec2 delta = z - pole;
        float d2 = dot(delta, delta) + 0.04;
        
        // Quantum vortex phase: z / (z - pole)
        vec2 term = cDiv(z, delta);
        w += term;

        // Wave amplitude accumulation
        fieldAmp += sin(sqrt(d2) * 14.0 * freq - t * 3.0 - audioPhase * 4.0) / sqrt(d2);
    }

    // Riemann surface phase angle & modulus
    float phase = atan(w.y, w.x);
    float mag = length(w);
    float logMag = log(mag + 1.0);

    // Interference grid fringes
    float grid1 = sin(phase * 4.0 + logMag * 8.0 * freq + t * 2.0);
    float grid2 = cos(phase * 6.0 - logMag * 10.0 * freq - audioAdvance * 2.0);
    float interference = (grid1 * grid2) * 0.5 + 0.5;

    // Optical chromatic dispersion mapping
    float cR = sin(phase + logMag * 5.0 + 0.00 + audioKick * 1.2);
    float cG = sin(phase + logMag * 5.0 + 2.09);
    float cB = sin(phase + logMag * 5.0 + 4.18 + audioSubBass * 1.0);
    vec3 waveColor = vec3(cR, cG, cB) * 0.5 + 0.5;

    // High-energy diffraction spectral rings
    float rings = fract(mag * 0.35 * freq + fieldAmp * 0.08 + audioFlux * 0.3);
    vec3 fringeCol = spectral(rings + phase * 0.159 + time * 0.1);

    // Sample active photo with holographic quantum distortion
    vec2 photoUV = st + vec2(cR - cB, cG - cR) * 0.04 * (1.0 + audioKick * 0.8);
    vec3 photo = img(clamp(photoUV, 0.0, 1.0));

    // Combine quantum layers
    vec3 col = mix(waveColor, fringeCol, interference);
    col = col * (0.8 + 0.8 * interference) + fringeCol * pow(interference, 4.0) * glw * 1.5;
    col += photo * (0.3 + 0.4 * audioLevel);

    // Core state collapse flash on heavy beat
    if (audioKick > 0.6) {
        float coreFlash = exp(-length(z) * 3.0) * audioKick * 2.0;
        col += vec3(0.9, 0.95, 1.0) * coreFlash;
    }

    // High-frequency quantum sparkle
    float sparkle = sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + time * 20.0);
    if (sparkle > 0.96) {
        col += vec3(1.0) * audioHigh * 0.8;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.22), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}

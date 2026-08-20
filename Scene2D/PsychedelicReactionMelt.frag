#version 330 core
out vec4 fragColor;
/**
 * @file PsychedelicReactionMelt.frag
 * @brief PSYCHEDELIC REACTION MELT: Turing / Gray-Scott procedural reaction-diffusion
 * morphogenetic labyrinth with melting liquid wax feedback, chromatic phase inversions,
 * and high-energy chemical spot/stripe division waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous chemical diffusion advection & melting
 *   audioKick    -> triggers full chromatic phase inversions & chemical shockwave burst
 *   audioCentroid-> modulates Turing labyrinth stripe frequency & spot splitting
 *   audioSubBass -> expands liquid wax melting viscosity
 *   audioChromaHue-> rotates the liquid acid psychedelic palette
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
uniform float meltP;
uniform float spotFreqP;
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

// Procedural multi-scale Turing reaction-diffusion field
float turingField(vec2 p, float t, float freq) {
    float f = 0.0;
    float amp = 1.0;
    float curFreq = freq;

    for (int i = 0; i < 4; i++) {
        // Rotated sinusoidal standing waves
        float ang = float(i) * 0.785398 + t * 0.15;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 pWarp = p + vec2(sin(p.y * 3.0 + t), cos(p.x * 3.0 - t)) * 0.15;

        float wave = sin(dot(pWarp, dir) * curFreq + t * 2.0);
        f += wave * amp;

        amp *= 0.55;
        curFreq *= 1.85;
    }
    return f;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float mlt = (meltP > 0.01) ? meltP : 1.2;
    float freqMod = (spotFreqP > 0.01) ? spotFreqP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Liquid dripping/melting downward displacement
    vec2 pMelt = uv;
    pMelt.y += sin(pMelt.x * 8.0 + t * 2.0) * (0.15 * mlt + 0.1 * audioSubBass);
    pMelt += vec2(sin(pMelt.y * 6.0 - t), cos(pMelt.x * 6.0 + t)) * 0.08;

    // Compute Turing morphogenetic field
    float baseFreq = (8.0 + 6.0 * audioCentroid) * freqMod;
    float chemicalVal = turingField(pMelt * 2.0, t, baseFreq);

    // Chemical boundary contour lines (isolines)
    float isoLines = abs(sin(chemicalVal * 6.0 + t * 3.0));
    float ridgeGlow = smoothstep(0.85, 1.0, isoLines) * glw;

    // Sample distorted texture along chemical gradient
    vec2 sampleUV = fract(pMelt * 0.5 + vec2(chemicalVal * 0.08, 0.0) + 0.5);
    vec3 texCol = img(sampleUV);

    // Dynamic color phase (inverts on audio kick)
    float phase = chemicalVal * 0.4 + t * 0.15 + audioKick * 0.5;
    vec3 palA = imgPalette(phase);
    vec3 palB = imgPalette(phase + 0.5);
    vec3 chemCol = mix(palA, palB, 0.5 + 0.5 * sin(chemicalVal * 3.0));

    chemCol = mix(chemCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing reaction ridge lines and kick flash
    vec3 neonRidge = vec3(1.4, 0.9, 1.7) * ridgeGlow * (1.0 + 2.5 * audioKick);
    chemCol += neonRidge;

    // Center chemical nucleus bloom
    float centerBloom = exp(-length(uv) * 4.0) * (0.6 + 1.2 * audioLevel);
    chemCol += imgPalette(0.8) * centerBloom;

    chemCol = pow(chemCol, vec3(0.87));
    fragColor = vec4(clamp(chemCol, 0.0, 1.0), 1.0);
}

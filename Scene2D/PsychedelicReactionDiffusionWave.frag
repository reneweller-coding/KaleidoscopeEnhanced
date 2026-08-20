#version 330 core
out vec4 fragColor;
/**
 * @file PsychedelicReactionDiffusionWave.frag
 * @brief PSYCHEDELIC REACTION DIFFUSION WAVE: Non-linear excitable medium chemical
 * spiral waves (FitzHugh-Nagumo / Belousov-Zhabotinsky). Rotating spiral wave tips,
 * collision wavefronts generating new phase singularities, and glowing chemical luminescence.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous chemical reaction wave propagation & spiral rotation
 *   audioKick    -> initiates new spiral wave tip singularities & wavefront shockwaves
 *   audioCentroid-> modulates diffusion rate & fine wave curvature resolution
 *   audioSubBass -> expands spiral wave core breathing scale
 *   audioChromaHue-> rotates the excitable medium chemical reagent spectrum
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
uniform float spiralCountP;
uniform float waveSpeedP;
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

// BZ Spiral wave phase potential around center c
float bzSpiral(vec2 p, vec2 c, float t, float kWave, float dir) {
    vec2 diff = p - c;
    float r = length(diff);
    float a = atan(diff.y, diff.x);
    // Archimedean spiral wavefront: phi = a - k*r + omega*t
    return sin(a * dir - kWave * r + t * 4.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nSpirals = (spiralCountP > 1.0) ? spiralCountP : 4.0;
    float wSpd = (waveSpeedP > 0.01) ? waveSpeedP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    float kWave = (14.0 + 8.0 * audioCentroid) * wSpd;

    // Accumulate multiple interacting BZ spiral wave centers
    float waveAcc = 0.0;
    int numS = int(clamp(nSpirals, 2.0, 6.0));

    for (int k = 0; k < 4; k++) {
        if (k >= numS) break;
        float kf = float(k);
        float aCenter = t * 0.3 + kf * (6.2831853 / float(numS));
        // Sub-bass drives the spiral cores apart: rCenter is the orbit radius
        // of each phase singularity, so scaling it breathes the whole core
        // constellation outward without touching its rotation phase.
        float rCenter = (0.35 + 0.15 * sin(t * 0.4 + kf)) * (1.0 + 0.38 * audioSubBass);
        vec2 cPos = vec2(cos(aCenter), sin(aCenter)) * rCenter;

        float dir = (k % 2 == 0) ? 1.0 : -1.0;
        waveAcc += bzSpiral(uv, cPos, t, kWave, dir);
    }

    float chemicalState = waveAcc / float(numS);

    // Glowing wavefront crests
    float crestGlow = smoothstep(0.75, 1.0, chemicalState) * glw;

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(chemicalState * 0.08) + 0.5);
    vec3 texCol = img(sampleUV);

    // Chemical luminescence palette
    vec3 palA = imgPalette(chemicalState * 0.4 + t * 0.05);
    vec3 palB = imgPalette(chemicalState * 0.4 + 0.5);
    vec3 chemCol = mix(palA, palB, clamp(chemicalState * 0.5 + 0.5, 0.0, 1.0));

    chemCol = mix(chemCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing wavefront crests and kick flashes
    vec3 crestTint = vec3(1.4, 1.1, 1.8) * crestGlow * (1.0 + 2.5 * audioKick);
    chemCol += crestTint;

    chemCol = pow(chemCol, vec3(0.88));
    fragColor = vec4(clamp(chemCol, 0.0, 1.0), 1.0);
}

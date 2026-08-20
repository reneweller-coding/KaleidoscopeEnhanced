#version 330 core
out vec4 fragColor;
/**
 * @file SuperfluidQuantumTurbulence.frag
 * @brief SUPERFLUID QUANTUM TURBULENCE: Microscopic quantized vortex filament tangle
 * in liquid Helium-4 (Gross-Pitaevskii condensate). Luminous vortex core singularities,
 * dynamic reconnections, phase-slip acoustic waves, and Kelvin wave ripples.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous quantized vortex advection & reconnection
 *   audioKick    -> flashes vortex reconnection singularities & acoustic shockwave burst
 *   audioCentroid-> modulates vortex core density & Kelvin wave frequency
 *   audioSubBass -> expands condensate density breathing
 *   audioChromaHue-> rotates the cryogenic superfluid spectrum
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
uniform float vortexCountP;
uniform float kelvinP;
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

// Compute quantized vortex phase field: sum_k arctan(y - y_k, x - x_k)
vec2 superfluidField(vec2 p, float t, float nVortices, out float minCoreDist) {
    float totalPhase = 0.0;
    minCoreDist = 1e5;
    int numV = int(clamp(nVortices, 4.0, 8.0));

    for (int k = 0; k < 8; k++) {
        if (k >= numV) break;
        float kf = float(k);
        // Vortex core orbital motion + reconnection oscillation
        float aOrbit = t * 0.4 * (k % 2 == 0 ? 1.0 : -1.0) + kf * (6.2831853 / float(numV));
        float rOrbit = 0.45 + 0.2 * sin(t * 0.5 + kf * 1.5);
        vec2 vCore = vec2(cos(aOrbit), sin(aOrbit)) * rOrbit;

        vec2 diff = p - vCore;
        float d = length(diff);
        minCoreDist = min(minCoreDist, d);

        // Quantized phase contribution (winding number +1 or -1)
        float winding = (k % 2 == 0) ? 1.0 : -1.0;
        totalPhase += atan(diff.y, diff.x) * winding;
    }

    return vec2(cos(totalPhase), sin(totalPhase));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nV = (vortexCountP > 1.0) ? vortexCountP : 6.0;
    float klv = (kelvinP > 0.01) ? kelvinP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Superfluid quantum phase evaluation
    float minCore;
    vec2 phaseVec = superfluidField(uv, t, nV, minCore);
    float quantumPhase = atan(phaseVec.y, phaseVec.x);

    // Kelvin wave ripples propagating on phase field
    float kelvinWave = sin(quantumPhase * 4.0 * klv + minCore * 25.0 - t * 5.0);

    // Sample slideshow texture warped by quantum circulation
    vec2 sampleUV = fract(uv * 0.5 + phaseVec * 0.08 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing quantized vortex cores (zero density singularities)
    float coreGlow = exp(-minCore * (35.0 + 15.0 * audioCentroid)) * glw;

    // Phase interference fringe coloring
    vec3 palA = imgPalette(quantumPhase / 6.2831853 + t * 0.05);
    vec3 palB = imgPalette(quantumPhase / 6.2831853 + 0.5);
    vec3 superfluidCol = mix(palA, palB, 0.5 + 0.5 * kelvinWave);

    superfluidCol = mix(superfluidCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing vortex cores and reconnection bursts
    vec3 coreTint = vec3(1.2, 1.4, 1.9) * coreGlow * (1.0 + 3.0 * audioKick);
    superfluidCol += coreTint;

    // Acoustic shockwave ripples
    float acousticWave = abs(sin(minCore * 35.0 - t * 8.0));
    superfluidCol += imgPalette(0.8) * smoothstep(0.9, 1.0, acousticWave) * 0.35 * audioKick;

    superfluidCol = pow(superfluidCol, vec3(0.88));
    fragColor = vec4(clamp(superfluidCol, 0.0, 1.0), 1.0);
}

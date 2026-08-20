#version 330 core
out vec4 fragColor;
/**
 * @file ChronoSynapticMandala.frag
 * @brief CHRONO SYNAPTIC MANDALA: Multi-ring temporal echo kaleidoscope with
 * staggered time-delay rings, synaptic neural energy conduits, and high-frequency
 * harmonic mandala folding.
 *
 * Audio Reactivity:
 *   audioAdvance -> continuous rotation & temporal phase wave progression
 *   audioKick    -> inward-to-outward radial synaptic pulse & flash
 *   audioCentroid-> modulates neural conduit branching frequency
 *   audioSubBass -> expands temporal ring displacement amplitude
 *   audioChromaHue-> rotates the synaptic color palette
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
uniform float ringsP;
uniform float foldP;
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
    float numRings = (ringsP > 1.0) ? ringsP : 8.0;
    float folds = (foldP > 1.0) ? foldP : 12.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Discrete temporal ring index
    float ringCoord = r * numRings;
    float ringIdx = floor(ringCoord);
    float ringFrac = fract(ringCoord);

    // Staggered temporal phase per ring (chronological echo)
    float timeLag = ringIdx * (0.35 + 0.15 * audioFlux);
    float ringTime = audioAdvance * 0.25 * spd - timeLag;

    // Alternating counter-rotation per ring
    float dir = (mod(ringIdx, 2.0) == 0.0) ? 1.0 : -1.0;
    float rotA = a + ringTime * 0.5 * dir + 0.2 * sin(audioPhase + ringIdx);

    // Radial N-fold kaleidoscope mirror fold
    float seg = 3.14159265 / folds;
    rotA = mod(rotA + seg, 2.0 * seg) - seg;
    rotA = abs(rotA);

    vec2 pFold = vec2(cos(rotA), sin(rotA)) * r;

    // Synaptic neural energy conduits (wavy pulses)
    // Only the amplitude is audio-driven -- the phase term stays untouched so
    // the ring echo cannot be remapped mid-flight by a sub-bass swell.
    float wave = sin(r * 28.0 - ringTime * 4.0 + ringIdx) * (0.03 + 0.04 * audioKick) * (1.0 + 0.6 * audioSubBass);
    pFold += vec2(sin(pFold.y * 15.0), cos(pFold.x * 15.0)) * wave;

    // Sampling image at chrono-delayed coordinates
    vec2 sampleUV = fract(pFold * (0.8 + 0.2 * sin(ringIdx * 1.5)) + 0.5);
    vec3 texCol = img(sampleUV);

    // Inter-ring glowing boundary line
    float ringEdge = smoothstep(0.08, 0.0, abs(ringFrac - 0.5));
    float conduitGlow = exp(-abs(sin(rotA * folds * 2.0 + ringTime)) * (15.0 + 10.0 * audioCentroid)) * glw;

    // Color mixing across temporal layers
    vec3 palA = imgPalette(ringIdx * 0.15 + ringTime * 0.05);
    vec3 palB = imgPalette(ringIdx * 0.15 + 0.5);
    vec3 mixedCol = mix(palA, palB, 0.5 + 0.5 * sin(r * 10.0 + ringTime));

    mixedCol = mix(mixedCol, texCol, 0.4 + 0.2 * audioValence);

    // Add glowing conduits & pulse
    vec3 neonTint = vec3(1.3, 0.8, 1.6) * (conduitGlow + ringEdge * 0.6) * (1.0 + 2.5 * audioKick);
    mixedCol += neonTint;

    // Center lotus bloom flare -- kept small enough to read as an accent,
    // not a white disc swallowing the whole mandala centre.
    float centerFlare = exp(-r * 6.0) * (0.35 + 0.5 * audioLevel);
    mixedCol += imgPalette(0.8) * centerFlare;

    // Contrast and vignette
    mixedCol = pow(mixedCol, vec3(0.9));
    float vig = 1.0 - smoothstep(0.9, 1.45, r);
    mixedCol *= vig;

    fragColor = vec4(clamp(mixedCol, 0.0, 1.0), 1.0);
}

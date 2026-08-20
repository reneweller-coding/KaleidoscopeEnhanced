#version 330 core
out vec4 fragColor;
/**
 * @file PsychedelicReactionMelt.frag
 * @brief PSYCHEDELIC REACTION MELT: Turing / Gray-Scott procedural reaction-diffusion
 * morphogenetic labyrinth with melting liquid wax feedback, chromatic phase inversions,
 * and high-energy chemical spot/stripe division waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> surges the chemical diffusion advection & melting on top of a
 *                   constant base drift rate (so the reaction never freezes)
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

// Overall level of the photo currently on the texture units, from a fixed 5-tap
// grid. Every base colour in this scene is photo-derived, so a bright photo drove
// the whole reaction field to a uniform white wash - no visible chemistry at all.
// The probe rides the tex0/tex1 crossfade so the gain it feeds can never pop, and
// being one number per frame it moves exposure without touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
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

    // The reaction only ever advanced on audioAdvance, which creeps at ~0.25/s on
    // quiet material -> the melt stood still. A constant base rate (per-activation
    // constant coefficient on `time`, so anti-flicker safe) keeps it flowing, with
    // audioAdvance still riding on top as the music-driven surge.
    float t = time * 0.30 * spd + audioAdvance * 0.32 * spd;

    // Liquid dripping/melting downward displacement
    vec2 pMelt = uv;
    pMelt.y += sin(pMelt.x * 8.0 + t * 2.0) * (0.15 * mlt + 0.1 * audioSubBass);
    pMelt += vec2(sin(pMelt.y * 6.0 - t), cos(pMelt.x * 6.0 + t)) * 0.08;

    // Compute Turing morphogenetic field.
    // baseFreq was 8..14 and turingField multiplies it by 1.85 per octave (x6.3
    // by the 4th), evaluated on pMelt*2.0 -- the finest octave landed near 170
    // cycles across the frame. That is far past the resolution the picture can
    // hold: every neighbourhood contained the full range of the field, so the
    // whole image averaged to one uniform value with no readable structure.
    // Dropped to a scale where the labyrinth cells are actually SEEN.
    float baseFreq = (2.6 + 2.0 * audioCentroid) * freqMod;
    float chemicalVal = turingField(pMelt * 1.1, t, baseFreq);

    // Chemical boundary contour lines (isolines). chemicalVal spans about +-2.0,
    // so the old *6.0 wrapped the sine ~4x per unit of an already-oscillating
    // field -- pure moire, not contours. *1.2 traces the field's own isolines.
    float isoLines = abs(sin(chemicalVal * 1.2 + t * 3.0));
    float ridgeGlow = smoothstep(0.86, 1.0, isoLines) * glw;

    // Large-scale concentration: the slow half of the field, used as a light/dark
    // mask so the frame carries low-frequency contrast instead of one flat level.
    float conc = 0.5 + 0.5 * sin(chemicalVal * 0.9 - t * 0.25);

    // Sample distorted texture along chemical gradient
    vec2 sampleUV = fract(pMelt * 0.5 + vec2(chemicalVal * 0.08, 0.0) + 0.5);
    vec3 texCol = img(sampleUV);

    // Dynamic color phase (inverts on audio kick)
    float phase = chemicalVal * 0.4 + t * 0.15 + audioKick * 0.5;
    vec3 palA = imgPalette(phase);
    vec3 palB = imgPalette(phase + 0.5);
    vec3 chemCol = mix(palA, palB, 0.5 + 0.5 * sin(chemicalVal * 3.0));

    chemCol = mix(chemCol, texCol, 0.35 + 0.15 * audioValence);

    // Dark troughs / lit crests: without this the base level sat just under the
    // ridge add and the whole frame clamped to white. The photo probe keeps that
    // crest/trough swing readable no matter how bright the current picture is --
    // a near-white photo used to swamp the whole modulation.
    float expGain = clamp(0.42 / max(0.06, photoLevel()), 0.55, 1.60);
    chemCol *= (0.30 + 0.85 * conc) * expGain;

    // Add glowing reaction ridge lines and kick flash (bounded - the old
    // unbounded add pushed roughly a third of the frame past 1.0 on its own)
    vec3 neonRidge = min(vec3(1.4, 0.9, 1.7) * ridgeGlow * (1.0 + 2.0 * audioKick),
                         vec3(0.85, 0.60, 1.00));
    chemCol += neonRidge * 0.6;

    // Center chemical nucleus bloom
    float centerBloom = exp(-length(uv) * 4.0) * (0.35 + 0.7 * audioLevel);
    chemCol += min(imgPalette(0.8) * centerBloom, vec3(0.42));

    chemCol = pow(min(chemCol, vec3(1.0)), vec3(0.87));
    // Soft knee on top of the hard cap: pow(x, 0.87) lifts the midtones, so
    // where a ridge crest lands on an already-lit crest the two still stacked
    // up against the ceiling. The knee bends those crests over instead of
    // flattening them against it.
    vec3 _catTone = clamp(chemCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.26 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}

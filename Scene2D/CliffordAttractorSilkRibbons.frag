#version 330 core
out vec4 fragColor;
/**
 * @file CliffordAttractorSilkRibbons.frag
 * @brief CLIFFORD ATTRACTOR SILK RIBBONS: Hyper-dense trigonometric Clifford / De Jong
 * attractor density maps with silky flowing ribbon sheets, dynamic parameter morphing,
 * and high-luminance glowing caustics.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Clifford parameter modulation & ribbon flow
 *   audioKick    -> flashes attractor density caustic peaks & shockwave ripple
 *   audioCentroid-> modulates trigonometric frequency parameters (a, b)
 *   audioSubBass -> expands silk ribbon fold amplitude
 *   audioChromaHue-> rotates the flowing iridescent silk spectrum
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
uniform float densityP;
uniform float silkP;
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
    float dens = (densityP > 0.01) ? densityP : 1.0;
    float slk = (silkP > 0.01) ? silkP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // Clifford attractor parameters modulated smoothly across time
    float a = -1.4 + 0.4 * sin(t * 0.3) + 0.2 * audioCentroid;
    float b = 1.6 + 0.3 * cos(t * 0.25);
    // c/d scale the cosine terms, i.e. how far each Clifford step folds the
    // sheet back on itself; sub-bass swells that fold depth. Bounded well
    // under the |x|,|y| <= 1+c limit so the attractor stays finite.
    float foldAmp = 1.0 + 0.35 * audioSubBass;
    float c = (1.0 + 0.3 * sin(t * 0.4 + audioFlux)) * foldAmp;
    float d = (0.7 + 0.3 * cos(t * 0.35)) * foldAmp;

    // Screen coordinate frame with gentle rotation
    float rotA = t * 0.15 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 p = mat2(cs, -sn, sn, cs) * uv * (2.8 * dens);

    // Multi-point Clifford attractor evaluation from local coordinate seeds
    float minDist = 1e5;
    float densityAcc = 0.0;

    vec2 pIter = p;
    for (int i = 0; i < 28; i++) {
        // Clifford map equation
        float xNext = sin(a * pIter.y) + c * cos(a * pIter.x);
        float yNext = sin(b * pIter.x) + d * cos(b * pIter.y);
        pIter = vec2(xNext, yNext);

        float dCur = length(p - pIter);
        minDist = min(minDist, dCur);
        densityAcc += exp(-dCur * (8.0 * slk));
    }

    // Sample texture mapped on attractor coordinate
    vec2 sampleUV = fract(pIter * 0.3 + 0.5);
    vec3 texCol = img(sampleUV);

    // Luminous silk ribbon caustics
    float silkGlow = exp(-minDist * (12.0 + 8.0 * audioCentroid)) * glw;

    // Palette mixing
    vec3 palA = imgPalette(densityAcc * 0.1 + t * 0.05);
    vec3 palB = imgPalette(densityAcc * 0.1 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(densityAcc * 0.8 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing silk ribbon sheets and kick flashes
    vec3 silkTint = vec3(1.3, 1.1, 1.7) * (silkGlow + densityAcc * 0.08) * (1.0 + 2.5 * audioKick);
    col += silkTint;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

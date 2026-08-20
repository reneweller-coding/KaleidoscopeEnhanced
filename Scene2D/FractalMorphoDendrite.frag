#version 330 core
out vec4 fragColor;
/**
 * @file FractalMorphoDendrite.frag
 * @brief FRACTAL MORPHO DENDRITE: Growing bio-luminescent coral & electric dendrite
 * KIFS fractal with dynamic angular branch unfolding, synaptic discharge tips,
 * and high-voltage organic pulsations.
 *
 * Audio Reactivity:
 *   audioAdvance -> continuous branch unfolding & growth progression
 *   audioKick    -> flashes electric branch tip discharges & shoots lightning arcs
 *   audioCentroid-> modulates branch folding complexity and fine tendrils
 *   audioSubBass -> expands branch trunk thickness breathing
 *   audioChromaHue-> rotates the bio-fluorescent color spectrum
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
uniform float foldAngleP;
uniform float branchP;
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
    float fAng = (foldAngleP > 0.01) ? foldAngleP : 1.0;
    float brn = (branchP > 0.01) ? branchP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // Center coordinate zoom & rotation
    float scale = (2.2 + 0.4 * sin(audioSwell * 2.0)) * brn;
    vec2 z = uv * scale;

    // Symmetrical 6-fold radial mirroring
    float a = atan(z.y, z.x);
    float r = length(z);
    float seg = 3.14159265 / 3.0;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    z = vec2(cos(a), sin(a)) * r;

    // Iterated KIFS dendritic folding
    float minDendriteDist = 1e5;
    float branchAccum = 0.0;
    float tipGlow = 0.0;

    float foldAngle = (0.75 + 0.25 * sin(t * 0.4) + 0.15 * audioFlux) * fAng;
    mat2 rotFold = mat2(cos(foldAngle), -sin(foldAngle), sin(foldAngle), cos(foldAngle));

    for (int i = 0; i < 9; i++) {
        // Absolute mirror fold
        z = abs(z) - vec2(0.35 + 0.1 * sin(t * 0.5 + float(i)), 0.25);

        // Rotation fold
        z = rotFold * z;

        // Scaling with audio breath
        float scFactor = 1.38 + 0.08 * sin(audioPhase + float(i) * 0.5);
        z *= scFactor;
        z -= vec2(0.4, 0.2 * cos(t * 0.3));

        // Track dendritic segment distance
        float dSeg = length(vec2(z.x, max(0.0, abs(z.y) - 0.4))) / pow(scFactor, float(i));
        minDendriteDist = min(minDendriteDist, dSeg);

        // Accumulate branch tips
        if (i >= 5) {
            float dTip = length(z) / pow(scFactor, float(i));
            tipGlow += exp(-dTip * 35.0);
        }

        branchAccum += dot(z, z) * 0.05;
    }

    // Dynamic texture sample mapped across dendrite manifold
    vec2 sampleUV = fract(z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing dendrite filament lines
    float filamentGlow = exp(-minDendriteDist * (32.0 + 18.0 * audioCentroid)) * glw;

    // Palette mixing
    vec3 palA = imgPalette(branchAccum * 0.1 + t * 0.05);
    vec3 palB = imgPalette(branchAccum * 0.1 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(branchAccum * 0.5 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Glowing electric filaments and discharge tips
    vec3 electricTint = vec3(1.1, 1.4, 1.8) * filamentGlow * (1.0 + 2.5 * audioKick);
    vec3 tipDischarge = vec3(1.5, 0.8, 1.6) * tipGlow * (1.5 + 3.0 * audioKick);
    col += electricTint + tipDischarge;

    // Background organic plasma haze
    float haze = sin(uv.x * 8.0 + t) * cos(uv.y * 8.0 - t);
    col += imgPalette(0.3) * (0.15 + 0.1 * haze) * audioLevel;

    col = pow(col, vec3(0.86));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

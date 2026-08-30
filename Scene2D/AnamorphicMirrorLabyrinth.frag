#version 330 core
out vec4 fragColor;
/**
 * @file AnamorphicMirrorLabyrinth.frag
 * @brief ANAMORPHIC MIRROR LABYRINTH: Cylindrical & conical optical anamorphic
 * transformation labyrinth. Virtual chrome mirror columns reconstruct distorted
 * psychedelic image projections into sharp holographic mandalas.
 *
 * Audio Reactivity:
 *   audioAdvance -> rotates the anamorphic distortion fields & mirror centers
 *   audioKick    -> flashes liquid specular ripples & mirror axis pulse
 *   audioSubBass -> expands radial mirror column radius
 *   audioCentroid-> sharpens optical focal caustics
 *   audioChromaHue-> rotates the chrome reflections & background colors
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
uniform float mirrorCountP;
uniform float anamorphP;
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
    float mCount = (mirrorCountP > 0.5) ? mirrorCountP : 3.0;
    float anm = (anamorphP > 0.01) ? anamorphP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Multi-center anamorphic distortion lattice
    vec3 finalCol = vec3(0.0);
    float totalWeight = 0.0;
    float causticAccum = 0.0;

    int numPillars = int(clamp(mCount, 1.0, 5.0));

    for (int k = 0; k < 4; k++) {
        if (k >= numPillars) break;

        float kf = float(k);
        float orbitAngle = t * 0.35 + kf * (6.2831853 / float(numPillars));
        float orbitRad = (numPillars == 1) ? 0.0 : (0.42 + 0.15 * sin(t * 0.5 + kf));
        vec2 center = vec2(cos(orbitAngle), sin(orbitAngle)) * orbitRad;

        vec2 rel = uv - center;
        float r = length(rel);
        float a = atan(rel.y, rel.x);

        // Cylindrical mirror radius
        float mirrorR = 0.28 + 0.08 * sin(audioSwell * 2.5 + kf) + 0.05 * audioSubBass;

        // Anamorphic coordinate unrolling
        // Inside/near mirror: unroll cylinder reflection; outside: polar stretch
        float reflectionDist = abs(r - mirrorR);
        float anamAngle = a * anm + t * 0.2 * (k % 2 == 0 ? 1.0 : -1.0);
        float anamRadius = exp(r * 2.2 * anm) * 0.25;

        vec2 anamUV = vec2(
            0.5 + 0.45 * anamRadius * cos(anamAngle),
            0.5 + 0.45 * anamRadius * sin(anamAngle)
        );

        // Ripple caustic displacement on mirror cylinder boundary
        float ripple = sin(r * 35.0 - t * 4.0) * (0.02 + 0.03 * audioKick);
        anamUV += vec2(cos(a * 4.0), sin(a * 4.0)) * ripple;

        // Sample unwrapped texture
        vec3 colSample = img(fract(anamUV));

        // Specular chrome edge and focal caustic
        float edge = smoothstep(0.08, 0.0, reflectionDist);
        // Tonal brightness tightens the focal falloff instead of boosting it --
        // a sharper caustic must not also become a brighter one.
        float caustic = pow(clamp(1.0 - reflectionDist * (8.0 + 5.0 * audioCentroid), 0.0, 1.0), 3.0 + 1.5 * audioCentroid);
        causticAccum += caustic * (1.0 + 2.0 * audioKick);

        // Mix palette tint with chrome reflection
        vec3 tint = imgPalette(a / 6.2831853 + kf * 0.25);
        vec3 mixedCol = mix(colSample, tint, 0.4 + 0.3 * edge);

        // Chrome shine
        mixedCol += vec3(1.2, 1.1, 1.4) * caustic * glw;

        float weight = 1.0 / (0.1 + r * r * 4.0);
        finalCol += mixedCol * weight;
        totalWeight += weight;
    }

    finalCol /= max(0.001, totalWeight);

    // Global chromatic aberration from anamorphic lenses
    float ca = 0.012 * (audioFlux + audioKick);
    vec3 caTint = imgPalette(length(uv) + ca);
    finalCol.r = mix(finalCol.r, caTint.r, 0.25);

    // Background optical dispersion grid
    float grid = abs(sin(uv.x * 20.0 + t)) * abs(cos(uv.y * 20.0 - t));
    finalCol += imgPalette(0.3) * grid * 0.12 * audioLevel;

    // Saturation and contrast
    finalCol = pow(finalCol, vec3(0.85));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

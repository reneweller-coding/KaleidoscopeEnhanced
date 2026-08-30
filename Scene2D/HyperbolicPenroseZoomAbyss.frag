#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicPenroseZoomAbyss.frag
 * @brief HYPERBOLIC PENROSE ZOOM ABYSS: Infinite logarithmic scale dive into a 5-fold
 * Penrose kite-and-dart aperiodic tiling. Continuous golden ratio deflation subdivisions,
 * self-similar multi-octave zoom blending, and glowing gold-metallic tile borders.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous infinite zoom progression into Penrose tiles
 *   audioKick    -> flashes Penrose vertex nodes & triggers deflation scale bursts
 *   audioCentroid-> sharpens golden kite-and-dart tile edge lines
 *   audioSubBass -> expands Penrose star cluster breathing scale
 *   audioChromaHue-> rotates the golden aperiodic crystal spectrum
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
uniform float scaleP;
uniform float edgeWidthP;
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

// 5-Fold Penrose pentagram grid potential
float penrosePotential(vec2 p, float t) {
    float sum = 0.0;
    for (int i = 0; i < 5; i++) {
        float angle = float(i) * (6.2831853 / 5.0) + t * 0.1;
        vec2 dir = vec2(cos(angle), sin(angle));
        sum += cos(dot(p, dir) * 4.0);
    }
    return sum / 5.0;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float scMod = (scaleP > 0.01) ? scaleP : 1.0;
    float eWidth = (edgeWidthP > 0.01) ? edgeWidthP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.35 * spd + audioAdvance * 0.28 * spd;   // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Golden ratio scaling for seamless deflation zoom
    const float PHI = 1.6180339887;
    float zoomProg = mod(t * 0.7, 1.0);

    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    // Accumulate across 4 nested Penrose scale octaves
    for (int k = 0; k < 4; k++) {
        float kf = float(k);
        // Sub-bass dilates every octave's star cluster: a smaller layer scale fits
        // fewer kites across the frame, so the pentagonal clusters swell. zoomProg
        // itself is untouched, keeping the golden-ratio octave crossfade seamless.
        float layerScale = pow(PHI, kf - zoomProg + 2.0) * (2.0 * scMod) / (1.0 + 0.3 * audioSubBass);
        float layerFade = smoothstep(0.0, 0.3, kf - zoomProg) * smoothstep(3.8, 2.5, kf - zoomProg);

        if (layerFade <= 0.001) continue;

        // 5-Fold rotated coordinate per octave
        float rotA = t * 0.1 * (k % 2 == 0 ? 1.0 : -1.0) + kf * 0.628;
        float cs = cos(rotA), sn = sin(rotA);
        vec2 pPen = mat2(cs, -sn, sn, cs) * uv * layerScale;

        float pot = penrosePotential(pPen, t);
        float dEdge = abs(fract(pot * 2.5) - 0.5) - 0.05 * eWidth;
        float edgeGlow = exp(-abs(dEdge) * (22.0 + 10.0 * audioCentroid)) * glw;

        // Sample distorted background photo
        vec2 sampleUV = fract(pPen * 0.15 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(kf * 0.25 + pot * 0.3);

        vec3 tileCol = mix(texCol, palCol, 0.5);
        tileCol += vec3(1.5, 1.3, 0.5) * edgeGlow * (1.0 + 2.5 * audioKick);

        colAcc += tileCol * layerFade;
        weightAcc += layerFade;
    }

    vec3 finalCol = colAcc / max(0.001, weightAcc);

    // Center deflation burst
    float centerPulse = pow(max(0.0, 1.0 - abs(zoomProg - 0.5) * 4.0), 3.0) * (0.6 + 1.5 * audioKick);
    finalCol += imgPalette(0.85) * centerPulse;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

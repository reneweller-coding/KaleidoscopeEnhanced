#version 330 core
out vec4 fragColor;
/**
 * @file FractalPortalRecursionHall.frag
 * @brief FRACTAL PORTAL RECURSION HALL: Infinite recursive corridor of nested affine
 * portal gates. Each portal frame rotates and scales into the next transfinite portal
 * chamber with glowing elliptical laser rings and chromatic feedback echoes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge through the recursive portals
 *   audioKick    -> flashes portal event horizons & triggers dimensional zoom leaps
 *   audioCentroid-> modulates portal frame rotation angle & laser ring sharpness
 *   audioSubBass -> expands portal ellipse aspect ratio breathing
 *   audioChromaHue-> rotates the transfinite portal gate spectrum
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
uniform float portalScaleP;
uniform float rotAngleP;
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
    float pScale = (portalScaleP > 0.01) ? portalScaleP : 1.45;
    float rotStep = (rotAngleP > 0.01) ? rotAngleP : 0.785398; // 45 degrees
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Logarithmic scale progression for infinite plunge
    float zoomProg = mod(t * 0.8, 1.0);
    vec2 p = uv * exp(zoomProg * log(pScale));

    vec3 colAcc = vec3(0.0);
    float glowAcc = 0.0;
    float weightAcc = 0.0;

    // Iterated affine portal transformations across 8 nested levels
    for (int k = 0; k < 8; k++) {
        float kf = float(k);
        float layerFade = smoothstep(0.0, 0.4, kf) * smoothstep(7.5, 5.0, kf);

        // Elliptical portal frame distance
        vec2 pEllip = p * vec2(1.0, 1.3 + 0.2 * sin(audioSubBass));
        float dFrame = abs(length(pEllip) - 1.1);
        float frameGlow = exp(-dFrame * (22.0 + 12.0 * audioCentroid)) * layerFade * glw;

        // Sample texture inside this portal frame
        vec2 sampleUV = fract(p * 0.35 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(kf * 0.15 + t * 0.05);

        vec3 portalCol = mix(texCol, palCol, 0.5);
        vec3 frameTint = vec3(1.3, 1.1, 1.8) * frameGlow * (1.0 + 2.5 * audioKick);

        colAcc += (portalCol * 0.4 + frameTint) * layerFade;
        weightAcc += layerFade;
        glowAcc += frameGlow;

        // Step through portal into the next inner dimension: rotate and scale
        float curRot = rotStep + 0.15 * sin(t * 0.4 + kf) + 0.1 * audioFlux;
        float cs = cos(curRot), sn = sin(curRot);
        p = mat2(cs, -sn, sn, cs) * p * pScale;
    }

    vec3 finalCol = colAcc / max(0.001, weightAcc);

    // Center portal horizon singularity burst
    float centerBloom = exp(-length(uv) * 6.0) * (1.0 + 2.5 * audioKick);
    finalCol += imgPalette(0.85) * centerBloom;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

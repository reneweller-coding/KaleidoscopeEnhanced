#version 330 core
out vec4 fragColor;
/**
 * @file ConformalLogPolarDive.frag
 * @brief CONFORMAL LOG POLAR DIVE: Complex exponential mapping w = exp(z) transforming
 * the Cartesian image plane into infinite swirling twin galactic spiral arms with
 * seamless multi-octave zoom blending and high-energy chromatic distortion.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous exponential spiral plunge trajectory
 *   audioKick    -> flashes spiral galaxy core & shoots centrifugal ripple waves
 *   audioCentroid-> modulates logarithmic spiral twist angle
 *   audioSubBass -> expands spiral arm width breathing
 *   audioChromaHue-> rotates the conformal galaxy rainbow palette
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
uniform float spiralP;
uniform float armsP;
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
    float sprl = (spiralP > 0.01) ? spiralP : 1.0;
    float nArms = (armsP > 1.0) ? armsP : 2.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    float r = max(1e-5, length(uv));
    float a = atan(uv.y, uv.x);

    // Conformal log-polar transformation: w = ln(r) + i * theta
    float lnR = log(r);

    // Dynamic spiral winding angle
    float spiralAngle = (1.2 + 0.3 * sin(t * 0.3) + 0.2 * audioCentroid) * sprl;

    // Log-polar coordinates with continuous forward translation along lnR and rotation along a
    vec2 logPolar = vec2(
        lnR * 0.6 - t * 0.8 + (a * nArms) * spiralAngle * 0.159155,
        a / 6.2831853 + t * 0.1
    );

    // Multi-octave blending
    float phase = fract(logPolar.x);
    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    for (int k = -1; k <= 1; k++) {
        float f = phase + float(k);
        float w = exp(-4.0 * (f - 0.5) * (f - 0.5));

        vec2 sampleCoord = vec2(f * 2.0, logPolar.y * nArms);
        vec3 sampleCol = img(fract(sampleCoord));
        vec3 palCol = imgPalette(f * 0.3 + a / 6.2831853);

        colAcc += mix(sampleCol, palCol, 0.45) * w;
        weightAcc += w;
    }

    vec3 finalCol = colAcc / max(0.001, weightAcc);

    // Glowing logarithmic spiral arm filaments
    float armDist = abs(sin(lnR * 4.0 - a * nArms * spiralAngle + t * 4.0));
    float armGlow = smoothstep(0.85, 1.0, armDist) * glw * (1.0 + 2.5 * audioKick);
    finalCol += vec3(1.3, 1.1, 1.8) * armGlow * 0.7;

    // Center singularity core bloom
    float centerBloom = exp(-r * 8.0) * (1.2 + 2.5 * audioKick);
    finalCol += imgPalette(0.85) * centerBloom;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

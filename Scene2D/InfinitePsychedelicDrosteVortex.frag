#version 330 core
out vec4 fragColor;
/**
 * @file InfinitePsychedelicDrosteVortex.frag
 * @brief INFINITE PSYCHEDELIC DROSTE VORTEX: Dual counter-rotating logarithmic
 * Droste spiral infinite zoom with seamless multi-octave blending, conformal
 * Möbius twist, and deep inward/outward recursive photo reflections.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous infinite logarithmic zoom progression
 *   audioKick    -> flashes spiral octave transition boundaries & ripple burst
 *   audioCentroid-> modulates Droste spiral twist angle (alpha)
 *   audioSubBass -> expands spiral vortex breathing
 *   audioChromaHue-> rotates the chromatic spiral palette
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
uniform float spiralTwistP;
uniform float octavesP;
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
    float twst = (spiralTwistP > 0.01) ? spiralTwistP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    float r = max(1e-5, length(uv));
    float a = atan(uv.y, uv.x);

    // Logarithmic conformal Droste mapping: w = ln(r) + i * theta
    float lnR = log(r);

    // Spiral twist angle alpha modulated by audio
    float alpha = (0.75 + 0.25 * sin(t * 0.3) + 0.2 * audioCentroid) * twst;

    // Dual spiral stream parameters: stream 1 (zooming in), stream 2 (zooming out)
    float zoomPhase1 = mod(lnR * 0.5 - t * 0.6 + a * alpha * 0.159155, 1.0);
    float zoomPhase2 = mod(-lnR * 0.5 - t * 0.4 - a * alpha * 0.159155, 1.0);

    // Multi-octave blending for seamless infinite zoom
    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    // Sub-bass swells the radius of the recursive sample ring, so the whole
    // vortex breathes wider on drones while the zoom phase stays untouched.
    float vortexScale = 0.35 * (1.0 + 0.32 * audioSubBass);

    for (int k = -1; k <= 1; k++) {
        float f1 = zoomPhase1 + float(k);
        float w1 = exp(-4.0 * (f1 - 0.5) * (f1 - 0.5));

        // Coordinate in exponential spiral space
        float rad1 = exp(f1 * 2.0);
        float ang1 = a + f1 * alpha * 6.2831853 + t * 0.2;
        vec2 uv1 = vec2(0.5) + vec2(cos(ang1), sin(ang1)) * rad1 * vortexScale;

        vec3 sample1 = img(fract(uv1));
        vec3 pal1 = imgPalette(f1 * 0.3 + a / 6.2831853);
        colAcc += mix(sample1, pal1, 0.4) * w1;
        weightAcc += w1;

        // Counter-stream
        float f2 = zoomPhase2 + float(k);
        float w2 = exp(-4.0 * (f2 - 0.5) * (f2 - 0.5)) * 0.6;
        float rad2 = exp(f2 * 2.0);
        float ang2 = -a - f2 * alpha * 6.2831853 - t * 0.15;
        vec2 uv2 = vec2(0.5) + vec2(cos(ang2), sin(ang2)) * rad2 * vortexScale;

        vec3 sample2 = img(fract(uv2));
        vec3 pal2 = imgPalette(f2 * 0.3 + 0.5 - a / 6.2831853);
        colAcc += mix(sample2, pal2, 0.4) * w2;
        weightAcc += w2;
    }

    vec3 finalCol = colAcc / max(0.001, weightAcc);

    // Glowing spiral branch ribs
    float spiralRib = abs(sin(lnR * 6.0 - a * 4.0 * alpha + t * 4.0));
    float ribGlow = smoothstep(0.85, 1.0, spiralRib) * glw * (1.0 + 2.5 * audioKick);
    finalCol += vec3(1.3, 1.1, 1.7) * ribGlow * 0.6;

    // Center singularity flash
    float centerBloom = exp(-r * 8.0) * (1.0 + 2.0 * audioKick);
    finalCol += imgPalette(0.8) * centerBloom;

    finalCol = pow(finalCol, vec3(0.86));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

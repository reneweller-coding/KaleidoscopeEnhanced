#version 330 core
out vec4 fragColor;
/**
 * @file CelticMandelbrotGothicVault.frag
 * @brief CELTIC MANDELBROT GOTHIC VAULT: Celtic Mandelbrot variation z -> |Re(z^2)| + i*Im(z^2) + c.
 * Gothic cathedral tracery arches, lancet church window filigree, stained-glass luminescence,
 * and continuous deep plunge through endless vaulted fractal naves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep plunge through Gothic cathedral arches
 *   audioKick    -> flashes stained-glass rosette window cores & cathedral flares
 *   audioCentroid-> sharpens lancet arch tracery & rib-vault boundaries
 *   audioSubBass -> expands cathedral nave arch width breathing
 *   audioChromaHue-> rotates the glowing stained-glass cathedral spectrum
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
uniform float zoomP;
uniform float traceryP;
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
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float trc = (traceryP > 0.01) ? traceryP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.25 * spd;

    // Zoom target on a Gothic lancet arch cusp: c = (-0.1, 0.65)
    vec2 cCenter = vec2(-0.1, 0.65);
    float zoomLevel = exp(mod(t * 0.65, 5.5)) * (2.2 * zm);
    vec2 c = cCenter + uv / zoomLevel;

    vec2 z = c;
    float iterCount = 0.0;
    float trap = 1e5;

    // Celtic Mandelbrot loop: z = |Re(z^2)| + i*Im(z^2) + c
    for (int i = 0; i < 48; i++) {
        // z^2 = (x^2 - y^2) + 2ixy
        float realPart = abs(z.x * z.x - z.y * z.y);
        float imagPart = 2.0 * z.x * z.y;
        z = vec2(realPart, imagPart) + c;

        float r2 = dot(z, z);
        trap = min(trap, abs(z.x) + abs(z.y));

        if (r2 > 16.0) {
            iterCount = float(i) - log2(max(1.0, log2(r2)));
            break;
        }
    }

    if (iterCount == 0.0) iterCount = 48.0;

    // Sample distorted background photo
    vec2 sampleUV = fract(z * 0.25 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing Gothic lancet arch tracery lines
    float archGlow = exp(-trap * (22.0 + 12.0 * audioCentroid) * trc) * glw;

    // Stained-glass window palette
    vec3 palA = imgPalette(iterCount * 0.04 + trap * 0.2);
    vec3 palB = imgPalette(iterCount * 0.04 + 0.5);
    vec3 vaultCol = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.8 + t));

    vaultCol = mix(vaultCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing Gothic tracery ribbing and rosette window flashes
    vec3 traceryTint = vec3(1.4, 1.2, 1.8) * archGlow * (1.0 + 2.5 * audioKick);
    vaultCol += traceryTint;

    // Rosette window central bloom
    float rosetteBloom = exp(-trap * 5.0) * (0.8 + 1.8 * audioKick);
    vaultCol += imgPalette(0.85) * rosetteBloom;

    vaultCol = pow(vaultCol, vec3(0.88));
    fragColor = vec4(clamp(vaultCol, 0.0, 1.0), 1.0);
}

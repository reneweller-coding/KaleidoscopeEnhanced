#version 330 core
out vec4 fragColor;
/**
 * @file LyapunovSpaceBioLoom.frag
 * @brief LYAPUNOV SPACE BIO LOOM: Quasi-periodic Lyapunov exponent fractal space
 * with dynamic sequence switching, bio-luminescent cellular stability zones,
 * and 3D embossed normal relief.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous navigation through (A, B) parameter space
 *   audioKick    -> flashes chaotic Lyapunov boundary nodes & stability burst
 *   audioCentroid-> modulates forced sequence order & fine cellular ridges
 *   audioSubBass -> expands cellular basin breathing
 *   audioChromaHue-> rotates the bio-luminescent stability spectrum
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
uniform float reliefP;
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

// Compute Lyapunov exponent for sequence "ABABBA" at parameters (A, B)
float calcLyapunov(vec2 ab, float t) {
    float aParam = ab.x;
    float bParam = ab.y;
    float x = 0.5;
    float lambda = 0.0;

    // 24 Iterations over 6-step repeating sequence
    for (int i = 0; i < 24; i++) {
        int seqIdx = i % 6;
        float r = (seqIdx == 0 || seqIdx == 2 || seqIdx == 5) ? aParam : bParam;

        // Logistic map step: x_{n+1} = r * x_n * (1 - x_n)
        x = r * x * (1.0 - x);
        float deriv = abs(r * (1.0 - 2.0 * x));
        lambda += log(max(0.001, deriv));
    }

    return lambda / 24.0;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float rel = (reliefP > 0.01) ? reliefP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.25 * spd + audioAdvance * 0.20 * spd;   // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Zoom into classic Lyapunov bio-space cusp around (3.8, 3.8)
    vec2 abCenter = vec2(3.6, 3.6);
    // Sub-bass magnifies the (A,B) window, so each cellular stability basin
    // swells across more screen area -- the basins breathe, the light doesn't.
    float zoomLevel = (1.5 + 0.3 * sin(audioSwell * 2.0)) * zm * (1.0 + 0.3 * audioSubBass);
    vec2 ab = abCenter + uv / zoomLevel;

    // Calculate Lyapunov exponent
    float lambda = calcLyapunov(ab, t);

    // 3D Embossed surface normal for plastic depth
    float eps = 0.006;
    float lX = calcLyapunov(ab + vec2(eps, 0.0), t);
    float lY = calcLyapunov(ab + vec2(0.0, eps), t);
    vec3 normal = normalize(vec3((lX - lambda) * rel, (lY - lambda) * rel, eps * 2.0));

    // Specular lighting
    vec3 lightDir = normalize(vec3(cos(t * 0.5), sin(t * 0.5), 1.2));
    float diff = max(0.0, dot(normal, lightDir));
    float spec = pow(max(0.0, dot(normal, normalize(lightDir + vec3(0,0,1)))), 20.0);

    // Sample texture mapped across Lyapunov coordinates
    vec2 sampleUV = fract(ab * 0.5 + 0.5);
    vec3 texCol = img(sampleUV);

    // Color: Stable (lambda < 0) vs Chaotic (lambda > 0)
    vec3 palStable = imgPalette(-lambda * 0.3 + 0.2);
    vec3 palChaotic = imgPalette(lambda * 0.5 + 0.7);

    vec3 baseCol = (lambda < 0.0) ? palStable : palChaotic;
    baseCol = mix(baseCol, texCol, 0.35 + 0.15 * audioValence);

    // Lighting and glowing stability boundaries
    float boundaryGlow = exp(-abs(lambda) * (20.0 + 10.0 * audioCentroid)) * glw;
    baseCol = baseCol * (0.6 + 0.4 * diff) + vec3(1.3, 1.2, 1.6) * spec * (1.0 + 2.0 * audioKick);
    baseCol += vec3(1.4, 1.1, 1.8) * boundaryGlow * (1.0 + 2.5 * audioKick);

    baseCol = pow(baseCol, vec3(0.88));
    fragColor = vec4(clamp(baseCol, 0.0, 1.0), 1.0);
}

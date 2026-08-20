#version 330 core
out vec4 fragColor;
/**
 * @file TricornFractalAntimatterSea.frag
 * @brief TRICORN FRACTAL ANTIMATTER SEA: Anti-holomorphic Tricorn (Mandelbar) fractal
 * z -> conj(z)^2 + c. Three-cornered fractal dragon scales, metallic antimatter fins,
 * and high-frequency glowing crest ripples over an infinite complex sea.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep plunge into Tricorn dragon fin cusps
 *   audioKick    -> flashes antimatter core singularities & triggers crest bursts
 *   audioCentroid-> sharpens three-cornered boundary fin serrations
 *   audioSubBass -> expands dragon scale breathing scale
 *   audioChromaHue-> steers the deep ultraviolet / turquoise / platinum palette
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
uniform float finSharpP;
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
    float fShp = (finSharpP > 0.01) ? finSharpP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.25 * spd;

    // Center on prominent Tricorn dragon fin: c = (-1.25, 0.0)
    vec2 cCenter = vec2(-1.25, 0.0);
    float zoomLevel = exp(mod(t * 0.65, 5.5)) * (2.2 * zm);
    vec2 c = cCenter + uv / zoomLevel;

    vec2 z = c;
    float iterCount = 0.0;
    float trap = 1e5;

    // Tricorn loop: z = conj(z)^2 + c = (x - iy)^2 + c = (x^2 - y^2 - 2ixy) + c
    for (int i = 0; i < 48; i++) {
        z = vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) + c;

        float r2 = dot(z, z);
        trap = min(trap, abs(z.x) + abs(z.y) * 0.8);

        if (r2 > 16.0) {
            iterCount = float(i) - log2(max(1.0, log2(r2)));
            break;
        }
    }

    if (iterCount == 0.0) iterCount = 48.0;

    // Sample distorted background photo
    vec2 sampleUV = fract(z * 0.25 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing dragon fin serrations
    float finGlow = exp(-trap * (20.0 + 10.0 * audioCentroid) * fShp) * glw;

    // Metallic antimatter palette
    vec3 palA = imgPalette(iterCount * 0.04 + trap * 0.2);
    vec3 palB = imgPalette(iterCount * 0.04 + 0.5);
    vec3 tricornCol = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.8 + t));

    tricornCol = mix(tricornCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing fin serration highlights and kick flash
    vec3 finTint = vec3(1.1, 1.4, 1.9) * finGlow * (1.0 + 2.5 * audioKick);
    tricornCol += finTint;

    // Core antimatter singularity bloom
    float coreBloom = exp(-trap * 4.0) * (0.8 + 1.8 * audioKick);
    tricornCol += imgPalette(0.85) * coreBloom;

    tricornCol = pow(tricornCol, vec3(0.88));
    fragColor = vec4(clamp(tricornCol, 0.0, 1.0), 1.0);
}

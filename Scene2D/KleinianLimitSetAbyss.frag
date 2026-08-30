#version 330 core
out vec4 fragColor;
/**
 * @file KleinianLimitSetAbyss.frag
 * @brief KLEINIAN LIMIT SET ABYSS: Iterated Schottky & Maskit-slice Kleinian group
 * limit sets (Indra's Pearls). Infinite fractal kissing pearl circles, deep zoom
 * into parabolic tangency cusps, and dynamic complex moduli morphing.
 *
 * Audio Reactivity:
 *   audioAdvance -> navigates through complex moduli space & deep cusp zoom
 *   audioKick    -> flashes cusp tangency nodes & explodes circle boundaries
 *   audioCentroid-> increases iteration depth & edge detail
 *   audioSubBass -> expands circle radius breathing
 *   audioChromaHue-> rotates the iridescent pearl spectrum
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
uniform float moduliP;
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

// Complex helper functions
vec2 cInv(vec2 z) { return vec2(z.x, -z.y) / max(0.0001, dot(z, z)); }
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float modParam = (moduliP > 0.01) ? moduliP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.25 * spd + audioAdvance * 0.20 * spd;   // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Deep zoom into the Kleinian cusp, ping-ponged. The old
    // exp(mod(t * 0.6, 6.0)) snapped from e^6 (403x) back to e^0 every ~10 s
    // -- a hard cut. A raised cosine over the same period dives in and eases
    // back out instead: continuous in value AND velocity (the derivative
    // vanishes at both turns), so no seam anywhere.
    float zc = 0.5 - 0.5 * cos(6.2831853 * fract(t * 0.6 / 6.0));   // 0..1..0
    // Zoom gedeckelt (max ~9x statt 403x): tief im Set blieb nur noch die
    // Grenzlinie uebrig -- "zwei einfarbige Flaechen".
    float zoomLevel = exp(zc * 2.2) * zm;
    vec2 z = uv / zoomLevel;

    // Moduli parameter mu for Maskit slice: mu = (mu_r, mu_i)
    vec2 mu = vec2(
        1.95 + 0.15 * sin(t * 0.3) * modParam,
        0.08 + 0.12 * cos(t * 0.24) * (1.0 + 0.2 * audioSwell)
    );

    // Initial translation and rotation
    float rotA = t * 0.15;
    float cs = cos(rotA), sn = sin(rotA);
    z = mat2(cs, -sn, sn, cs) * z + vec2(1.0, 0.0);

    float iterCount = 0.0;
    float minCuspDist = 1e5;
    float trap = 1e5;

    // Radius of the inversion circle of generator b. Sub-bass has to drive BOTH
    // the generator and the pearl-line distance below -- moving only the
    // measured radius would slide the highlight off the orbit points that
    // actually exist and simply extinguish the necklace.
    float circR = 1.0 + 0.18 * audioSubBass;

    // Iterated Kleinian group generator transformations:
    // a: z -> z + 2
    // b: z -> -1/z + mu
    for (int i = 0; i < 28; i++) {
        // Translation fold (generator a)
        z.x = mod(z.x + 1.0, 2.0) - 1.0;

        // Circle inversion fold (generator b)
        vec2 zInv = cInv(z);
        vec2 zNext = -zInv * (circR * circR) + mu;

        // Check if inside fundamental domain circle
        if (dot(zNext, zNext) < dot(z, z)) {
            z = zNext;
            iterCount += 1.0;
        }

        float dCircle = abs(length(z) - circR);
        minCuspDist = min(minCuspDist, dCircle);
        trap = min(trap, dot(z, z));
    }

    // Dynamic texture sample mapped to chaotic attractor coordinate
    vec2 sampleUV = fract(z * 0.3 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing pearl necklace edge lines
    float pearlGlow = exp(-minCuspDist * (40.0 + 20.0 * audioCentroid)) * glw;

    // Palette blending across iteration depth & orbit trap
    vec3 colA = imgPalette(iterCount * 0.09 + trap * 0.2);
    vec3 colB = imgPalette(iterCount * 0.09 + 0.5);
    vec3 finalCol = mix(colA, colB, 0.5 + 0.5 * sin(iterCount * 0.8 + t));

    finalCol = mix(finalCol, texCol, 0.35 + 0.15 * audioValence);

    // Add neon pearl highlights and kick flash
    vec3 pearlTint = vec3(1.3, 1.1, 1.7) * pearlGlow * (1.0 + 3.0 * audioKick);
    finalCol += pearlTint;

    // Cusp center bloom
    float cuspBloom = exp(-trap * 3.0) * (0.8 + 1.2 * audioLevel);
    finalCol += imgPalette(0.8) * cuspBloom;

    finalCol = pow(finalCol, vec3(0.87));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}

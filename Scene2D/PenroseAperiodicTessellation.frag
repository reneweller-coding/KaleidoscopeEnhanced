#version 330 core
out vec4 fragColor;
/**
 * @file PenroseAperiodicTessellation.frag
 * @brief PENROSE APERIODIC TESSELLATION: Infinite 5-fold aperiodic Penrose tiling
 * (kites and darts / rhombs) governed by the Golden Ratio phi (1.618...).
 * Recursive tile deflation, photoelastic stress birefringence colors,
 * and sacred non-repeating geometric photo segment mapping.
 *   audioAdvance -> rotates aperiodic deflation hierarchy
 *   audioKick    -> flashes photoelastic stress fringes across tile edges
 *   audioBeatPhase-> animates golden ratio recursive tile expansion
 *   audioChromaHue-> shifts birefringence spectrum colors
 *
 * Per-activation variety:
 *   tileP  float aperiodic tiling density / scale  (0.5..2.2)
 *   foldP  float 5-fold recursive folding depth    (0.5..2.0)
 *   speedP float kaleidoscopic swirl speed         (0.5..2.0)
 *   hueP   float structural color hue offset       (0..6.28)
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

uniform float tileP;
uniform float foldP;
uniform float speedP;
uniform float hueP;

const float PHI = 1.61803398875; // Golden Ratio

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours
// come from a rotating arc in the CURRENT slideshow image, so every
// activation inherits a fresh palette from the photos, and the arc follows
// the musical key (chromaHue is circular-slewed = jump-free) with a slow
// advance drift.  Valence shapes saturation toward the mood.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}


vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float tl  = (tileP  > 0.0) ? tileP  : 1.0;
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.25 * spd + audioAdvance * 0.15;

    // 5-fold polar symmetry folding
    vec2 p = uv * (3.5 / tl) * (1.0 - 0.08 * audioSwell);
    p = rot2D(t * 0.3) * p;

    float edgeDist = 1.0;
    float tileType = 0.0;
    float scale = 1.0;

    // Recursive Penrose grid / de Bruijn pentagrid projection
    float angleStep = 6.2831853 / 5.0;
    vec2 sumOffset = vec2(0.0);

    for (int i = 0; i < 5; ++i) {
        float a = float(i) * angleStep + t * 0.1;
        vec2 dir = vec2(cos(a), sin(a));
        float proj = dot(p, dir) + float(i) * 0.2 * fld;

        // Pentagrid stripe boundaries
        float stripe = abs(fract(proj) - 0.5);
        edgeDist = min(edgeDist, stripe);

        tileType += floor(proj);
    }

    // Photoelastic birefringence stress fringes (isochromatics)
    float stress = sin(edgeDist * 40.0 + audioPhase * 4.0);
    vec3 stressColor = imgPalette((stress * 3.0 + tileType * 0.3) * 0.159);

    // Photo texturing mapped into aperiodic cell frames
    vec2 cellUV = fract(p * 0.25 + sumOffset);
    vec3 photo = img(cellUV);

    // Combine visualizer
    vec3 col = mix(photo * 0.85, stressColor, 0.4 + 0.2 * audioSwell);

    // Glowing golden-ratio tile borders
    float borderGlow = exp(-edgeDist * 30.0) * (1.0 + audioKick * 3.0 + audioHigh * 1.5);
    col += borderGlow * vec3(1.0, 0.88, 0.45);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.3, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}

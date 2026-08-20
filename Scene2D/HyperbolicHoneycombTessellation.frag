#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicHoneycombTessellation.frag
 * @brief HYPERBOLIC HONEYCOMB TESSELLATION: Poincaré disk model of a 7-fold {7,3}
 * hyperbolic honeycomb tiling. Non-Euclidean SL(2, R) Möbius translations,
 * exponential boundary tile packing, and glowing hyperbolic circular arcs.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous non-Euclidean hyperbolic geodesic translation
 *   audioKick    -> flashes hyperbolic vertex nodes & boundary shockwaves
 *   audioCentroid-> modulates 7-fold symmetry ribbing resolution
 *   audioSubBass -> expands Poincaré disk breathing radius
 *   audioChromaHue-> rotates the non-Euclidean hyperbolic spectrum
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
uniform float symmetryP;
uniform float tileScaleP;
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

// Complex arithmetic helpers
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cDiv(vec2 a, vec2 b) { return vec2(dot(a, b), a.y * b.x - a.x * b.y) / max(1e-6, dot(b, b)); }

// Hyperbolic Möbius translation in the unit disk: w = (z - a) / (1 - conj(a)*z)
vec2 mobiusTranslate(vec2 z, vec2 a) {
    vec2 num = z - a;
    vec2 den = vec2(1.0, 0.0) - vec2(a.x * z.x + a.y * z.y, a.x * z.y - a.y * z.x);
    return cDiv(num, den);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nSym = (symmetryP > 1.0) ? symmetryP : 7.0;
    float sc = (tileScaleP > 0.01) ? tileScaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Scale disk
    vec2 z = uv * (1.8 * sc);
    float rDisk = length(z);

    // Hyperbolic translation offset in unit disk
    float aTrans = t * 0.3 + audioPhase * 0.1;
    float rTrans = 0.45 * sin(t * 0.4 + audioSwell * 2.0);
    vec2 aParam = vec2(cos(aTrans), sin(aTrans)) * rTrans;

    // Apply Möbius transform
    z = mobiusTranslate(z, aParam);

    // Heptagonal / 7-Fold radial symmetry fold
    float a = atan(z.y, z.x);
    float r = length(z);
    float seg = 6.2831853 / nSym;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    vec2 pFold = vec2(cos(a), sin(a)) * r;

    // Hyperbolic geodesic circular arc distance
    // In Poincaré disk, geodesics are circles orthogonal to the boundary
    float rArc = 0.52;
    vec2 cArc = vec2(0.85, 0.0);
    float dArc = abs(length(pFold - cArc) - rArc);

    // Glowing hyperbolic tile borders
    float borderGlow = exp(-dArc * (25.0 + 12.0 * audioCentroid)) * glw;

    // Sample distorted background photo
    vec2 sampleUV = fract(pFold * 0.5 + 0.5);
    vec3 texCol = img(sampleUV);

    // Non-Euclidean spectrum palette
    vec3 palA = imgPalette(r * 0.8 + t * 0.05);
    vec3 palB = imgPalette(r * 0.8 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(a * nSym));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing hyperbolic arcs & kick flash
    vec3 arcTint = vec3(1.4, 1.1, 1.8) * borderGlow * (1.0 + 2.5 * audioKick);
    col += arcTint;

    // Boundary infinity glow: a thin halo AT the unit disk's edge. The
    // previous smoothstep(0.7,1.0,rDisk) saturates to its max for any pixel
    // past rDisk~1.0 -- and since rDisk = length(uv*1.8*sc) exceeds 1.0
    // across most of the frame (uv already reaches past +-1 along the
    // screen's longer axis), that flooded nearly the whole image with a
    // flat, overexposed tint instead of ringing just the disk's rim.
    float rimGlow = exp(-abs(rDisk - 1.0) * 8.0) * (0.4 + 0.5 * audioKick);
    col += imgPalette(0.85) * rimGlow;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

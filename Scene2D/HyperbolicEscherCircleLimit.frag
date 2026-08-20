#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicEscherCircleLimit.frag
 * @brief HYPERBOLIC ESCHER CIRCLE LIMIT: Conformal Poincaré disk tessellation
 * with infinite tile density toward the boundary and dynamic Möbius inversions.
 * Fills the screen with breathing non-Euclidean hyperbolic symmetries.
 *
 * Audio Reactivity:
 *   audioAdvance -> continuous rotation & hyperbolic space translation
 *   audioKick    -> inward/outward inversion shockwave
 *   audioSubBass -> pulses the hyperbolic curvature & boundary breathing
 *   audioCentroid-> modulates tile complexity & spectral edge highlights
 *   audioChromaHue-> rotates the generative and texture-driven palette
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
uniform float pSidesP; // e.g. 5, 7 or 8-fold hyperbolic symmetry
uniform float curveP;
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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Complex arithmetic helpers
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cDiv(vec2 a, vec2 b) { return vec2(dot(a, b), a.y * b.x - a.x * b.y) / dot(b, b); }
vec2 cInv(vec2 z) { return vec2(z.x, -z.y) / dot(z, z); }

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float crv = (curveP > 0.01) ? curveP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float sides = (pSidesP > 1.0) ? pSidesP : 7.0;

    // Hyperbolic space drift & translation
    float t = audioAdvance * 0.3 * spd;
    float rotAngle = t * 0.15 + audioPhase * 0.1;
    float cs = cos(rotAngle), sn = sin(rotAngle);
    vec2 z = mat2(cs, -sn, sn, cs) * uv * (1.45 + 0.15 * sin(audioSwell * 2.0));

    // Möbius translation: z -> (z - a) / (1 - conj(a)*z)
    vec2 aMob = 0.45 * vec2(sin(t * 0.4), cos(t * 0.31)) * (0.8 + 0.4 * audioSubBass);
    z = cDiv(z - aMob, vec2(1.0, 0.0) - cMul(vec2(aMob.x, -aMob.y), z));

    // Fullscreen seamless tiling via repeated circle inversions
    float foldCount = 0.0;
    float minEdgeDist = 1e5;
    float segAngle = 3.14159265 / sides;

    for (int i = 0; i < 9; i++) {
        // Fold across radial mirror planes
        float ang = atan(z.y, z.x);
        float r = length(z);
        ang = mod(ang + segAngle, 2.0 * segAngle) - segAngle;
        ang = abs(ang);
        z = vec2(cos(ang), sin(ang)) * r;

        // Hyperbolic circle mirror inversion (circle centered at (xc, 0) with radius rc)
        float xc = cos(segAngle) / sin(segAngle); // characteristic circle center
        float rc = sqrt(max(0.01, xc * xc - 1.0)) * crv;
        vec2 center = vec2(xc, 0.0);
        vec2 diff = z - center;
        float d2 = dot(diff, diff);

        if (d2 < rc * rc) {
            z = center + diff * (rc * rc / max(0.0001, d2));
            foldCount += 1.0;
        }

        minEdgeDist = min(minEdgeDist, abs(length(diff) - rc));
        minEdgeDist = min(minEdgeDist, abs(z.y));
    }

    // Dynamic texture lookup mapped on the folded hyperbolic domain
    vec2 sampleUV = fract(z * 0.5 + 0.5);
    vec3 texSample = img(sampleUV);

    // Color generation based on iteration depth and edge glow
    float pattern = sin(z.x * 12.0 + t) * cos(z.y * 12.0 - t);
    float glow = exp(-minEdgeDist * (35.0 + 15.0 * audioCentroid)) * glw * (1.0 + 2.0 * audioKick);

    vec3 colA = imgPalette(foldCount * 0.12 + pattern * 0.08);
    vec3 colB = imgPalette(foldCount * 0.12 + 0.5);
    vec3 col = mix(colA, colB, 0.5 + 0.5 * pattern);

    col += vec3(1.2, 0.9, 1.5) * glow;
    col = mix(col, texSample, 0.35 + 0.15 * audioValence);

    // Chromatic aberration at high energy
    float ca = 0.015 * (audioKick + audioFlux);
    vec3 colR = imgPalette(foldCount * 0.12 + ca);
    vec3 colB2 = imgPalette(foldCount * 0.12 - ca);
    col.r = mix(col.r, colR.r, 0.4);
    col.b = mix(col.b, colB2.b, 0.4);

    // Edge vignette & tone mapping
    float vig = 1.0 - smoothstep(0.8, 1.4, length(uv));
    col *= vig;
    col = pow(col, vec3(0.85));

    fragColor = vec4(col, 1.0);
}

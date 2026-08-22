#version 330 core
out vec4 fragColor;
/**
 * @file KleinQuarticHyperbolicCurve.frag
 * @brief KLEIN QUARTIC HYPERBOLIC CURVE: Riemann surface of genus 3 with maximal
 * symmetry (168 automorphisms, PSL(2,7)). Tiled by 24 regular heptagons in
 * the hyperbolic Poincaré disk with conformal circle inversions, sacred
 * geometry kaleidoscopic rosettes, and multi-angle photo reflections.
 *   audioAdvance -> translates hyperbolic isometry group PSL(2,7)
 *   audioKick    -> flashes 168 automorphism reflection lines & facet edges
 *   audioBass    -> undulates Poincaré metric curvature & heptagon inflation
 *   audioChromaHue-> shifts hyperbolic rosette color spectrum
 *
 * Per-activation variety:
 *   genusP    float hyperbolic Poincaré curvature scale    (0.5..2.2)
 *   heptagonP float {7,3} heptagonal symmetry fold depth    (0.5..2.0)
 *   speedP    float hyperbolic rotation velocity            (0.5..2.0)
 *   hueP      float sacred geometry chromatic hue offset    (0..6.28)
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

uniform float genusP;
uniform float heptagonP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
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

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float gns = (genusP    > 0.0) ? genusP    : 1.0;
    float hpt = (heptagonP > 0.0) ? heptagonP : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Poincaré disk coordinate normalization
    vec2 z = uv * (2.8 / gns) * (1.0 - 0.15 * audioKick);
    z = rot2D(t * 0.25) * z;

    float edgeDist = 1.0;
    float reflections = 0.0;

    // 7-fold hyperbolic Coxeter reflection lines
    float angle7 = 6.2831853 / 7.0;

    for (int iter = 0; iter < 5; ++iter) {
        // 7-fold angular folding
        float a = atan(z.y, z.x);
        float r = length(z);
        a = mod(a, angle7) - angle7 * 0.5;
        z = vec2(cos(a), sin(a)) * r;

        // Hyperbolic circle inversion centered on geodesic boundary
        vec2 circleCenter = vec2(1.2 * hpt, 0.0);
        float circleRadius = 0.65;
        vec2 diff = z - circleCenter;
        float d2 = dot(diff, diff);

        if (d2 < circleRadius * circleRadius) {
            z = circleCenter + diff * (circleRadius * circleRadius / max(d2, 1e-4));
            reflections += 1.0;
        }

        // Boundary sphere inversion
        float r2 = dot(z, z);
        if (r2 > 1.0) {
            z /= r2;
            reflections += 1.0;
        }

        edgeDist = min(edgeDist, abs(sin(a * 7.0)));
    }

    // Photo texture mapping into folded Klein heptagonal domains
    vec2 photoUV = fract(z * 0.5 + 0.5);
    vec3 photo = img(photoUV);

    // PSL(2,7) symmetry group color palette
    vec3 groupColor = imgPalette((reflections * 0.5 + audioPhase) * 0.159);

    // Glowing automorphism reflection lines
    // Kick 3.0 + high 1.5 turned crescendos into one full-frame flash
    // (the largest single-frame luma jump in the whole catalogue's scan).
    float lineGlow = exp(-edgeDist * 25.0) * (1.0 + min(audioKick * 1.1 + audioHigh * 0.5, 1.4));

    // Combine visualizer
    vec3 col = mix(photo * 0.85, groupColor, 0.45 + 0.2 * audioSwell);
    col += lineGlow * vec3(1.0, 0.9, 0.4) * 1.5;

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Poincaré disk boundary vignette
    float diskR = length(uv);
    float diskVig = smoothstep(1.35, 0.3, diskR);
    col *= diskVig;

    fragColor = vec4(col, 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file CalabiYauManifold.frag
 * @brief CALABI-YAU MANIFOLD: 3D raymarched projection of a 6-dimensional Calabi-Yau
 * Kähler manifold (quintic threefold z1^5 + z2^5 + z3^5 + z4^5 + z5^5 = 0)
 * with audio-reactive topological genus morphing and iridescent metallic highlights.
 *   audioPhase   -> rotates 6D slicing angle into 3D Euclidean space
 *   audioKick    -> flashes Ricci-flat curvature metric energy pulses
 *   audioCentroid-> morphs complex moduli parameters
 *   audioSwell   -> expands manifold genus chambers
 *
 * Per-activation variety:
 *   genusP   float topological complexity parameter        (0.5..2.0)
 *   zoomP    float camera viewing distance                 (0.5..1.8)
 *   glowP    float manifold internal glow intensity        (0.5..2.2)
 *   hueP     float color spectrum phase offset             (0..6.28)
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

uniform float genusP;
uniform float zoomP;
uniform float glowP;
uniform float hueP;


uniform float audioChromaHue;

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

// 6D Calabi-Yau cross-section distance function
float mapCalabiYau(vec3 p, float gen, out float genusField) {
    float t = time * 0.3 + audioAdvance * 0.2;

    // Complex coordinates z1, z2, z3
    float r = length(p);
    float theta = atan(p.y, p.x);
    float phi = acos(clamp(p.z / max(r, 0.001), -1.0, 1.0));

    // Quintic threefold 6D hypersurface harmonics
    float n = 5.0 * gen;
    float harmonic1 = cos(n * theta) * sin(n * phi + t);
    float harmonic2 = sin(3.0 * theta - t * 1.5) * cos(4.0 * phi);
    float harmonic3 = cos(theta * 2.0 + phi * 3.0 + audioPhase);

    genusField = harmonic1 * 0.5 + harmonic2 * 0.3 + harmonic3 * 0.2;

    float surface = abs(r - (1.4 + 0.35 * genusField * (0.8 + 0.4 * audioSwell))) - 0.03;
    return surface * 0.6;
}

void main() {
    float gen = (genusP > 0.0) ? genusP : 1.0;
    float zm  = (zoomP  > 0.0) ? zoomP  : 1.0;
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.25 + audioAdvance * 0.15;
    vec3 ro = vec3(sin(t) * 3.0, 1.2 * cos(t * 0.7), cos(t) * 3.0) / zm;
    vec3 ta = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.4 - 0.3 * audioKick) * ww);

    float totalDist = 0.0;
    float gField = 0.0;
    float glow = 0.0;
    bool hit = false;

    for (int i = 0; i < 72; ++i) {
        vec3 p = ro + rd * totalDist;
        float d = mapCalabiYau(p, gen, gField);

        glow += exp(-max(d, 0.0) * 16.0) * (0.018 * glw);

        if (d < 0.002) {
            hit = true;
            break;
        }
        if (totalDist > 8.0) break;
        totalDist += max(d * 0.6, 0.005);
    }

    vec3 col = vec3(0.01, 0.02, 0.05);

    if (hit) {
        vec3 p = ro + rd * totalDist;

        // Surface normal
        float dummyG;
        float eps = 0.003;
        vec3 n = normalize(vec3(
            mapCalabiYau(p + vec3(eps, 0.0, 0.0), gen, dummyG) - mapCalabiYau(p - vec3(eps, 0.0, 0.0), gen, dummyG),
            mapCalabiYau(p + vec3(0.0, eps, 0.0), gen, dummyG) - mapCalabiYau(p - vec3(0.0, eps, 0.0), gen, dummyG),
            mapCalabiYau(p + vec3(0.0, 0.0, eps), gen, dummyG) - mapCalabiYau(p - vec3(0.0, 0.0, eps), gen, dummyG)
        ));

        // Ricci-flat specular iridescence
        vec3 light = normalize(vec3(0.8, 1.0, -0.6));
        float diff = max(dot(n, light), 0.0);
        float spec = pow(max(dot(reflect(rd, n), light), 0.0), 32.0);

        // Photo texture mapped to manifold coordinates
        vec2 photoUV = fract(vec2(atan(p.y, p.x), p.z) * 0.5 + 0.5);
        vec3 photo = img(photoUV);

        vec3 manifoldColor = imgPalette((gField * 8.0 + audioCentroid * 3.0) * 0.159);
        col = mix(manifoldColor, photo, 0.35) * (diff * 0.8 + 0.2);
        col += vec3(1.0, 0.95, 0.8) * spec * (1.5 + audioKick * 3.0);
    }

    // Add internal energy glow
    vec3 glowCol = imgPalette(0.45 + 0.20 * sin(time * 2.0));
    col += glowCol * glow * (1.0 + audioKick * 2.5);

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

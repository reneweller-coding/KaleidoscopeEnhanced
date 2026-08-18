#version 330 core
out vec4 fragColor;
/**
 * @file MandelboxHyperCubeMetamaterial.frag
 * @brief MANDELBOX HYPERCUBE METAMATERIAL: Raymarched 3D Mandelbox fractal
 * generating infinite metallic cyber-architectural megastructures.
 * Recursive box folds, sphere folds, scale inversions, neon edge lighting,
 * and continuous multi-planar photo texture reflections.
 *   audioAdvance -> navigates camera through Mandelbox corridors
 *   audioKick    -> flashes neon edge channels and metallic specular reflections
 *   audioBass    -> pulses Mandelbox scale factor & box folding boundaries
 *   audioChromaHue-> shifts cybernetic architectural color grading
 *
 * Per-activation variety:
 *   scaleP float Mandelbox scale factor (1.5..3.0)
 *   foldP  float box folding limit threshold (0.5..2.0)
 *   speedP float camera traversal velocity   (0.5..2.0)
 *   hueP   float neon palette hue offset     (0..6.28)
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

uniform float scaleP;
uniform float foldP;
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

// 3D Mandelbox Distance Estimator
float mandelboxSDF(vec3 p, float scl, float fld, out float trap) {
    vec3 offset = p;
    float dr = 1.0;
    float rMin2 = 0.25;
    float rMax2 = 1.0;
    trap = 1e5;

    for (int i = 0; i < 7; ++i) {
        // Box fold: clamp(p, -limit, limit) * 2 - p
        p = clamp(p, -fld, fld) * 2.0 - p;

        // Sphere fold
        float r2 = dot(p, p);
        trap = min(trap, abs(p.x * p.y));

        if (r2 < rMin2) {
            float factor = (rMax2 / rMin2);
            p *= factor;
            dr *= factor;
        } else if (r2 < rMax2) {
            float factor = (rMax2 / r2);
            p *= factor;
            dr *= factor;
        }

        p = p * scl + offset;
        dr = dr * abs(scl) + 1.0;
    }

    return length(p) / abs(dr);
}

void main() {
    float scl = (scaleP > 0.0) ? scaleP : 2.0;
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Camera setup
    // USER-FEEDBACK: the old fly-through sat INSIDE the solid core (flat
    // brown wall).  Orbit outside, looking at the metamaterial lattice.
    vec3 ro = vec3(sin(t * 0.3) * 7.5, 2.6 * sin(t * 0.21), cos(t * 0.3) * 7.5);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.25 - 0.08 * audioKick) * ww);

    float dO = 0.0;
    float hitDist = -1.0;
    float trapMin = 1e5;
    vec3 hitP;

    for (int i = 0; i < 48; ++i) {
        vec3 p = ro + rd * dO;
        float curTrap;
        float dS = mandelboxSDF(p, scl, fld, curTrap);
        trapMin = min(trapMin, curTrap);

        if (dS < 0.003) {
            hitDist = dO;
            hitP = p;
            break;
        }
        if (dO > 22.0) break;
        dO += dS * 0.65;
    }

    // Orbit-trap aura for miss rays: the box's energy field fills the frame
    // instead of near-black (metric scan: luma 8, saturation 0 -- most rays
    // miss the thin metamaterial lattice).
    vec3 col = vec3(0.02, 0.03, 0.06);
    vec3 aura = imgPalette((trapMin * 7.0 + audioPhase) * 0.159 + 0.05)
                * exp(-trapMin * 1.8) * (0.5 + 0.5 * audioLevel);
    col += aura * 0.8;

    if (hitDist > 0.0) {
        vec2 e = vec2(0.005, 0.0);
        float tU;
        vec3 n = normalize(vec3(
            mandelboxSDF(hitP + e.xyy, scl, fld, tU) - mandelboxSDF(hitP - e.xyy, scl, fld, tU),
            mandelboxSDF(hitP + e.yxy, scl, fld, tU) - mandelboxSDF(hitP - e.yxy, scl, fld, tU),
            mandelboxSDF(hitP + e.yyx, scl, fld, tU) - mandelboxSDF(hitP - e.yyx, scl, fld, tU)
        ));

        vec3 lightDir = normalize(vec3(0.5, 0.9, -0.6));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

        // Photo mapping from normal and world coords
        vec2 photoUV = fract(vec2(dot(hitP.xy, n.yx) * 0.1, hitP.z * 0.1));
        vec3 photo = img(photoUV);

        // Cyberpunk neon architecture palette
        vec3 cyber = imgPalette((trapMin * 10.0 + audioPhase) * 0.159);

        col = mix(photo * 0.85, cyber, 0.45);
        col = col * (0.35 + 0.65 * diff) + spec * vec3(1.0, 0.95, 0.85);

        // Neon edge line glow
        float edge = smoothstep(0.05, 0.01, abs(dot(n, normalize(hitP))));
        col += edge * vec3(0.1, 0.9, 1.0) * (1.2 + audioKick * 2.5);

        // Distance fog
        col = mix(col, vec3(0.02, 0.03, 0.07), 1.0 - exp(-hitDist * 0.15));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

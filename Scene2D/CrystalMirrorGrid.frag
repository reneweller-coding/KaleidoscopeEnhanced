#version 330 core
out vec4 fragColor;
/**
 * @file CrystalMirrorGrid.frag
 * @brief CRYSTAL MIRROR GRID: Raymarched 3D crystal mirror lattice filling 100% of
 * the screen. Every facet refracts and reflects the live photo/kaleidoscope.
 *   audioKick    -> shatter impulse bursting crystal facets towards the camera lens
 *   audioMid     -> lattice rotation & folding wave
 *   audioBass    -> facet extrusion depth & pulse
 *   audioChroma  -> spectral dispersion on crystal edges
 *
 * Per-activation variety (0 = default):
 *   facetP   float facet density multiplier   (0 -> 1.0; 0.6..1.8)
 *   shatterP float shatter impulse strength   (0 -> 1.0; 0.5..2.0)
 *   refractP float refraction dispersion mul  (0 -> 1.0; 0.5..1.5)
 *   hueP     float global hue rotation        (0 -> none; 0..6.28)
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

uniform float facetP;
uniform float shatterP;
uniform float refractP;
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

float hash3D(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

// Signed Distance Field for Crystal Lattice Box with Facet Beveling
float mapLattice(vec3 p, float fDensity, float shatter) {
    vec3 gridPos = floor(p * fDensity);
    vec3 localPos = fract(p * fDensity) - 0.5;

    // Shatter offset per crystal cell
    float cellHash = hash3D(gridPos);
    float kickDisp = sin(cellHash * 6.28 + time * 4.0) * shatter * audioKick;
    localPos += vec3(sin(cellHash * 3.14), cos(cellHash * 1.5), sin(cellHash * 9.2)) * kickDisp * 0.4;

    // Box SDF with bevelled crystal facets
    vec3 d = abs(localPos) - vec3(0.38 + 0.08 * sin(time + cellHash * 10.0));
    float boxSDF = length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);

    // Bevel cut
    float planeBevel = dot(localPos, normalize(vec3(1.0))) - (0.42 + 0.05 * audioBass);
    return max(boxSDF, planeBevel) / fDensity;
}

vec3 calcNormal(vec3 p, float fDensity, float shatter) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(
        mapLattice(p + e.xyy, fDensity, shatter) - mapLattice(p - e.xyy, fDensity, shatter),
        mapLattice(p + e.yxy, fDensity, shatter) - mapLattice(p - e.yxy, fDensity, shatter),
        mapLattice(p + e.yyx, fDensity, shatter) - mapLattice(p - e.yyx, fDensity, shatter)
    ));
}

void main() {
    float fDens = (facetP   > 0.0) ? facetP   : 1.0;
    float shat  = (shatterP > 0.0) ? shatterP : 1.0;
    float refr  = (refractP > 0.0) ? refractP : 1.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Camera setup
    vec3 ro = vec3(0.0, 0.0, -3.0);
    vec3 rd = normalize(vec3(uv, 1.2));

    // Dynamic rotation matrices driven by time and audio
    float rotX = time * 0.2 + audioAdvance * 0.15;
    float rotY = time * 0.25 + audioMid * 0.5;
    mat2 rx = mat2(cos(rotX), sin(rotX), -sin(rotX), cos(rotX));
    mat2 ry = mat2(cos(rotY), sin(rotY), -sin(rotY), cos(rotY));

    ro.yz = rx * ro.yz; rd.yz = rx * rd.yz;
    ro.xz = ry * ro.xz; rd.xz = ry * rd.xz;

    // Raymarching distance loop
    float t = 0.0;
    float hitDist = -1.0;
    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * t;
        float d = mapLattice(p, 2.0 * fDens, shat);
        if (d < 0.003) {
            hitDist = t;
            break;
        }
        t += d * 0.7;
        if (t > 7.0) break;
    }

    vec3 finalCol = vec3(0.0);

    if (hitDist > 0.0) {
        vec3 p = ro + rd * hitDist;
        vec3 N = calcNormal(p, 2.0 * fDens, shat);
        vec3 R = reflect(rd, N);

        // Map reflection ray to source image UV
        vec2 reflUV = vec2(atan(R.z, R.x) / 6.283185 + 0.5, R.y * 0.5 + 0.5);
        vec3 reflCol = img(fract(reflUV));

        // Refraction dispersion (RGB split on crystal edges)
        vec3 refrR = refract(rd, N, 0.75 * refr);
        vec3 refrG = refract(rd, N, 0.72 * refr);
        vec3 refrB = refract(rd, N, 0.69 * refr);

        vec3 refrCol;
        refrCol.r = img(fract(reflUV + refrR.xy * 0.1)).r;
        refrCol.g = img(fract(reflUV + refrG.xy * 0.1)).g;
        refrCol.b = img(fract(reflUV + refrB.xy * 0.1)).b;

        // Fresnel term for glass/crystal specular highlight
        float fresnel = pow(1.0 - max(dot(-rd, N), 0.0), 3.0);
        finalCol = mix(refrCol, reflCol, fresnel * 0.8 + 0.2);

        // Specular spark on kick drum
        vec3 lightDir = normalize(vec3(0.5, 1.0, -1.0));
        float spec = pow(max(dot(R, lightDir), 0.0), 16.0);
        finalCol += vec3(1.0, 0.9, 0.7) * spec * (1.0 + audioKick * 2.0);

        // Edge glow
        float edge = 1.0 - max(dot(-rd, N), 0.0);
        finalCol += imgPalette(0.30 * audioCentroid) * 1.5 * pow(edge, 4.0) * audioHigh;
    } else {
        // Background fallback projection
        finalCol = img(fract(uv * 0.5 + 0.5)) * 0.4;
    }

    if (hueP > 0.0) {
        finalCol = hueRot(finalCol, hueP);
    }

    fragColor = vec4(finalCol, 1.0);
}

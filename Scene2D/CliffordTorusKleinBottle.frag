#version 330 core
out vec4 fragColor;
/**
 * @file CliffordTorusKleinBottle.frag
 * @brief CLIFFORD TORUS KLEIN BOTTLE: 4D non-orientable Klein bottle and flat Clifford
 * torus rotating in 4D space with glass refraction, internal self-intersection,
 * chromatic dispersion, and live photo distortion.
 *   audioAdvance -> drives continuous 4D isometric rotation
 *   audioKick    -> flashes glass refraction shockwaves and caustic sparkles
 *   audioBass    -> pulses figure-8 Klein bottle tube thickness
 *   audioSwell   -> increases chromatic aberration dispersion
 *
 * Per-activation variety:
 *   radiusP  float torus major/minor radius ratio          (0.5..1.8)
 *   glassP   float glass transparency & refraction index   (0.5..2.0)
 *   rotSpdP  float 4D plane rotation speed                 (0.5..2.2)
 *   hueP     float dispersion hue offset                   (0..6.28)
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

uniform float radiusP;
uniform float glassP;
uniform float rotSpdP;
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

// 4D Klein bottle distance function (Figure-8 immersion)
float mapKlein(vec3 p, float rad, out float uParam, out float vParam) {
    float t4D = time * 0.35 + audioAdvance * 0.2;

    // Toroidal coordinate transformation
    float r = length(p.xy);
    float u = atan(p.y, p.x); // Toroidal angle 0..2pi
    float v = atan(p.z, r - 1.8 * rad); // Poloidal angle

    uParam = u;
    vParam = v;

    // Figure-8 Klein bottle cross-section
    float rTorus = 1.8 * rad;
    float tubeR = 0.55 * (0.8 + 0.3 * audioBass);

    // Twisted figure-8 shape
    float crossDist = length(vec2(r - rTorus, p.z)) - tubeR * (1.0 + 0.35 * sin(u * 0.5 + t4D));
    return crossDist * 0.7;
}

void main() {
    float rad = (radiusP > 0.0) ? radiusP : 1.0;
    float gls = (glassP  > 0.0) ? glassP  : 1.0;
    float rot = (rotSpdP > 0.0) ? rotSpdP : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * rot + audioAdvance * 0.15;
    vec3 ro = vec3(sin(t) * 3.5, 1.5 * cos(t * 0.6), cos(t) * 3.5);
    vec3 ta = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.4 - 0.3 * audioKick) * ww);

    float totalDist = 0.0;
    float uP = 0.0, vP = 0.0;
    float glow = 0.0;
    bool hit = false;

    for (int i = 0; i < 64; ++i) {
        vec3 p = ro + rd * totalDist;
        float d = mapKlein(p, rad, uP, vP);

        glow += exp(-max(d, 0.0) * 14.0) * (0.015 * gls);

        if (d < 0.002) {
            hit = true;
            break;
        }
        if (totalDist > 8.0) break;
        totalDist += max(d * 0.65, 0.006);
    }

    vec3 col = vec3(0.01, 0.02, 0.04);

    if (hit) {
        vec3 p = ro + rd * totalDist;

        // Normal
        float du, dv;
        float eps = 0.003;
        vec3 n = normalize(vec3(
            mapKlein(p + vec3(eps, 0.0, 0.0), rad, du, dv) - mapKlein(p - vec3(eps, 0.0, 0.0), rad, du, dv),
            mapKlein(p + vec3(0.0, eps, 0.0), rad, du, dv) - mapKlein(p - vec3(0.0, eps, 0.0), rad, du, dv),
            mapKlein(p + vec3(0.0, 0.0, eps), rad, du, dv) - mapKlein(p - vec3(0.0, 0.0, eps), rad, du, dv)
        ));

        // Glass Fresnel reflection & refraction
        float fresnel = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
        vec3 refDir = reflect(rd, n);
        vec3 refrDir = refract(rd, n, 0.85);

        // Refracted photo texture with chromatic dispersion
        vec2 refrUV = st + refrDir.xy * 0.15 * (1.0 + audioSwell);
        vec3 refrPhoto;
        refrPhoto.r = img(refrUV + vec2(0.008, 0.0)).r;
        refrPhoto.g = img(refrUV).g;
        refrPhoto.b = img(refrUV - vec2(0.008, 0.0)).b;

        // Klein bottle non-orientable rainbow gradient
        vec3 kleinRainbow = imgPalette((uP + vP * 2.0 + audioPhase) * 0.159);

        col = mix(refrPhoto, kleinRainbow, 0.35);
        col += vec3(1.0, 0.95, 0.8) * fresnel * (1.2 + audioKick * 2.5);
    } else {
        // Background photo
        col = img(st) * 0.3;
    }

    // Add glowing glass edges
    vec3 glowCol = imgPalette(0.5 + 0.2 * sin(time * 2.5));
    col += glowCol * glow * (1.0 + audioKick * 3.0);

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file SolarFlareSurfing.frag
 * @brief SOLAR FLARE SURFING: Extreme close-up flight over the turbulent
 * surface of a star. Massive solar flares and plasma prominences loop
 * overhead, reacting violently to the beat.
 *   audioAdvance -> flight speed over the stellar surface
 *   audioKick    -> explosive solar flares erupting upwards
 *   audioSwell   -> brightness and height of the plasma waves
 *   audioChromaHue-> palette offset for the star's color
 *
 * Per-activation variety:
 *   waveP float intensity of the surface plasma waves (0.5..2.0)
 *   flareP float frequency of solar flares (0.5..2.0)
 *   hueP float palette offset (0..6.28)
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
uniform float audioChromaHue;

uniform float waveP;
uniform float flareP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

// Map function for the stellar surface and flares
// Soft-max, used to carve a smooth clearance bubble around the camera out
// of the distance field: the flight can never clip through geometry -- a
// would-be collision becomes a soft bulge sliding past the lens.
float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(a, b, h) + k * h * (1.0 - h);
}

float map(vec3 p, float wp, float fp) {
    // Base surface (turbulent plasma)
    float d = p.y + 2.0;
    // was * 1.5 * wp * (1 + audioSwell): the product reached ~4.5 and the
    // plasma sea swallowed the camera on every swell -- audio now ADDS a
    // bounded term instead of multiplying the whole amplitude.
    d -= fbm(p * 0.5 - vec3(0.0, 0.0, time * 2.0)) * (1.15 * wp + 0.8 * audioSwell);

    // Solar flares (arcing tubes of plasma)
    vec3 q = p;
    q.z = mod(q.z, 20.0) - 10.0;
    q.x = mod(q.x, 20.0) - 10.0;

    // Arch shape
    float arch = length(vec2(length(q.xz) - 5.0, p.y - 2.0)) - 0.5;
    arch -= fbm(p * 2.0 + vec3(time * 5.0)) * 0.5; // noisy flare

    // Only show arches based on hash and flareP
    float id = hash11(floor(p.z / 20.0) * 11.3 + floor(p.x / 20.0) * 17.7);
    if (id < 0.3 * fp) {
        d = min(d, arch);
    }

    return d;
}

vec3 calcNormal(vec3 p, float wp, float fp) {
    vec2 e = vec2(0.05, 0.0);
    return normalize(vec3(
        map(p + e.xyy, wp, fp) - map(p - e.xyy, wp, fp),
        map(p + e.yxy, wp, fp) - map(p - e.yxy, wp, fp),
        map(p + e.yyx, wp, fp) - map(p - e.yyx, wp, fp)
    ));
}

void main()
{
    float wp = (waveP > 0.01 ? waveP : 1.0);
    float fp = (flareP > 0.01 ? flareP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 8.0 + audioAdvance * 25.0;

    vec3 ro = vec3(0.0, 2.6 + 0.4 * sin(time * 0.5), drift);
    vec3 ta = ro + vec3(0.0, -0.2, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.1 * sin(time * 0.3);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.5 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;

    // Primary raymarch for surface
    for (int i = 0; i < 70; ++i) {
        p = ro + rd * d;
        float ds = map(p, wp, fp);
        ds = smax(ds, 0.55 - length(p - ro), 0.20);   // camera clearance bubble (arch fly-throughs become soft passes)
        if (ds < 0.01 * (1.0 + d * 0.05)) {
            m = 1.0;
            break;
        }
        d += ds * 0.7;
        if (d > 100.0) break;
    }

    vec3 colorBase = imgPalette(0.1 + audioCentroid * 0.2); // deep red/orange
    vec3 colorHot = imgPalette(0.8 + audioKick * 0.1);      // bright yellow/white

    vec3 col = vec3(0.0);

    if (m > 0.5) {
        vec3 n = calcNormal(p, wp, fp);

        // Heat map based on height and normal
        float heat = smoothstep(-2.0, 3.0, p.y) + (1.0 - max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0));
        heat += fbm(p * 1.0) * 0.5;

        col = mix(colorBase, colorHot, clamp(heat, 0.0, 1.0));

        // Brighten peaks and flares
        col *= 1.0 + max(p.y, 0.0) * 0.5;

        // Audio kick explosion on the surface
        float flash = step(0.9, hash11(floor(p.x * 2.0) + floor(p.z * 2.0) + floor(time * 5.0)));
        col += colorHot * flash * audioKick * 3.0;
    }

    // Volumetric corona (glow above surface)
    float corona = 0.0;
    vec3 cp = ro;
    float stepSize = 100.0 / 30.0;
    for(int i = 0; i < 30; i++) {
        if (cp.y > -2.0) {
            float dens = exp(-max(cp.y + 2.0, 0.0) * 0.3) * (0.5 + audioSwell * 0.5);
            // Turbulent corona
            dens *= 0.5 + 0.5 * fbm(cp * 0.2 - vec3(time * 2.0));
            corona += dens * stepSize * 0.05;
        }
        cp += rd * stepSize;
    }
    col += mix(colorBase, colorHot, 0.5) * corona;

    // Fade to dark space/deep corona far away
    col = mix(col, colorBase * 0.1, exp(-d * 0.02));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file EarthriseLunar.frag
 * @brief EARTHRISE LUNAR: the Apollo 8 view -- the grey, cratered horizon
 * of the Moon in the foreground, harsh sunlight from the side throwing
 * long black crater shadows, and above it, in the black sky, the Earth
 * half lit: blue oceans, brown-green land, swirling white cloud bands, the
 * thin blue rim of its atmosphere, the night side dark.  The Earth rises
 * with the slowness of an orbit and turns; the Moon's surface slides past
 * beneath, as it did from the command module window.  The music is the
 * light: the glow of the atmosphere and the glint of the oceans.
 *
 * Audio Reactivity:
 *   audioSwell  -> the atmosphere's glow (slow)
 *   audioHigh   -> the sun's glint on the oceans (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> Earth rising and turning, the Moon passing
 *
 * Per-activation variety: phaseP (how much of the Earth is lit), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float phaseP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    vec2 uv = (i.xy + vec2(37.0, 17.0) * i.z) + f.xy;
    float a = hash21(floor(uv) + vec2(0.0, 0.0)), b = hash21(floor(uv) + vec2(1.0, 0.0));
    float c = hash21(floor(uv) + vec2(0.0, 1.0)), d = hash21(floor(uv) + vec2(1.0, 1.0));
    float z0 = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    vec2 uv2 = uv + vec2(37.0, 17.0);
    float a2 = hash21(floor(uv2)), b2 = hash21(floor(uv2) + vec2(1.0, 0.0));
    float c2 = hash21(floor(uv2) + vec2(0.0, 1.0)), d2 = hash21(floor(uv2) + vec2(1.0, 1.0));
    float z1 = mix(mix(a2, b2, f.x), mix(c2, d2, f.x), f.y);
    return mix(z0, z1, f.z);
}
float fbm3(vec3 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise3(p); p = p * 2.03 + 1.7; a *= 0.5; }
    return v;
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    vec3 sunDir = normalize(vec3(-1.0, 0.15, 0.35 + 0.5 * clamp(phaseP, 0.0, 1.0)));

    // Space: black with very faint stars (the exposure is set for the Moon).
    vec3 col = vec3(0.0);
    {
        vec2 g = p * 90.0, gi = floor(g), gf = fract(g);
        vec2 c = 0.25 + 0.5 * hash22(gi);
        col += vec3(0.8) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.993, hash21(gi + 3.0)) * 0.4;
    }

    // The Earth: rises slowly (bounded, it settles above the horizon).
    float rise = smoothstep(0.0, 1.0, clamp(T / 90.0, 0.0, 1.0));
    vec2 ec = vec2(0.12, -0.02 + 0.12 * rise);
    float R = 0.17;
    vec2 d = (p - ec) / R;
    float r2 = dot(d, d);
    if (r2 < 1.0) {
        vec3 n = vec3(d, sqrt(1.0 - r2));
        // Rotate the globe slowly about a tilted axis.
        float a = T * 0.01;
        vec3 q = vec3(n.x * cos(a) + n.z * sin(a), n.y, -n.x * sin(a) + n.z * cos(a));
        float land = smoothstep(0.52, 0.56, fbm3(q * 2.2 + 3.0));
        float lat = abs(q.y);
        vec3 ocean = vec3(0.03, 0.12, 0.38);
        vec3 ground = mix(vec3(0.35, 0.3, 0.18), vec3(0.2, 0.32, 0.14), fbm3(q * 8.0));
        ground = mix(ground, vec3(0.9, 0.92, 0.95), smoothstep(0.75, 0.85, lat));      // ice caps
        vec3 surf = mix(ocean, ground, land);
        // Clouds: swirling bands.
        vec3 cq = q * 3.0 + vec3(T * 0.004, 0.0, 0.0);
        float cloud = smoothstep(0.5, 0.75, fbm3(cq + 2.0 * vec3(fbm3(cq * 0.7), fbm3(cq * 0.7 + 5.0), 0.0)));
        surf = mix(surf, vec3(0.95), cloud * 0.85);
        float dif = max(dot(n, sunDir), 0.0);
        float term = smoothstep(-0.05, 0.15, dot(n, sunDir));
        vec3 ec3 = surf * (0.02 + 1.3 * dif) * term;
        // Sun glint on the oceans.
        vec3 H = normalize(sunDir + vec3(0.0, 0.0, 1.0));
        ec3 += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, H), 0.0), 60.0) * (1.0 - land) * (1.0 - cloud) * (0.4 + 0.9 * hi);
        // Atmosphere rim: thin, blue, on the lit side.
        float rim = pow(1.0 - n.z, 3.0);
        ec3 += vec3(0.3, 0.55, 1.0) * rim * smoothstep(-0.2, 0.4, dot(n, sunDir)) * (0.6 + 0.6 * swell);
        col = mix(col, ec3, smoothstep(1.0, 0.985, r2));
    }
    // The thin glow of the atmosphere just beyond the limb.
    float rr = sqrt(r2);
    col += vec3(0.3, 0.55, 1.0) * exp(-max(rr - 1.0, 0.0) * 40.0) * step(1.0, rr) * smoothstep(-0.3, 0.6, dot(normalize(vec3(d, 0.0)), sunDir)) * 0.3 * (0.6 + 0.6 * swell);

    // The lunar horizon: a gently curved limb in the lower part of the frame,
    // the surface in perspective, sliding past slowly.
    float hy = -0.12 - 0.06 * (p.x / aspect) * (p.x / aspect) * 4.0;
    if (p.y < hy) {
        float dd = hy - p.y;
        float z = 0.06 / (dd + 0.004);                          // depth
        vec2 g = vec2(p.x * z * 2.0, z - T * 0.08);             // ground plane
        // Craters: round bowls with a lit rim and a shadowed side (sun from the left).
        float shade = 0.0, rimL = 0.0;
        for (int L = 0; L < 3; ++L) {
            float sc = 1.0 + 1.8 * float(L);
            vec2 cq = g * sc;
            vec2 ci = floor(cq), cf = fract(cq);
            vec2 cc = 0.25 + 0.5 * hash22(ci + float(L) * 7.0);
            float cr = 0.15 + 0.25 * hash21(ci + 3.0 + float(L));
            vec2 dv = (cf - cc) / cr;
            float dl = length(dv);
            // Fine craters fade out with distance, or they shimmer at the horizon.
            float fade = smoothstep(14.0, 5.0, z * sc);
            if (hash21(ci + 9.0 + float(L)) < 0.6 && dl < 1.2 && fade > 0.0) {
                shade += smoothstep(1.0, 0.7, dl) * smoothstep(-0.4, 0.6, -dv.x) * 0.8 * fade;     // inner wall away from the sun
                rimL += exp(-pow((dl - 1.0) * 6.0, 2.0)) * smoothstep(0.2, -0.6, dv.x) * fade;
            }
        }
        float tex = 0.75 + 0.25 * mix(noise2(g * 20.0), 0.5, smoothstep(3.0, 10.0, z));
        vec3 regolith = vec3(0.55, 0.53, 0.5) * tex * (0.45 + 0.4 * smoothstep(0.0, 0.2, dd));
        regolith *= 1.0 - clamp(shade, 0.0, 0.95);
        regolith += vec3(0.7) * clamp(rimL, 0.0, 1.0) * 0.3;
        // The near edge of the limb is brightest, the far limb falls off.
        col = regolith * (0.6 + 0.6 * exp(-dd * 2.0));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

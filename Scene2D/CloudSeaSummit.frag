#version 330 core
out vec4 fragColor;
/**
 * @file CloudSeaSummit.frag
 * @brief CLOUD SEA SUMMIT: above a sea of cloud at sunrise.  The cloud
 * tops roll slowly through the valleys below, billowed and lit gold on the
 * sun side, blue in their troughs; ridges and summits stand out of the sea
 * in layers that fade into the haze, and the sun sits on the horizon with
 * its light running across the cloud tops.  The music is in the light:
 * the swell raises the sun's glow, the bands brighten the ridge rims, the
 * treble sparkles on the rime of the nearest summit.
 *
 * Audio Reactivity:
 *   audioSwell        -> sunrise glow and cloud-top light (slow)
 *   audioSpectrum[32] -> rim light on the ridges, one band per ridge layer
 *   audioHigh         -> rime sparkle on the near summit (light)
 *   sceneAdvance      -> the cloud sea flows (continuous)
 *
 * Per-activation variety: sunP (sun position), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sunP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }
float ridgeN(float x, float seed)
{
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 5; ++i) { v += a * (1.0 - abs(noise2(vec2(x * f, seed)) * 2.0 - 1.0)); f *= 2.1; a *= 0.5; }
    return v;
}

float g_flow;

// Cloud-top height over the ground plane (world x, z).
float cloudH(vec2 w)
{
    // Cumulus tops: rounded bumps (inverted absolute noise) on a slow swell.
    vec2 q = w * 0.3 + vec2(g_flow * 0.12, g_flow * 0.05);
    float big = fbm(q * 0.6);
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 4; ++i)
    {
        float n = noise2(q * f * 1.7 + float(i) * 5.3);
        v += a * sqrt(max(1.0 - pow(2.0 * n - 1.0, 2.0), 0.0));   // round caps
        f *= 2.2; a *= 0.5;
    }
    return 0.25 * big + 0.42 * v * v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    g_flow = sceneAdvance * 0.25 + sceneTime * 0.08;

    float horizon = 0.08;
    vec2 sun = vec2(mix(0.15, 0.6, clamp(sunP, 0.0, 1.0)) * aspect * 0.5, horizon + 0.035);
    vec3 sunC = mix(vec3(1.0, 0.72, 0.42), imgPalette(hue * 0.159 + 0.05) * 1.2, 0.25);
    vec3 skyTop = mix(vec3(0.16, 0.22, 0.42), imgPalette(hue * 0.159 + 0.6) * 0.5, 0.3);
    vec3 skyLow = mix(vec3(1.0, 0.6, 0.45), imgPalette(hue * 0.159 + 0.12), 0.25);

    // Sky.
    float hy = clamp((p.y - horizon) * 2.2, 0.0, 1.0);
    vec3 col = mix(skyLow, skyTop, pow(hy, 0.6));
    float sd = length((p - sun) * vec2(1.0, 1.6));
    col += sunC * (exp(-sd * 3.0) * (0.6 + 0.6 * swell) + exp(-sd * 25.0) * 1.5);
    // Thin high streaks lit from below.
    float streak = fbm(vec2(p.x * 1.5 + g_flow * 0.02, p.y * 9.0));
    col += sunC * smoothstep(0.55, 0.8, streak) * smoothstep(horizon + 0.05, 0.45, p.y) * 0.25;

    // Mountain layers from far to near: silhouettes rising out of the sea.
    float seaTop = horizon - 0.02;
    for (int i = 0; i < 4; ++i)
    {
        float fi = float(i);
        float depth = 1.0 - fi * 0.22;                 // 1 = far
        float base = seaTop - 0.02 - fi * 0.05;
        float hgt = (0.06 + 0.1 * fi) * (0.7 + 0.6 * hash11(fi + 3.0));
        float ridge = base + hgt * ridgeN(p.x * (1.1 + fi * 0.5) + fi * 7.3, fi * 11.0);
        // A proper summit on the nearest layer.
        if (i == 3) ridge += 0.36 * exp(-abs(p.x + 0.5 * aspect * 0.5) * 4.5) + 0.12 * exp(-abs(p.x + 0.3 * aspect * 0.5) * 7.0);
        float m = smoothstep(ridge + 0.002, ridge - 0.002, p.y);
        int band = int(mod(fi * 7.0 + 3.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 rock = mix(skyLow * 0.35, vec3(0.05, 0.06, 0.09), fi / 3.0) * (0.6 + 0.4 * img(fract(p * vec2(0.3, 0.8) + fi)).r);
        // Sun-side rim light along the ridge line.
        float rim = exp(-(ridge - p.y) * 60.0) * smoothstep(0.0, 1.0, 1.0 - abs(p.x - sun.x) * 0.5);
        // Slopes facing the sun catch its light: the ridge's own slope.
        // (A broad, smooth wash: a fine slope term striped the rock.)
        float face = smoothstep(0.9, 0.0, abs(p.x - sun.x)) * 0.5 + 0.2 * noise2(p * vec2(4.0, 9.0) + fi);
        rock += sunC * face * 0.3 * exp(-(ridge - p.y) * 7.0);
        vec3 layer = rock + sunC * rim * (0.35 + 0.9 * e);
        if (i == 3)
        {
            // Rime on the near summit: round glints.
            vec2 g = p * 140.0; vec2 c = floor(g), f = fract(g) - 0.5;
            vec2 j = vec2(hash21(c + 1.1), hash21(c + 4.3)) - 0.5;
            float gl = smoothstep(0.2, 0.05, length(f - j * 0.6)) * step(0.93, hash21(c + 9.0));
            layer += sunC * gl * exp(-(ridge - p.y) * 12.0) * (0.3 + 1.2 * hi);
        }
        // Haze: far layers melt into the sky.
        layer = mix(layer, skyLow * 0.8, depth * 0.55);
        col = mix(col, layer, m);
    }

    // The cloud sea: a relief marched over the ground plane below the eye.
    if (p.y < seaTop + 0.03)
    {
        vec3 ro = vec3(0.0, 1.0, 0.0);
        vec3 rd = normalize(vec3(p.x, p.y - horizon, 1.4));
        float t0 = (ro.y - 0.6) / max(-rd.y, 1e-3);
        float t1 = ro.y / max(-rd.y, 1e-3);
        float t = t0, hitT = -1.0;
        float dt = (t1 - t0) / 40.0;
        for (int i = 0; i < 40; ++i)
        {
            vec3 x = ro + rd * t;
            if (x.y < cloudH(x.xz)) { hitT = t; break; }
            t += dt;
        }
        if (hitT > 0.0)
        {
            // Refine the crossing so the relief does not terrace.
            float lo = hitT - dt, hiT = hitT;
            for (int k = 0; k < 5; ++k)
            {
                float mid = 0.5 * (lo + hiT);
                vec3 x = ro + rd * mid;
                if (x.y < cloudH(x.xz)) hiT = mid; else lo = mid;
            }
            hitT = hiT;
        }
        if (hitT > 0.0)
        {
            vec3 x = ro + rd * hitT;
            float h = cloudH(x.xz);
            float e = 0.08;
            vec3 n = normalize(vec3(cloudH(x.xz - vec2(e, 0.0)) - cloudH(x.xz + vec2(e, 0.0)),
                                    2.0 * e,
                                    cloudH(x.xz - vec2(0.0, e)) - cloudH(x.xz + vec2(0.0, e))));
            vec3 L = normalize(vec3(sun.x * 1.5, 0.18, 1.0));
            float dif = clamp(dot(n, L), 0.0, 1.0);
            float fres = pow(1.0 - clamp(n.y, 0.0, 1.0), 2.0);
            vec3 shadowC = mix(vec3(0.22, 0.28, 0.5), imgPalette(hue * 0.159 + 0.6), 0.2) * 0.6;
            vec3 cloud = mix(shadowC, vec3(1.0, 0.96, 0.92), pow(dif, 0.8));
            cloud *= 0.55 + 0.7 * h;
            cloud += sunC * pow(dif, 3.0) * (0.35 + 0.6 * swell) + sunC * fres * 0.25;
            // Light through the thin rims of the billows (silver lining).
            cloud += sunC * smoothstep(0.35, 0.0, n.y) * 0.4 * (0.5 + 0.5 * swell);
            // Distance: the sea fades into the glow on the horizon.
            float fog = 1.0 - exp(-hitT * 0.045);
            cloud = mix(cloud, skyLow * 0.95 + sunC * exp(-abs(p.x - sun.x) * 2.0) * 0.4, fog);
            // Wisps: soft vapour drifting over the tops, lit by the sun --
            // what makes a cloud sea read as cloud and not as snow.
            vec2 wq = x.xz * vec2(0.5, 0.9) + vec2(g_flow * 0.2, 0.0);
            float wisp = smoothstep(0.45, 0.85, fbm(wq)) * smoothstep(0.1, 0.7, hitT * 0.2);
            cloud = mix(cloud, skyLow * 0.9 + sunC * 0.35 * dif, wisp * 0.55);
            cloud = mix(cloud, mix(cloud, vec3(dot(cloud, vec3(0.333))), 0.2) * 1.08, 0.5);
            float cm = smoothstep(seaTop + 0.02, seaTop - 0.01, p.y);
            col = mix(col, cloud, cm);
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file LavenderRowsSunset.frag
 * @brief LAVENDER ROWS SUNSET: a Provence lavender field at sunset, seen
 * straight down its rows -- mounded purple rows running away in perfect
 * central perspective toward a low sun on the horizon, the pale earth
 * furrows between them glowing in the backlight, every bush rimmed in
 * gold where the sun catches its flower spikes.  A lone tree and a stone
 * farmhouse stand on the horizon, the sky burns orange to violet.  Each
 * row answers a band of the music: its gold rim brightens with it, so
 * light runs across the rows.  The camera is still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the golden rims, one band per row (light)
 *   audioSwell        -> the sun's glow and the haze (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the sun sinking slowly, the air shimmering
 *
 * Per-activation variety: rowsP (how wide the rows), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float rowsP;
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

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float band[8];
    for (int i = 0; i < 8; ++i)
        band[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);

    float hz = 0.08;                                          // horizon on screen
    // The sun low over the horizon, sinking very slowly (bounded).
    vec2 sun = vec2(0.06, hz + 0.075 - 0.04 * smoothstep(0.0, 300.0, T));
    float sd = length(p - sun);

    // Sky: orange at the horizon to violet above.
    float sy = p.y - hz;
    vec3 sky = mix(vec3(1.0, 0.55, 0.22), vec3(0.95, 0.45, 0.45), smoothstep(0.0, 0.18, sy));
    sky = mix(sky, vec3(0.38, 0.3, 0.55), smoothstep(0.12, 0.45, sy));
    sky += vec3(1.0, 0.75, 0.4) * exp(-sd * 6.0) * (0.6 + 0.5 * swell);
    sky += vec3(1.0, 0.95, 0.8) * smoothstep(0.034, 0.03, sd) * 1.5;
    // Thin cloud streaks lit from below.
    float cl = smoothstep(0.55, 0.8, fbm(vec2(p.x * 2.0 + T * 0.004, sy * 14.0)));
    sky = mix(sky, vec3(1.0, 0.6, 0.4) * (0.7 + 0.4 * exp(-sd * 3.0)), cl * smoothstep(0.03, 0.12, sy) * 0.6);
    vec3 col = sky;

    // Horizon: a lone tree and a farmhouse in silhouette, a haze band.
    if (p.y > hz && p.y < hz + 0.08) {
        vec2 tq = p - vec2(-0.42, hz);
        float crown = length((tq - vec2(0.0, 0.035)) * vec2(1.0, 1.3)) - 0.028 - 0.004 * noise2(tq * 200.0);
        float trunk = max(abs(tq.x) - 0.002, tq.y - 0.02);
        vec2 hq = p - vec2(0.36, hz);
        float house = max(abs(hq.x) - 0.035, hq.y - 0.018 - 0.01 * (1.0 - abs(hq.x) / 0.035));
        float sil = smoothstep(0.0015, -0.0015, min(min(crown, trunk), house));
        col = mix(col, vec3(0.25, 0.14, 0.2), sil);
    }

    if (p.y < hz) {
        // The field in central perspective: depth from the screen height.
        float dy = hz - p.y;
        float z = 0.9 / dy;                                    // distance
        float xw = p.x * z;                                    // across the rows
        float spc = 1.4 + 0.8 * clamp(rowsP, 0.0, 1.0);
        float rq = xw / spc + 0.5;
        float ri = floor(rq);
        float rf = fract(rq) - 0.5;                            // -0.5..0.5 across a row
        float fw = fwidth(rq) + 1e-4;
        // A row's mound: purple bush, rounded; furrow of pale earth between.
        // Individual round bushes along the row.
        float bz = z / 0.75 + hash21(vec2(ri, 3.0));
        float bf = fract(bz) * 2.0 - 1.0;
        float bwid = 0.34 * (0.72 + 0.28 * sqrt(max(1.0 - bf * bf, 0.0)));
        float fwz = fwidth(bz);
        bwid = mix(bwid, 0.3, smoothstep(0.15, 0.5, fwz));          // far away the bushes merge
        float bush = smoothstep(bwid + fw, bwid - fw, abs(rf) + 0.04 * (noise2(vec2(z * 3.0, ri)) - 0.5));
        vec3 purple = mix(vec3(0.42, 0.26, 0.72), vec3(0.62, 0.45, 0.92), noise2(vec2(xw * 6.0, z * 5.0)));
        purple = mix(purple, imgPalette(0.75 + hueP * 0.159) * vec3(0.8, 0.6, 1.0), 0.1);
        vec3 earth = vec3(0.65, 0.5, 0.36);
        // Backlight: the sun ahead -- the furrows glow, the bushes are in
        // their own shade with gold rims along their tops.
        float toward = exp(-abs(p.x - sun.x) * 1.6);
        vec3 lightC = vec3(1.0, 0.72, 0.4) * (0.5 + 0.5 * toward) * (0.8 + 0.4 * swell);
        vec3 furrow = earth * (0.45 + 0.6 * toward) * (0.85 + 0.15 * noise2(vec2(xw * 12.0, z * 8.0)));
        float mound = sqrt(max(1.0 - pow(abs(rf) / bwid, 2.0), 0.0));
        vec3 bushC = purple * (0.35 + 0.35 * mound) * (0.7 + 0.3 * toward);
        // Flower spikes: fine vertical texture close by, blending with distance.
        float spikes = noise2(vec2(xw * 40.0, p.y * 300.0));
        float near = smoothstep(12.0, 3.0, z);
        bushC *= 1.0 - 0.3 * near * smoothstep(0.4, 0.8, spikes);
        // The gold rim along the top edges of each row.
        float rim = smoothstep(bwid - fw * 2.0 - 0.06, bwid, abs(rf)) * bush;
        float b = band[int(mod(ri + 64.0, 8.0))];
        bushC += lightC * rim * (0.25 + 1.4 * b);
        col = mix(furrow * (lightC * 1.1 + 0.15), bushC * (0.9 + 0.25 * lightC), bush);
        // Haze toward the horizon.
        col = mix(col, vec3(1.0, 0.65, 0.4) * (0.7 + 0.3 * swell), smoothstep(8.0, 60.0, z) * 0.85);
    }
    // A shimmer of warm air over the field near the horizon.
    col += vec3(1.0, 0.7, 0.4) * exp(-abs(p.y - hz) * 40.0) * 0.12 * (0.6 + 0.6 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

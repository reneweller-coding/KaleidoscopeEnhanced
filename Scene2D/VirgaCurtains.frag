#version 330 core
out vec4 fragColor;
/**
 * @file VirgaCurtains.frag
 * @brief VIRGA CURTAINS: late afternoon over a high desert plain -- a deck of
 * dark storm cloud across the sky, and hanging from its base curtains of
 * rain that never reach the ground: long soft streaks swept back by the
 * wind, fading into nothing halfway down as the drops evaporate in the
 * dry air.  The sun stands behind the clouds, so the curtains nearest it
 * glow gold and silver in the backlight while those further off are grey
 * veils.  Below, the ochre plain runs to a line of mesas; a road leads
 * away into it.  The rain drifts and falls; the camera is still.
 *
 * Audio Reactivity:
 *   audioSwell  -> the backlight through the curtains (slow)
 *   audioBass   -> the glow of the sun's rim in the cloud gaps (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the falling streaks, the drifting curtains
 *
 * Per-activation variety: rainP (how much virga), hueP.
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
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float rainP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float rain = 0.4 + 0.5 * clamp(rainP, 0.0, 1.0);

    float hz = -0.22;
    vec2 sun = vec2(0.12, 0.26);                               // hidden behind the deck
    float sd = length((p - sun) * vec2(0.8, 1.0));

    // Clear sky low down between the deck and the horizon: warm and bright.
    vec3 col = mix(vec3(1.0, 0.82, 0.58), vec3(0.62, 0.6, 0.62), smoothstep(hz, 0.15, p.y));
    col += vec3(1.0, 0.8, 0.5) * exp(-sd * 3.0) * 0.4;

    // The cloud deck: a ragged base, dark, rimmed with light near the sun.
    float base = 0.1 + 0.06 * fbm(vec2(p.x * 2.0 + T * 0.004, 1.0)) + 0.03 * sin(p.x * 1.3);
    float deck = smoothstep(base - 0.01, base + 0.02, p.y);
    float cl = fbm(vec2(p.x * 3.0 + T * 0.005, p.y * 5.0));
    vec3 cloudC = mix(vec3(0.14, 0.14, 0.18), vec3(0.3, 0.3, 0.35), cl);
    // The sun's light breaking through thin places and along the base.
    float thin = smoothstep(0.55, 0.75, cl) * exp(-sd * 2.5);
    cloudC += vec3(1.0, 0.85, 0.6) * (thin * 0.9 + exp(-sd * 6.0) * 0.4) * (0.7 + 0.6 * bass);
    cloudC += vec3(1.0, 0.8, 0.55) * smoothstep(0.03, 0.0, p.y - base) * deck * exp(-sd * 2.0) * 0.8;
    cloudC = mix(cloudC, cloudC * imgPalette(0.1 + hueP * 0.159) * 1.4, 0.08);
    col = mix(col, cloudC, deck);

    // Virga: curtains hanging from the base, swept by the wind, fading out.
    if (p.y < base + 0.02) {
        float below = base - p.y;                               // distance below the base
        // Where along the deck the curtains hang (drifting slowly).
        float xs = p.x + below * 0.9;                          // swept back toward the left as they fall
        float where = smoothstep(0.42 - 0.15 * rain, 0.58 - 0.12 * rain, fbm(vec2(xs * 1.5 + T * 0.01, 3.0)));
        float len = 0.18 + 0.3 * fbm(vec2(xs * 3.0, 7.0));
        float fade = pow(smoothstep(len, 0.0, below), 0.7) * smoothstep(-0.02, 0.01, below);
        // Streaks falling within the curtain.
        float streak = noise2(vec2(xs * 70.0, p.y * 2.0 + T * 0.4)) * 0.4 + noise2(vec2(xs * 18.0, p.y * 1.2 + T * 0.25)) * 0.6;
        float v = where * fade * (0.45 + 0.75 * smoothstep(0.25, 0.7, streak));
        // Backlit: bright gold and silver near the sun, grey further away.
        float back = exp(-abs(p.x - sun.x) * 1.6);
        vec3 vc = mix(vec3(0.3, 0.31, 0.37), vec3(1.0, 0.9, 0.7) * (1.2 + 0.8 * swell), back);
        col = mix(col, vc, clamp(v, 0.0, 1.0) * 0.85);
    }

    // The plain, mesas on the horizon, a road leading away.
    if (p.y < hz + 0.035) {
        float mesa = hz + 0.03 * smoothstep(0.45, 0.55, noise2(vec2(p.x * 3.0, 4.0))) * (0.6 + 0.4 * step(0.5, noise2(vec2(p.x * 10.0, 5.0))));
        if (p.y < mesa) col = mix(vec3(0.38, 0.3, 0.3), col, 0.35);
        if (p.y < hz) {
            float z = 0.3 / (hz - p.y);
            vec2 g = vec2(p.x * z, z);
            vec3 plain = mix(vec3(0.62, 0.45, 0.28), vec3(0.5, 0.42, 0.3), fbm(g * 0.6));
            // Sage shrubs: round dark dots scattered, smaller with distance.
            vec2 sq = g * 3.0, si = floor(sq), sf = fract(sq);
            vec2 sc = 0.25 + 0.5 * vec2(hash21(si), hash21(si + 3.0));
            float shrub = smoothstep(0.2, 0.12, length(sf - sc)) * step(0.55, hash21(si + 5.0)) * smoothstep(0.4, 0.1, fwidth(sq.y));
            plain = mix(plain, vec3(0.3, 0.32, 0.25), shrub * 0.8);
            // The road: a straight grey band to the vanishing point.
            float road = smoothstep(0.2, 0.16, abs(g.x - 1.3));
            plain = mix(plain, vec3(0.3, 0.3, 0.32), road);
            plain = mix(plain, vec3(0.9, 0.8, 0.4), smoothstep(0.015, 0.0, abs(g.x - 1.3)) * step(0.5, fract(z * 0.5)) * road);
            // Light and cloud shadow on the land.
            float shade = 0.55 + 0.45 * smoothstep(0.5, 0.7, fbm(g * 0.08 + vec2(T * 0.01, 0.0)));
            col = mix(plain * shade, col, 1.0 - exp(-z * 0.02));
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

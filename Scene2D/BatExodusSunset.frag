#version 330 core
out vec4 fragColor;
/**
 * @file BatExodusSunset.frag
 * @brief BAT EXODUS SUNSET: the evening emergence of a bat colony -- out of a
 * cave mouth in a rocky hillside millions of bats pour into the red dusk
 * sky, rising in a dense spiralling column that bends away and streams off
 * across the sky as a long, rippling ribbon, thinning at its far end into
 * scattered specks.  Close to the camera single bats flutter past, wings
 * beating.  The sky burns red and orange behind; a few thin clouds glow.
 * The camera is still; the stream flows on and on.
 *
 * Audio Reactivity:
 *   audioSwell  -> the glow of the sunset (slow)
 *   audioBass   -> the sun's rim light on the hill (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the stream flowing, wings beating
 *
 * Per-activation variety: streamP (the shape of the stream), hueP.
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

uniform float streamP;
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
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
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

float gT, gS;

// The stream's centre line: a column rising from the cave, bending right
// and streaming away across the sky.  s runs 0 (cave) .. 1 (far end).
vec2 streamAt(float s)
{
    vec2 cave = vec2(-0.45, -0.17);
    float rise = smoothstep(0.0, 0.35, s);
    float x = cave.x + 0.08 * sin(s * 20.0 - gT * 0.4) * (1.0 - rise) + 1.3 * s * s * (0.8 + 0.3 * gS);
    float y = cave.y + 0.55 * rise - 0.12 * smoothstep(0.35, 1.0, s) + 0.05 * sin(s * 7.0 + gT * 0.05) * rise;
    return vec2(x, y);
}

// A bat: body and two wings, the wings beating (shape only, no motion of the view).
float bat(vec2 q, float beat)
{
    float wy = 0.35 * beat;
    float body = length(q * vec2(2.2, 1.0)) - 0.18;
    // Wings: scalloped triangles from the body to the tips.
    vec2 m = vec2(abs(q.x), q.y);
    vec2 tip = vec2(1.0, wy);
    vec2 e = tip - vec2(0.1, 0.05);
    float h = clamp(dot(m - vec2(0.1, 0.05), e) / dot(e, e), 0.0, 1.0);
    float wing = length(m - vec2(0.1, 0.05) - e * h) - 0.12 * (1.0 - h) - 0.03;
    wing += 0.04 * smoothstep(0.3, 0.9, h) * (0.5 + 0.5 * sin(h * 25.0));
    return min(body, wing);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    gS = clamp(streamP, 0.0, 1.0);
    float px = 1.0 / resolution.y;

    // Dusk sky: red and orange low, deep violet above; thin glowing clouds.
    float hz = -0.28;
    vec3 col = mix(vec3(1.0, 0.45, 0.15), vec3(0.75, 0.2, 0.18), smoothstep(hz, 0.05, p.y));
    col = mix(col, vec3(0.2, 0.08, 0.2), smoothstep(0.05, 0.5, p.y));
    col *= 0.8 + 0.4 * swell;
    col = mix(col, col * imgPalette(0.02 + hueP * 0.159) * 1.4, 0.08);
    float cl = smoothstep(0.6, 0.78, fbm(vec2(p.x * 2.0 + gT * 0.003, p.y * 12.0)));
    col = mix(col, vec3(1.0, 0.55, 0.35) * (0.8 + 0.4 * swell), cl * smoothstep(-0.1, 0.1, p.y) * smoothstep(0.4, 0.2, p.y) * 0.5);
    col += vec3(1.0, 0.6, 0.25) * exp(-length((p - vec2(0.3, hz)) * vec2(0.6, 2.0)) * 4.0) * 0.5;

    // The stream: density falls off from its centre line; the column is
    // thick near the cave and thins toward the far end.
    float best = 1e9, bs = 0.0;
    for (int i = 0; i <= 40; ++i) {
        float s = float(i) / 40.0;
        float d = length(p - streamAt(s));
        if (d < best) { best = d; bs = s; }
    }
    // Refine between neighbours.
    for (int i = -4; i <= 4; ++i) {
        float s = clamp(bs + float(i) / 160.0, 0.0, 1.0);
        float d = length(p - streamAt(s));
        if (d < best) { best = d; bs = s; }
    }
    float width = mix(0.05, 0.1, smoothstep(0.0, 0.4, bs)) * mix(1.0, 0.5, smoothstep(0.6, 1.0, bs));
    float dens = exp(-pow(best / width, 2.0)) * mix(1.0, 0.25, smoothstep(0.5, 1.0, bs));
    // Flowing texture inside the stream: bands of density moving along it.
    float flow = fbm(vec2(bs * 30.0 - gT * 0.6, best * 40.0));
    dens *= 0.55 + 0.7 * flow;
    // Individual specks at the edges and far end, dark on the sky.
    {
        vec2 g = p * 220.0 + vec2(-gT * 1.5, -gT * 0.6), gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float speck = smoothstep(0.22, 0.1, length(gf - gc)) * step(1.0 - clamp(dens * 2.5, 0.0, 0.9), hash21(gi + 5.0));
        col = mix(col, vec3(0.05, 0.02, 0.03), speck * 0.9);
    }
    col = mix(col, vec3(0.07, 0.03, 0.04), clamp(dens * 0.9, 0.0, 0.85));

    // The hillside with the cave mouth.
    float hill = hz + 0.05 + 0.1 * exp(-pow((p.x + 0.45) * 2.5, 2.0)) + 0.02 * fbm(vec2(p.x * 6.0, 1.0));
    if (p.y < hill) {
        col = vec3(0.06, 0.03, 0.03) + vec3(0.5, 0.2, 0.08) * smoothstep(hill - 0.02, hill, p.y) * (0.3 + 0.5 * bass);
        // Scrub on the slope.
        col *= 0.8 + 0.2 * noise2(p * 60.0);
    }
    // The cave mouth: a dark arch in the slope, the column pouring out of it.
    vec2 cq = p - vec2(-0.45, hz + 0.1);
    float mouth = max(length(cq * vec2(1.0, 1.4)) - 0.045, -cq.y - 0.012);
    col = mix(col, vec3(0.0), smoothstep(px * 2.0, -px * 2.0, mouth) * step(p.y, hill));

    // Near bats fluttering past the camera, large and dark, wings beating.
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        float ph = fract(gT * (0.02 + 0.01 * hash11(fk)) + hash11(fk * 3.0));
        vec2 c = vec2(mix(-1.0, 1.0, ph) * aspect * 0.6, -0.1 + 0.5 * hash11(fk * 5.0) + 0.05 * sin(ph * 20.0 + fk));
        float sz = 0.012 + 0.02 * hash11(fk * 7.0);
        float beat = sin(gT * (9.0 + 3.0 * hash11(fk * 9.0)) + fk * 2.0);
        float bd = bat((p - c) / sz, beat) * sz;
        col = mix(col, vec3(0.03, 0.015, 0.02), smoothstep(px, -px, bd));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

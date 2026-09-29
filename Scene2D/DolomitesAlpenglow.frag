#version 330 core
out vec4 fragColor;
/**
 * @file DolomitesAlpenglow.frag
 * @brief DOLOMITES ALPENGLOW: the pale limestone towers of the Dolomites just
 * after sunset -- a row of sheer, fluted rock spires above a dark alpine
 * meadow, and on them the alpenglow: the rock burning rose and orange
 * while the valley already lies in blue dusk, the earth's shadow climbing
 * slowly up the walls and the glow withdrawing to the summits.  Snow lies
 * on the ledges, a hut on the meadow shows a warm window, larches stand
 * dark, the sky shades from deep blue to the pink belt of Venus.  The
 * glow of the rock rises and falls with the music's swell.
 *
 * Audio Reactivity:
 *   audioSwell  -> the strength of the alpenglow on the rock (slow)
 *   audioHigh   -> the first stars (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the earth's shadow climbing (bounded, continuous)
 *
 * Per-activation variety: spiresP (how jagged the towers), hueP.
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

uniform float spiresP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

float gJag;

// The skyline of the towers: a massif with a jagged crest, sharp spires
// crowded on it in groups.
float towers(float x)
{
    float h = 0.08 + 0.07 * fbm(vec2(x * 3.0, 1.0)) + 0.03 * noise2(vec2(x * 14.0, 2.0));
    h *= smoothstep(1.1, 0.7, abs(x + 0.05));
    for (int k = 0; k < 16; ++k) {
        float fk = float(k);
        float g = floor(fk / 4.0);                                   // four groups of four
        float c = -0.8 + g * 0.45 + (mod(fk, 4.0) - 1.5) * 0.055 + 0.03 * (hash11(fk * 3.1) - 0.5);
        float ht = 0.16 + 0.2 * hash11(fk * 5.7) * (0.7 + 0.5 * gJag) + 0.05 * sin(g * 2.1);
        float w = 0.045 + 0.04 * hash11(fk * 7.3);
        float d = abs(x - c) / w;
        // Sheer walls, a craggy summit block.
        float dd = clamp(d, 0.0, 1.0);
        float spike = ht * (1.0 - pow(dd, 5.0 - 2.5 * gJag)) * (1.0 - 0.12 * dd) + 0.02 * (noise2(vec2(x * 30.0, fk)) - 0.5) * step(dd, 0.95);
        h = max(h, spike);
    }
    h += 0.01 * (0.5 + gJag) * (noise2(vec2(x * 60.0, 3.0)) - 0.5);
    return h;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    gJag = clamp(spiresP, 0.0, 1.0);

    // Sky: deep blue above, the pink belt of Venus, pale near the ridge.
    vec3 col = mix(vec3(0.85, 0.6, 0.62), vec3(0.95, 0.55, 0.5), smoothstep(-0.05, 0.1, p.y));
    col = mix(col, vec3(0.35, 0.4, 0.62), smoothstep(0.1, 0.3, p.y));
    col = mix(col, vec3(0.12, 0.16, 0.34), smoothstep(0.28, 0.55, p.y));
    // First stars high up.
    {
        vec2 g = p * 80.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
        float st = smoothstep(0.1, 0.0, length(gf - gc)) * step(0.985, hash21(gi + 5.0));
        col += vec3(0.9, 0.95, 1.0) * st * smoothstep(0.25, 0.45, p.y) * (0.3 + 0.8 * hi);
    }

    // The towers.
    float base = -0.12;
    float ht = base + towers(p.x);
    if (p.y < ht) {
        float e = 0.002;
        float slope = (towers(p.x + e) - towers(p.x - e)) / (2.0 * e);
        // Fluting: vertical gullies and ribs down the walls.
        float flute = fbm(vec2(p.x * 38.0, p.y * 3.0));
        float gully = smoothstep(0.35, 0.65, flute);
        // Ledges with snow, running roughly level.
        float ledge = smoothstep(0.86, 0.92, noise2(vec2(p.x * 25.0, p.y * 90.0))) * smoothstep(0.4, 0.8, noise2(vec2(p.x * 8.0, p.y * 12.0)));
        vec3 rock = vec3(0.82, 0.78, 0.72) * (0.7 + 0.3 * gully);
        // Faces toward the west (left) catch the last light.
        float face = clamp(0.55 - slope * 0.25 + 0.3 * (gully - 0.5), 0.2, 1.0);
        // The earth's shadow climbs up the walls, slowly and boundedly.
        float shadowLine = base + 0.02 + 0.2 * smoothstep(0.0, 240.0, T) + 0.03 * (noise2(vec2(p.x * 4.0, 7.0)) - 0.5);
        float lit = smoothstep(shadowLine - 0.01, shadowLine + 0.02, p.y);
        vec3 glowC = mix(vec3(1.0, 0.45, 0.4), vec3(1.0, 0.6, 0.3), smoothstep(0.1, 0.35, p.y - base));
        glowC = mix(glowC, imgPalette(0.95 + hueP * 0.159) * 1.3, 0.1);
        vec3 dusk = vec3(0.3, 0.33, 0.48);
        vec3 lightC = mix(dusk * 0.8, glowC * (0.8 + 0.9 * swell), lit);
        col = rock * lightC * face;
        col = mix(col, vec3(0.95, 0.92, 1.0) * mix(dusk, glowC * (0.9 + 0.6 * swell), lit) * 1.1, ledge * 0.5);
        // Scree at the foot, then dark forested slopes down into the valley.
        col = mix(col, vec3(0.5, 0.5, 0.55) * dusk, smoothstep(base + 0.05, base + 0.01, p.y));
        float canopy = 0.6 + 0.5 * noise2(p * vec2(160.0, 90.0)) * noise2(p * vec2(40.0, 25.0) + 3.0);
        col = mix(col, vec3(0.07, 0.11, 0.12) * canopy, smoothstep(base + 0.015, base - 0.01, p.y + 0.02 * noise2(vec2(p.x * 12.0, 5.0))));
    }

    // The meadow ridge in the foreground with larches and a hut.
    float mr = -0.28 + 0.06 * sin(p.x * 2.3 + 0.5) + 0.03 * fbm(vec2(p.x * 3.0, 2.0));
    // Larches: narrow dark cones along the ridge.
    float trees = 0.0;
    {
        float tx = p.x * 22.0, ti = floor(tx);
        for (int k = -1; k <= 1; ++k) {
            float id = ti + float(k);
            float hh = hash11(id * 1.7);
            if (hh < 0.45) continue;
            float cx = (id + 0.5 + 0.3 * (hash11(id * 3.3) - 0.5)) / 22.0;
            float by = -0.28 + 0.06 * sin(cx * 2.3 + 0.5) + 0.03 * fbm(vec2(cx * 3.0, 2.0));
            float th = 0.05 + 0.05 * hh;
            float yy = (p.y - by) / th;
            float halfw = 0.018 * (1.0 - yy) * (1.0 + 0.2 * sin(yy * 30.0));
            trees = max(trees, step(0.0, yy) * step(yy, 1.0) * smoothstep(0.002, -0.002, abs(p.x - cx) - halfw));
        }
    }
    float meadow = smoothstep(0.002, -0.002, p.y - mr);
    vec3 grass = vec3(0.1, 0.16, 0.12) * (0.8 + 0.2 * noise2(p * 40.0));
    col = mix(col, grass, meadow);
    col = mix(col, vec3(0.03, 0.05, 0.05), trees);
    // The hut with a warm window.
    {
        vec2 hq = p - vec2(-0.32, -0.28 + 0.06 * sin(-0.32 * 2.3 + 0.5) + 0.03 * fbm(vec2(-0.96, 2.0)));
        float hut = max(abs(hq.x) - 0.03, hq.y - 0.022 - 0.018 * (1.0 - abs(hq.x) / 0.03));
        hut = max(hut, -hq.y - 0.01);
        col = mix(col, vec3(0.06, 0.05, 0.05), smoothstep(0.002, -0.002, hut));
        float win = step(abs(hq.x - 0.01), 0.005) * step(abs(hq.y - 0.009), 0.005);
        col += vec3(1.0, 0.7, 0.35) * win * 1.2;
        col += vec3(1.0, 0.6, 0.3) * exp(-length(hq - vec2(0.01, 0.009)) * 60.0) * 0.15;
    }
    // Valley haze in the dusk below the towers.
    col = mix(col, vec3(0.35, 0.38, 0.55), smoothstep(-0.04, -0.14, p.y) * (1.0 - meadow) * (1.0 - trees) * 0.35);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

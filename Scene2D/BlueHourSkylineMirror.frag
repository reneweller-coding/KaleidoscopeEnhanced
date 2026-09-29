#version 330 core
out vec4 fragColor;
/**
 * @file BlueHourSkylineMirror.frag
 * @brief BLUE HOUR SKYLINE MIRROR: a city skyline across a wide river in the
 * blue hour -- the sky deep blue above, a last band of orange at the
 * horizon, the towers dark silhouettes pricked with thousands of lit
 * windows, a few crowned with coloured lights and red aircraft beacons.  A
 * bridge with its string of lamps crosses in front; the river doubles
 * everything in long, trembling streaks, and a small boat draws a line of
 * light across it.  The camera is still; the music lights the windows,
 * each tower with its own band.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> window brightness, tower by tower (light)
 *   audioSwell        -> the horizon glow (slow)
 *   audioKick         -> the beacons flare (light)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the boat, the ripples (continuous)
 *
 * Per-activation variety: towersP (density of the skyline), hueP.
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
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float towersP;
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

float g_dens = 0.5;

// The city at screen point q (above the waterline).  Returns colour, and
// in `mask` whether a building covers the point.
vec3 city(vec2 q, float horizon, float T, out float mask)
{
    vec3 c = vec3(0.0);
    mask = 0.0;
    // Two rows of towers: far (lower, hazier) and near (taller).
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        float w = (0.045 + 0.02 * hash11(floor(q.x * 3.0) + fl)) * (1.3 - 0.5 * g_dens) * (1.0 - 0.25 * fl);
        float x = q.x / w + fl * 17.3;
        float bi = floor(x), bf = fract(x);
        float h1 = hash11(bi * 1.7 + fl * 5.0);
        float ht = (0.03 + 0.05 * fl) + pow(h1, 3.0) * (0.14 + 0.2 * fl) * (0.7 + 0.6 * g_dens);
        float inset = 0.06 + 0.1 * hash11(bi * 3.1 + fl);
        float spire = step(0.85, hash11(bi * 7.7 + fl)) * smoothstep(0.1, 0.0, abs(bf - 0.5)) * 0.05;
        float top = horizon + ht + spire;
        if (q.y < top && bf > inset && bf < 1.0 - inset) {
            mask = 1.0;
            vec3 body = mix(vec3(0.02, 0.03, 0.07), vec3(0.05, 0.07, 0.14), fl) * (0.8 + 0.4 * (1.0 - bf));
            // Windows: small lit rectangles, some dark; brightness by band.
            vec2 wq = vec2((bf - inset) / (1.0 - 2.0 * inset) * (6.0 + 3.0 * fl), (q.y - horizon) / w * 7.0);
            vec2 wi = floor(wq), wf = fract(wq);
            float lit = step(0.42, hash21(wi + bi * 13.0 + fl * 71.0));
            float win = step(0.2, wf.x) * step(wf.x, 0.8) * step(0.25, wf.y) * step(wf.y, 0.75) * step(q.y, top - spire - 0.004);
            int band = int(mod(bi * 3.0 + fl * 7.0, 24.0));
            float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.8, 0.9, 1.0), step(0.7, hash21(wi + bi)));
            float flick = 0.85 + 0.15 * sin(T * 0.3 + hash21(wi) * 30.0);
            body += warm * win * lit * (0.35 + 0.9 * e) * flick * (0.6 + 0.4 * fl);
            // Crown light on some towers.
            float crown = step(0.7, hash11(bi * 5.3 + fl * 2.0)) * smoothstep(0.012, 0.0, abs(q.y - (top - spire - 0.006)));
            body += mix(vec3(0.3, 0.6, 1.0), imgPalette(hash11(bi) + hueP * 0.159), 0.5) * crown * 1.5;
            c = body;
        }
        // Red aircraft beacon on the tallest.
        if (h1 > 0.8) {
            vec2 bp = vec2((bi + 0.5 + fl * 0.0) * w - fl * 17.3 * w, top + 0.004);
            float blink = 0.5 + 0.5 * sin(T * 2.0 + bi);
            float bd = length(q - bp);
            c += vec3(1.0, 0.1, 0.05) * exp(-bd * bd * 40000.0) * (0.4 + 0.6 * blink + clamp(audioKick, 0.0, 1.0));
        }
    }
    return c;
}

vec3 sky(vec2 q, float horizon, float swell)
{
    float e = q.y - horizon;
    vec3 s = mix(vec3(0.95, 0.5, 0.25), vec3(0.2, 0.3, 0.6), smoothstep(0.0, 0.12, e));
    s = mix(s, vec3(0.04, 0.08, 0.25), smoothstep(0.1, 0.5, e));
    s += vec3(1.0, 0.55, 0.3) * exp(-e * 25.0) * (0.3 + 0.4 * swell);
    return s;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    g_dens = clamp(towersP, 0.0, 1.0);
    float horizon = -0.1;

    vec3 col;
    if (p.y >= horizon) {
        float m;
        vec3 cc = city(p, horizon, T, m);
        col = mix(sky(p, horizon, swell), cc, m);
        // A few stars coming out.
        vec2 g = p * 70.0; vec2 gi = floor(g), gf = fract(g);
        vec2 sc = 0.25 + 0.5 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        col += vec3(0.8, 0.85, 1.0) * smoothstep(0.1, 0.0, length(gf - sc)) * step(0.99, hash21(gi)) * smoothstep(0.2, 0.45, p.y) * (1.0 - m);
    } else {
        // River: reflection with vertical streaking and ripple breakup.
        float d = horizon - p.y;
        float rip = noise2(vec2(p.x * 18.0, d * 90.0 - T * 0.6)) - 0.5;
        // Reflections smear vertically: average a few samples down the
        // mirrored column, each displaced by the ripples.
        vec3 rc = vec3(0.0);
        for (int k = 0; k < 4; ++k) {
            float o = float(k) * 0.012 * (0.3 + d);
            vec2 rq = vec2(p.x + rip * 0.01 * (1.0 + d * 4.0), horizon + d * 0.9 + o);
            float m;
            vec3 cc = city(rq, horizon, T, m);
            rc += mix(sky(rq, horizon, swell), cc, m);
        }
        rc *= 0.25;
        col = rc * vec3(0.6, 0.66, 0.85) * (0.85 + 0.3 * abs(rip) * 2.0);
        col *= smoothstep(0.6, 0.0, d) * 0.6 + 0.4;
        // The boat: a small dark hull with a lamp, drawing a line of light.
        float bx = mod(T * 0.02 + 0.3, 2.4) - 1.2;
        vec2 bq = p - vec2(bx * aspect * 0.5, horizon - 0.2);
        float hull = step(abs(bq.x), 0.035) * step(abs(bq.y), 0.006);
        col = mix(col, vec3(0.02), hull);
        col += vec3(1.0, 0.85, 0.6) * exp(-dot(bq - vec2(0.02, 0.01), bq - vec2(0.02, 0.01)) * 30000.0) * 1.5;
        float wake = exp(-abs(bq.y + 0.004) * 400.0) * smoothstep(0.0, -0.4, bq.x) * exp(bq.x * 3.0) * step(bq.x, -0.03);
        col += vec3(0.8, 0.85, 1.0) * wake * 0.3;
    }

    // The bridge in front: a shallow arch with a string of round lamps.
    {
        float by = horizon + 0.035 - 0.03 * (p.x / aspect) * (p.x / aspect) * 4.0;
        float deck = smoothstep(0.004, 0.0, abs(p.y - by) - 0.004);
        col = mix(col, vec3(0.03, 0.03, 0.05), deck);
        float lx = fract(p.x * 18.0) - 0.5;
        float lamp = exp(-(lx * lx * 900.0 + (p.y - by - 0.006) * (p.y - by - 0.006) * 60000.0));
        col += vec3(1.0, 0.8, 0.5) * lamp * 1.2;
        // Their reflections: vertical smears.
        float ry = horizon - (by - horizon) - 0.01;
        col += vec3(1.0, 0.75, 0.45) * exp(-lx * lx * 700.0) * exp(-max(ry - p.y, 0.0) * 12.0) * step(p.y, ry) * 0.25 * (0.6 + 0.4 * noise2(vec2(p.x * 40.0, p.y * 200.0 - T)));
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file KarstPeaksMist.frag
 * @brief KARST PEAKS MIST: the tower karst of Guilin at dawn -- row behind
 * row of steep, rounded limestone peaks, each range paler and bluer than
 * the one before, with bands of mist lying between them.  A calm river
 * winds through the foreground mirroring the peaks, and a bamboo raft with
 * a fisherman and his lamp drifts slowly across it.  The morning sun glows
 * through the mist behind the ranges.  The mist drifts and the raft moves
 * at their own gentle pace; the music is the light.
 *
 * Audio Reactivity:
 *   audioSwell  -> the sun's glow in the mist (slow)
 *   audioKick   -> the fisherman's lamp brightens (light only)
 *   audioLevel  -> brightness
 *   audioChromaHue -> photo tint of the dawn colours
 *   sceneTime / sceneAdvance -> mist drift, raft, ripples (continuous)
 *
 * Per-activation variety: rangesP (how many ranges), mistP, hueP.
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
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float rangesP;
uniform float mistP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
    return v;
}

// Skyline of one range of tower karst: steep round-topped cones, smooth-
// maxed together.  x in screen units, L = layer (0 far).
float karst(float x, float L)
{
    float h = -1.0;
    float cellW = 0.16 + 0.05 * L;
    float ci = floor(x / cellW);
    for (int k = -2; k <= 2; ++k) {
        float c = ci + float(k);
        float cx = (c + 0.3 + 0.4 * hash11(c * 1.7 + L * 13.0)) * cellW;
        float ht = 0.08 + 0.2 * hash11(c * 3.1 + L * 7.0);
        float w = cellW * (0.35 + 0.25 * hash11(c * 5.3 + L));
        float dx = (x - cx) / w;
        // A steep dome: sides nearly vertical low down, rounded on top.
        float ex = 1.6 + 1.6 * hash11(c * 9.7 + L * 3.0);
        float peak = ht * (1.0 - pow(clamp(abs(dx), 0.0, 1.0), ex)) * step(abs(dx), 1.0);
        peak += 0.01 * (fbm(vec2(x * 30.0, L)) - 0.5) * step(abs(dx), 1.0);
        h = max(h, peak);
    }
    return h;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    int nR = 4 + int(clamp(rangesP, 0.0, 1.0) * 2.99);
    float mistAmt = 0.6 + 0.6 * clamp(mistP, 0.0, 1.0);

    float water = -0.2;
    vec3 tint = mix(vec3(1.0), imgPalette(0.08 + hue * 0.159) * 1.3, 0.12);
    vec2 sunP = vec2(0.28, 0.2);

    // Dawn sky: pale peach at the horizon, soft blue above, sun behind mist.
    vec3 sky = mix(vec3(1.0, 0.86, 0.72), vec3(0.62, 0.72, 0.85), smoothstep(0.0, 0.45, p.y));
    sky += vec3(1.0, 0.85, 0.6) * exp(-length(p - sunP) * 3.5) * (0.35 + 0.35 * swell);
    sky += vec3(1.0, 0.95, 0.85) * smoothstep(0.05, 0.035, length(p - sunP)) * 0.5;

    // Draw one pixel of the landscape at screen point q (used for the view
    // and, mirrored, for the river).
    vec3 col = sky;
    vec3 mistC = mix(vec3(0.95, 0.9, 0.86), vec3(1.0, 0.88, 0.75), exp(-abs(p.x - sunP.x) * 2.0));
    float depthNear = 1.0;
    for (int L = 0; L < 6; ++L) {
        if (L >= nR) break;
        float fl = float(L);
        float t = fl / float(nR - 1);                            // 0 far .. 1 near
        float base = water + 0.2 - 0.18 * t;                     // ranges stack downward as they come near
        float scale = 0.55 + 0.9 * t;
        float h = karst(p.x / scale + fl * 3.7, fl) * scale;
        if (p.y < base + h) {
            // Rock: dark green-grey near, paler blue-grey far; lit on the sun side.
            vec3 rock = mix(vec3(0.66, 0.72, 0.82), vec3(0.2, 0.3, 0.22), t);
            float side = smoothstep(-0.05, 0.05, (p.x - sunP.x) * -1.0);
            rock *= 0.85 + 0.25 * side * (1.0 - t * 0.5);
            // Vegetation texture on the near ranges.
            rock *= 1.0 - 0.25 * t * fbm(p * vec2(60.0, 40.0) + fl);
            // Limestone cliffs: vertical streaks and pale bare rock between the green.
            float cliff = fbm(vec2(p.x * 28.0 + fl * 9.0, p.y * 5.0));
            rock = mix(rock, mix(vec3(0.55, 0.55, 0.5), mistC, 1.0 - t), smoothstep(0.55, 0.75, cliff) * 0.45 * t);
            rock *= 0.85 + 0.3 * smoothstep(0.0, 0.25, p.y - base);
            // Aerial perspective toward the mist colour.
            rock = mix(rock, mistC, (1.0 - t) * 0.55);
            col = rock;
        }
        // Mist lying at the foot of this range (drifting).
        float my = base + 0.02;
        float mb = smoothstep(0.07, 0.0, abs(p.y - my) - 0.01) * smoothstep(0.35, 0.75, fbm(vec2(p.x * 3.0 + T * 0.01 * (1.0 + fl * 0.3) + fl * 5.0, p.y * 8.0)));
        col = mix(col, mistC, clamp(mb * mistAmt * (0.6 + 0.4 * (1.0 - t)), 0.0, 1.0));
    }
    col *= tint;

    // The river: a calm mirror with slow ripples and the reflected ranges
    // (the sky reflected, darkened a little, broken by ripple lines).
    if (p.y < water) {
        float d = water - p.y;
        float rip = noise2(vec2(p.x * 25.0, d * 160.0 - T * 0.6)) - 0.5;
        vec2 rp = vec2(p.x + rip * 0.004 * (1.0 + d * 8.0), water + d);
        // Recompute the landscape at the mirrored point.
        vec3 rc = mix(vec3(1.0, 0.86, 0.72), vec3(0.62, 0.72, 0.85), smoothstep(0.0, 0.45, rp.y));
        rc += vec3(1.0, 0.85, 0.6) * exp(-length(rp - sunP) * 3.5) * (0.35 + 0.35 * swell);
        for (int L = 0; L < 6; ++L) {
            if (L >= nR) break;
            float fl = float(L);
            float t = fl / float(nR - 1);
            float base = water + 0.2 - 0.18 * t;
            float scale = 0.55 + 0.9 * t;
            // Each range mirrors about its own foot: a far range's reflection
            // begins below its base, where the nearer land and water hide
            // its lower part.
            float h = karst(rp.x / scale + fl * 3.7, fl) * scale;
            if (base - (water - d) < h) {
                vec3 rock = mix(vec3(0.66, 0.72, 0.82), vec3(0.2, 0.3, 0.22), t);
                rock = mix(rock, mistC, (1.0 - t) * 0.55);
                rc = rock;
            }
        }
        rc *= tint * vec3(0.8, 0.86, 0.9);
        rc += vec3(1.0) * pow(max(rip, 0.0), 3.0) * 0.4 * exp(-abs(p.x - sunP.x) * 3.0);
        col = rc;
        // Banks: a dark line of reeds along the water's edge.
        col = mix(col, vec3(0.08, 0.12, 0.08), smoothstep(0.004, 0.0, d - 0.003 - 0.004 * noise2(vec2(p.x * 40.0, 1.0))));
    }

    // The bamboo raft with the fisherman and his lamp, drifting across.
    {
        float rx = mod(T * 0.006 + 0.3, 1.6) - 0.8;
        vec2 rq = p - vec2(rx * aspect * 0.7, water - 0.12);
        float raft = step(abs(rq.x), 0.07) * step(abs(rq.y), 0.006);
        float man = step(length((rq - vec2(0.02, 0.035)) * vec2(1.0, 0.45)), 0.018);
        float hat = step(abs(rq.y - 0.07), 0.006 - abs(rq.x - 0.02) * 0.25) * step(abs(rq.x - 0.02), 0.03);
        float pole = step(abs(rq.x + 0.04 + (rq.y - 0.03) * 0.5), 0.0016) * step(abs(rq.y - 0.03), 0.06);
        float sil = clamp(raft + man + hat + pole, 0.0, 1.0);
        col = mix(col, vec3(0.05, 0.05, 0.06), sil);
        vec2 lq = rq - vec2(0.06, 0.03);
        float lamp = exp(-dot(lq, lq) * 8000.0);
        col += vec3(1.0, 0.7, 0.3) * (lamp * 1.5 + exp(-dot(lq, lq) * 400.0) * 0.12) * (0.8 + 0.8 * clamp(audioKick, 0.0, 1.0));
        // Its wake and reflection.
        vec2 wq = rq + vec2(0.0, 0.02);
        col += vec3(1.0, 0.75, 0.4) * exp(-(wq.x * wq.x * 400.0 + wq.y * wq.y * 20000.0)) * 0.15;
    }

    col *= 0.92 + 0.16 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

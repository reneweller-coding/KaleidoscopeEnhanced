#version 330 core
out vec4 fragColor;
/**
 * @file SpirographGearDraw.frag
 * @brief SPIROGRAPH GEAR DRAW: the toy, in gel-pen neon on dark paper.  A
 * translucent gear rolls inside a toothed ring, the pen in one of its holes
 * drawing a hypotrochoid in glowing ink; when the figure closes, the next
 * one begins with another gear and another colour, and the earlier figures
 * stay on the paper, slowly fading, so the sheet is always a layered
 * rosette of several drawings.  The gear rolls on the scene clock; the pen
 * glows with the kick, the ink with the harmony.
 *
 * The curve is found analytically: |P(t)|^2 of a hypotrochoid depends only
 * on cos(k t), so for each pixel the few parameters at its radius are
 * solved directly (2p candidates for a ratio p/q) instead of sampling the
 * whole curve.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the rolling gear and the pen (continuous)
 *   audioChroma[12] -> ink brightness (light)
 *   audioKick       -> pen light (light)
 *   audioHigh       -> gear teeth glint (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: ratioP (first gear), holeP (pen offset), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ratioP;
uniform float holeP;
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
vec3 spectral(float x)
{
    return clamp(abs(fract(x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

// Gear ratios R/r = p/q (lobes p, turns q): the figures a 96-tooth ring makes.
vec2 ratioOf(float i)
{
    int k = int(mod(i, 10.0));
    if (k == 0) return vec2(8.0, 3.0);
    if (k == 1) return vec2(12.0, 5.0);
    if (k == 2) return vec2(16.0, 7.0);
    if (k == 3) return vec2(8.0, 5.0);
    if (k == 4) return vec2(5.0, 2.0);
    if (k == 5) return vec2(7.0, 3.0);
    if (k == 6) return vec2(12.0, 7.0);
    if (k == 7) return vec2(9.0, 4.0);
    if (k == 8) return vec2(10.0, 3.0);
    return vec2(11.0, 4.0);
}

vec2 hypo(float t, float R, float r, float d)
{
    float k = (R - r) / r;
    return vec2((R - r) * cos(t) + d * cos(k * t), (R - r) * sin(t) - d * sin(k * t));
}

// Distance from p to the hypotrochoid, and the parameter of the nearest
// point (in 0..2 pi q).  Only parameters <= tMax count (the drawn part).
vec2 curveDist(vec2 p, float R, float r, float d, float P, float Q, float tMax)
{
    float A = (R - r) * (R - r) + d * d;
    float B = 2.0 * (R - r) * d;
    float k = P / Q;                                     // = R / r
    float c = clamp((dot(p, p) - A) / B, -1.0, 1.0);
    float ac = acos(c);
    float best = 1e9, bt = 0.0;
    for (int m = 0; m < 16; ++m) {
        if (float(m) >= P) break;
        for (int sg = 0; sg < 2; ++sg) {
            float kt = ((sg == 0) ? ac : -ac) + 6.2831853 * float(m);
            float t = mod(kt / k, 6.2831853 * Q);
            if (t > tMax) continue;
            float dd = length(p - hypo(t, R, r, d));
            if (dd < best) { best = dd; bt = t; }
        }
    }
    return vec2(best, bt);
}

void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    // Start well into the second figure: an activation opens on a sheet
    // that already carries a drawing, not on an empty page.
    float T = sceneTime + sceneAdvance * 0.5 + 42.0 * 1.55;

    // Dark paper with a faint fibre.
    vec3 col = vec3(0.025, 0.03, 0.05) * (0.85 + 0.3 * noise2(p * 300.0)) + vec3(0.01) * noise2(p * 8.0);

    float R = 0.42;
    float D = 42.0;                                      // seconds per figure
    float sheet = floor(T / D);
    float prog = fract(T / D);
    float hole = 0.45 + 0.45 * clamp(holeP, 0.0, 1.0);
    float first = floor(clamp(ratioP, 0.0, 1.0) * 9.99);

    // The current figure and the two before it (fading).
    vec2 pen = vec2(0.0);
    float gearR = 0.0, gearAng = 0.0;
    vec2 gearC = vec2(0.0);
    for (int L = 2; L >= 0; --L) {
        float si = sheet - float(L);
        if (si < 0.0) continue;
        vec2 PQ = ratioOf(first + si * 3.0);
        float r = R * PQ.y / PQ.x;
        float d = r * hole * (0.8 + 0.3 * hash11(si + 3.0));
        float tMax = (L == 0) ? prog * 6.2831853 * PQ.y : 6.2831853 * PQ.y + 1.0;
        vec2 cd = curveDist(p, R, r, d, PQ.x, PQ.y, tMax);
        vec3 ink = spectral(hash11(si * 7.1) + hue * 0.159);
        ink = mix(ink, imgPalette(hash11(si * 7.1)) * 1.2, 0.2);
        float e = clamp(audioChroma[int(mod(si * 5.0, 12.0))] * 1.5, 0.0, 1.0);
        float age = (L == 0) ? 1.0 : ((L == 1) ? 0.7 - 0.3 * prog : 0.4 * (1.0 - prog));
        float line = smoothstep(0.0022, 0.0008, cd.x);
        float glow = exp(-cd.x * 160.0) * 0.35;
        // The freshest ink right behind the pen is brightest.
        float fresh = (L == 0) ? exp(-(tMax - cd.y) * 0.4) : 0.0;
        col += ink * (line + glow) * age * (0.75 + 0.4 * e + 0.8 * fresh);
        if (L == 0) {
            float t = tMax;
            pen = hypo(t, R, r, d);
            gearR = r;
            gearC = (R - r) * vec2(cos(t), sin(t));
            gearAng = -(R - r) / r * t;
        }
    }

    // The fixed ring: a translucent band with teeth on the inside.
    float rr = length(p);
    float ringAng = atan(p.y, p.x);
    float teethR = R + 0.006 * (0.5 + 0.5 * sign(sin(ringAng * 96.0)));
    float ring = smoothstep(0.002, 0.0, abs(rr - (R + 0.04)) - 0.035) * step(teethR, rr);
    col += vec3(0.5, 0.6, 0.8) * ring * 0.08;
    col += vec3(0.7, 0.8, 1.0) * exp(-abs(rr - teethR) * 900.0) * 0.25 * (1.0 + hi);

    // The rolling gear: translucent disc, teeth on its rim, a few holes, the pen.
    vec2 gq = p - gearC;
    float gd = length(gq);
    float ga = atan(gq.y, gq.x) - gearAng;
    float gTeeth = floor(96.0 * gearR / R + 0.5);
    float gRim = gearR - 0.006 * (0.5 + 0.5 * sign(sin(ga * gTeeth)));
    float disc = smoothstep(0.002, 0.0, gd - gRim);
    col = mix(col, col + vec3(0.35, 0.5, 0.75) * 0.12, disc);
    col += vec3(0.7, 0.85, 1.0) * exp(-abs(gd - gRim) * 900.0) * 0.35 * (1.0 + hi);
    for (int h = 0; h < 5; ++h) {
        float hr = gearR * (0.25 + 0.14 * float(h));
        vec2 hc = hr * vec2(cos(-gearAng + float(h) * 1.3), sin(-gearAng + float(h) * 1.3));
        col += vec3(0.6, 0.75, 1.0) * exp(-abs(length(gq - hc) - 0.006) * 900.0) * 0.25 * disc;
    }
    float pd = length(p - pen);
    col += vec3(1.0) * exp(-pd * pd * 40000.0) * (1.0 + 1.5 * kick);
    col += vec3(1.0, 0.9, 0.8) * exp(-pd * 60.0) * 0.15 * (1.0 + kick);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

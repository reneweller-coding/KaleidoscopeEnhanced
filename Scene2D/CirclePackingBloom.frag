#version 330 core
out vec4 fragColor;
/**
 * @file CirclePackingBloom.frag
 * @brief CIRCLE PACKING BLOOM: a breathing circle packing -- large discs
 * swell and shrink slowly, and in the gaps between them smaller discs
 * grow to fill every space they can, and still smaller ones in the gaps
 * between those, never overlapping, so the whole plane stays densely
 * packed while its sizes keep shifting.  Each disc holds a piece of the
 * photograph, magnified and ringed with concentric bands, with a bright
 * rim.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the discs breathe (integrated, jump-free)
 *   audioSpread     -> the big discs grow, pushing the small ones out
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> fill: cool photo tint in minor, warm in major
 *   audioRoughness  -> the concentric bands
 *   audioSwell      -> the discs' inner glow (slow)
 *
 * Knobs: sizeP (scale), gapP (gap between discs), bandP (band count), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;
uniform float audioSpread;
uniform float audioKick;
uniform float audioMode;
uniform float audioRoughness;
uniform float audioSwell;

uniform float sizeP;
uniform float gapP;
uniform float bandP;
uniform float hueP;

// ---- shared building blocks (texture pool, noise, shapes) ----
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}
// Mirror-repeat in the shader (the engine's textures mirror, the editor's
// repeat -- doing it here makes both identical).  Identity inside [0,1].
vec2 mirrorUV(vec2 uv) { return 1.0 - abs(fract(uv * 0.5) * 2.0 - 1.0); }
// The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
vec3 imgLod(vec2 uv, float lod) {
    uv = mirrorUV(uv);
    return (interpolation * textureLod(tex0, uv, lod) + (1.0 - interpolation) * textureLod(tex1, uv, lod)).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c) {
    vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), k, c.y);
}
float hue_of(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn + 1e-5;
    float h = (mx == c.r) ? (c.g - c.b) / d : (mx == c.g) ? 2.0 + (c.b - c.r) / d : 4.0 + (c.r - c.g) / d;
    return fract(h / 6.0);
}
float satOf(vec3 c) { float mx = max(c.r, max(c.g, c.b)); return (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3); }
// A glowing colour for a place: the photo's own hue where it has one, a
// slowly wandering hue field (anchored on hue0) where the photo is grey.
vec3 glowColour(vec3 photo, vec2 q, float hue0) {
    vec3 field = hsv2rgb(vec3(fract(hue0 + 0.55 * fbm3(q * 0.8) + 0.03 * audioAdvance), 0.85, 1.0));
    vec3 own = photo / max(max(photo.r, max(photo.g, photo.b)), 1e-3); own = own * own * own;
    return mix(field, own, smoothstep(0.12, 0.35, satOf(photo)));
}
// Push a colour toward full saturation, keeping its hue (neon from a photo).
vec3 neonOf(vec3 c, float k) {
    vec3 n = c / max(max(c.r, max(c.g, c.b)), 1e-3);
    return pow(n, vec3(k));
}
// The photo along an endless scroll in y without mirror seams: the photo
// repeats mirrored, so a scroll crosses a visible fold every unit; two reads
// half a period apart are cross-faded so each fold is hidden by the other.
vec3 imgScroll(vec2 uv, float lod) {
    float w = abs(fract(uv.y) - 0.5) * 2.0;           // 1 at the fold, 0 between
    w = smoothstep(0.55, 1.0, w);
    return mix(imgLod(uv, lod), imgLod(uv + vec2(0.37, 0.5), lod), w);
}
// Height from the photo: broad masses plus a share of the detail.
float texHeight(vec2 uv, float lodBroad, float detail) {
    return mix(luma(imgLod(uv, lodBroad)), luma(imgLod(uv, max(lodBroad - 3.0, 0.0))), detail);
}
// Gradient of the photo's luma at a mip level (per UV unit).
vec2 texGrad(vec2 uv, float lod) {
    float e = exp2(lod) / 1024.0;
    return vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
// Edge strength of the photo (0..1-ish) at a mip level.
float texEdge(vec2 uv, float lod) { return length(texGrad(uv, lod)) * exp2(lod) / 1024.0 * 6.0; }

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
// Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
vec2 screenP() { return (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0); }
// House finish: loudness brightness and the soft highlight roll-off.
void finish(vec3 col)
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max(col, 0.0);
    t /= 1.0 + 0.35 * max(t.r, max(t.g, t.b));
    fragColor = vec4(clamp(t, 0.0, 1.0), 1.0);
}

float gGap, gT, gSpread;
// Level-0 disc of cell c (units: level-0 cells).
vec3 disc0(vec2 c)
{
    vec2 ctr = c + 0.5 + 0.18 * (hash22(c) - 0.5);
    float h = hash21(c + 1.0);
    float r = (0.27 + 0.1 * sin(gT * (0.5 + 0.5 * h) + h * 6.28)) * (0.9 + 0.2 * gSpread);   // <= 0.407: never touches a neighbour
    return vec3(ctr, r);
}
// Distance from x to the nearest level-0 disc edge.
float gap0(vec2 x)
{
    vec2 ci = floor(x);
    float d = 9.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec3 D = disc0(ci + vec2(i, j));
        d = min(d, length(x - D.xy) - D.z);
    }
    return d;
}
// Level-1 disc (cells a third of level 0), radius limited by level 0.
vec3 disc1(vec2 c)
{
    vec2 ctr = (c + 0.5 + 0.3 * (hash22(c + 7.0) - 0.5)) / 3.0;
    float h = hash21(c + 5.0);
    float want = (0.13 + 0.04 * sin(gT * (0.7 + 0.6 * h) + h * 6.28)) / 1.0;
    float r = min(want, gap0(ctr) - gGap);
    return vec3(ctr, max(r, 0.0));
}
float gap1(vec2 x)
{
    vec2 ci = floor(x * 3.0);
    float d = 9.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec3 D = disc1(ci + vec2(i, j));
        if (D.z > 0.0) d = min(d, length(x - D.xy) - D.z);
    }
    return d;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float S = 3.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    vec2 x = p * S + vec2(0.03, 0.02) * sceneTime;
    gGap = 0.01 + 0.03 * clamp(gapP, 0.0, 1.0);
    gT = 0.25 * sceneTime + 1.5 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    // Find the disc covering x: level 0, then 1, then 2.
    vec3 D = vec3(0.0, 0.0, -1.0); float lvl = -1.0; vec2 did = vec2(0.0);
    {
        vec2 ci = floor(x);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec3 d0 = disc0(ci + vec2(i, j));
            if (length(x - d0.xy) < d0.z) { D = d0; lvl = 0.0; did = ci + vec2(i, j); }
        }
    }
    if (lvl < 0.0) {
        vec2 ci = floor(x * 3.0);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec3 d1 = disc1(ci + vec2(i, j));
            if (d1.z > 0.0 && length(x - d1.xy) < d1.z) { D = d1; lvl = 1.0; did = ci + vec2(i, j); }
        }
    }
    if (lvl < 0.0) {
        vec2 ci = floor(x * 9.0);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 c = ci + vec2(i, j);
            vec2 ctr = (c + 0.5 + 0.3 * (hash22(c + 11.0) - 0.5)) / 9.0;
            float h = hash21(c + 13.0);
            float want = 0.04 + 0.015 * sin(gT * (0.9 + 0.6 * h) + h * 6.28);
            float r = min(want, min(gap0(ctr), gap1(ctr)) - gGap * 0.6);
            if (r > 0.0 && length(x - ctr) < r) { D = vec3(ctr, r); lvl = 2.0; did = c; }
        }
    }
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv0 = p * 0.7 + 0.5;
    vec3 col = imgLod(uv0, 4.0) * 0.05;                         // the ground between discs
    if (lvl >= 0.0) {
        vec2 l = (x - D.xy) / D.z;                             // -1..1 in the disc
        float rr = length(l);
        vec2 cuv = D.xy / S * 0.7 + 0.5 + l * D.z / S * 1.4;   // the photo under the disc, magnified
        vec3 ph = imgLod(cuv, 0.8);
        vec3 tint = glowColour(imgLod(D.xy / S * 0.7 + 0.5, 4.0), did * 0.1 + lvl, hueP * 0.159 + lvl * 0.1);
        tint = mix(tint, tint * mix(vec3(0.7, 0.85, 1.15), vec3(1.15, 0.9, 0.7), mode), 0.5);
        vec3 c = mix(ph, tint * (0.3 + luma(ph) * 1.2), 0.5);
        float nb = 2.0 + 6.0 * clamp(bandP, 0.0, 1.0);
        float band = 0.5 + 0.5 * cos(rr * nb * 6.2831853 - gT * 0.5);
        c *= 1.0 - (0.1 + 0.3 * clamp(audioRoughness, 0.0, 1.0)) * band;
        c *= 0.75 + 0.35 * (1.0 - rr * rr);                    // domed
        c += tint * exp(-rr * 3.0) * (0.15 + 0.4 * swell);
        float px = fwidth(rr) * 1.2;
        float rim = exp(-(1.0 - rr) / (px * 2.0 + 0.02));
        c += mix(tint, vec3(1.0), 0.5) * rim * (0.35 + 0.8 * kick);
        float edge = smoothstep(1.0, 1.0 - px, rr);
        col = mix(col, c, edge);
    }
    finish(col);
}

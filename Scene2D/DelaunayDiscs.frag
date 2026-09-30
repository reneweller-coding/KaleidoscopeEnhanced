#version 330 core
out vec4 fragColor;
/**
 * @file DelaunayDiscs.frag
 * @brief DELAUNAY DISCS: Robert Delaunay's "simultaneous contrasts" set in
 * motion -- great discs of concentric rings, each ring split into
 * quarter-sectors of bold contrasting colour, overlap across the whole
 * picture; the rings turn slowly, neighbouring rings in opposite
 * directions, so the colours slide past each other and the discs seem to
 * pulse and vibrate; the colours are drawn from the photograph, with a
 * painted, brushed surface.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rings turn (integrated, jump-free)
 *   audioSpread     -> the discs grow (more overlap)
 *   audioMode       -> palette: cool contrasts in minor, warm in major
 *   audioKick       -> the colours brighten (light)
 *   audioRoughness  -> the brushed paint texture
 *   audioHarmChange -> the discs drift to new places (slow, smoothed)
 *
 * Knobs: ringP (ring count), sectorP (sectors per ring), photoP (photo colours), hueP.
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
uniform float audioMode;
uniform float audioKick;
uniform float audioRoughness;
uniform float audioHarmChange;

uniform float ringP;
uniform float sectorP;
uniform float photoP;
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

// One rich palette of eight Delaunay colours; the mode only warms or cools it.
vec3 delaunayPal(float k, float mode)
{
    vec3 c[8];
    c[0] = vec3(0.9, 0.25, 0.15); c[1] = vec3(1.0, 0.75, 0.15); c[2] = vec3(0.15, 0.3, 0.75); c[3] = vec3(0.3, 0.65, 0.45);
    c[4] = vec3(0.95, 0.5, 0.6);  c[5] = vec3(0.55, 0.3, 0.65); c[6] = vec3(0.95, 0.92, 0.85); c[7] = vec3(0.08, 0.08, 0.12);
    int i = int(mod(k, 8.0));
    vec3 r = c[0];
    for (int n = 1; n < 8; ++n) if (n == i) r = c[n];
    return r * mix(vec3(0.9, 0.95, 1.1), vec3(1.1, 1.0, 0.9), mode);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.1 * sceneTime + 0.8 * audioAdvance;
    float drift = 0.01 * sceneTime + 0.2 * clamp(audioHarmChange, 0.0, 1.0);
    // Discs on a jittered grid; the one whose rim is furthest away on top.
    float S = 1.6;
    vec2 g = p * S;
    vec2 gi = floor(g);
    float best = -9.0; vec2 bid = vec2(0.0); vec2 bl = vec2(0.0); float bR = 1.0;
    float grow = 0.75 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.5 + 0.3 * vec2(sin(drift + hash21(id) * 6.28), cos(drift * 0.8 + hash21(id + 1.0) * 6.28));
        float R = grow * (0.6 + 0.35 * hash21(id + 2.0));
        float d = length(g - c);
        float sc = R - d;
        if (sc > best) { best = sc; bid = id; bl = g - c; bR = R; }
    }
    // Rings and sectors of the chosen disc.
    float nR = 3.0 + 4.0 * clamp(ringP, 0.0, 1.0);
    float rr = length(bl) / bR;                                 // 0..1 inside, >1 outside (background arcs)
    float ring = floor(rr * nR);                                // (space)
    float dir = mod(ring, 2.0) < 0.5 ? 1.0 : -1.0;
    float ang = atan(bl.y, bl.x) + dir * T * (0.3 + 0.2 * hash21(bid + ring)) + hash21(bid + ring * 3.0) * 6.28;
    float nS = 2.0 * floor(1.0 + 2.0 * clamp(sectorP, 0.0, 1.0));   // 2, 4 or 6 sectors
    float sa = ang * nS / 6.2831853;
    float sector = mod(floor(sa), nS);
    float k = floor(hash21(bid * 1.7 + vec2(ring, sector)) * 8.0);
    vec3 c = delaunayPal(k, mode);
    // Photo colours mixed in.
    vec3 pc = glowColour(imgLod(vec2(hash21(bid + ring), hash21(bid + sector + 4.0)), 4.0), bid + ring, hueP * 0.159);
    c = mix(c, pc * 0.9, 0.25 * clamp(photoP, 0.0, 1.0));
    // Brushed paint: strokes following the ring direction.
    float brush = noise2(vec2(ang * 8.0, rr * 60.0) + bid * 3.0);
    c *= 0.95 + (0.04 + 0.1 * rough) * (brush - 0.5) * 2.0;
    // Thin dark lines between rings and sectors, a little irregular.
    float pxR = fwidth(rr * nR) + 1e-4;
    float ringLine = smoothstep(pxR * 1.5, 0.0, abs(fract(rr * nR) - 0.5) - 0.5 + pxR * 1.5 + 0.0);
    float pxS = length(fwidth(vec2(cos(ang), sin(ang)))) * nS / 6.2831853 * 4.0 + 1e-4;
    float secLine = smoothstep(pxS, 0.0, min(fract(sa), 1.0 - fract(sa)) * rr);
    c *= 1.0 - 0.35 * max(ringLine, secLine) * step(rr, 1.0);
    // Outside all discs: large faint arcs of the background.
    if (rr > 1.0) c = mix(c, c * 0.55, 0.5);
    finish(c * (1.0 + 0.3 * kick));
}

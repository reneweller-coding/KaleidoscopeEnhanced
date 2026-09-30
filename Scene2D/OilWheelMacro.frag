#version 330 core
out vec4 fragColor;
/**
 * @file OilWheelMacro.frag
 * @brief OIL WHEEL MACRO: a close-up of the rotating liquid wheel of a
 * vintage oil projector -- between two glass discs, coloured oils and
 * water slowly churn as the wheel turns: big lens-like bubbles of clear
 * oil drift through pools of saturated dye, stretching into long curved
 * streaks along the rotation, their edges glowing where the light
 * refracts, air bubbles glinting; the dye colours come from the
 * photograph.  The wheel's centre sits off-screen so the flow sweeps
 * across in arcs.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the wheel turns (integrated, jump-free)
 *   audioSpread     -> the oils stretch into longer streaks
 *   audioBass       -> the projector lamp (light)
 *   audioMode       -> palette: cool in minor, warm in major (tint)
 *   audioRoughness  -> the oils break into smaller droplets
 *   audioSwell      -> the lens bubbles grow (slow)
 *
 * Knobs: bubbleP (lens bubbles), dyeP (dye saturation), photoP (photo colours), hueP.
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
uniform float audioBass;
uniform float audioMode;
uniform float audioRoughness;
uniform float audioSwell;

uniform float bubbleP;
uniform float dyeP;
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

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Wheel coordinates: centre far below-left, so the flow sweeps in arcs.
    vec2 wc = vec2(-1.4, -1.6);
    vec2 d = p - wc;
    float r = length(d);
    float a = atan(d.y, d.x);
    float turn = 0.02 * sceneTime + 0.15 * audioAdvance;
    // Shear: the liquid layers turn at slightly different speeds with radius.
    float stretch = 1.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    vec2 w = vec2((a - turn * (1.0 + 0.3 * sin(r * 2.0))) * r * 2.0 / stretch, r * 2.0);
    // Dye pools: warped fbm in the rotating frame.
    vec2 q = w * 1.2;
    vec2 wa = vec2(fbm3(q), fbm3(q + 4.0));
    float dye = fbm(q * (1.0 + rough) + wa * 1.5);
    float dye2 = fbm(q * 1.3 + wa * 2.0 + 7.0);
    vec2 uv = w * 0.2 + 0.5;
    vec3 c1 = imgPalette(fract(dye * 0.7 + hueP * 0.159));
    vec3 c2 = imgPalette(fract(dye2 * 0.7 + 0.4 + hueP * 0.159));
    c1 = c1 / max(max(c1.r, max(c1.g, c1.b)), 0.2);
    c2 = c2 / max(max(c2.r, max(c2.g, c2.b)), 0.2);
    vec3 ph = glowColour(imgLod(uv, 3.0), w, hueP * 0.159);
    c1 = mix(c1, ph, 0.4 * clamp(photoP, 0.0, 1.0));
    float sat = 0.8 + 0.8 * clamp(dyeP, 0.0, 1.0);
    c1 = max(mix(vec3(luma(c1)), c1, sat), 0.0);
    c2 = max(mix(vec3(luma(c2)), c2, sat), 0.0);
    c1 *= mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.75), mode);
    c2 *= mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.75), mode);
    vec3 lamp = vec3(1.0, 0.97, 0.9) * (0.8 + 0.5 * bass);
    // Beer-Lambert mixing of the two dyes by their densities.
    float dens1 = smoothstep(0.4, 0.7, dye), dens2 = smoothstep(0.45, 0.75, dye2);
    vec3 col = lamp * mix(vec3(1.0), c1, dens1) * mix(vec3(1.0), c2, dens2 * 0.8);
    // Lens bubbles of clear oil: metaballs stretched along the flow, bright rims.
    float S = 2.0 + 2.0 * clamp(bubbleP, 0.0, 1.0);
    vec2 g = w * S;
    vec2 gi = floor(g);
    float F = 0.0; vec2 G = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        if (hash21(id) > 0.5) continue;
        vec2 c = id + 0.5 + 0.3 * (hash22(id + 1.0) - 0.5);
        float R = (0.25 + 0.15 * hash21(id + 2.0)) * (0.8 + 0.4 * swell);
        vec2 dd = g - c;
        float m = exp(-dot(dd, dd) / (R * R));
        F += m; G += m * dd / (R * R);
    }
    float fwF = fwidth(F) + 1e-3;
    float lens = smoothstep(0.5 - fwF, 0.5 + fwF, F);
    // Inside a lens: the dyes behind seen magnified (a different part of the
    // flow) and brighter; a soft darker rim where the light bends away.
    vec2 mag = -G * 0.03;
    float dyeIn = fbm(q * 0.6 + mag * 6.0 + 3.0);
    vec3 inside = lamp * mix(vec3(1.0), mix(c2, c1, smoothstep(0.35, 0.65, dyeIn)), 0.8) * 1.05;
    float rim = smoothstep(0.5, 0.58, F) * (1.0 - smoothstep(0.58, 0.9, F));
    col = mix(col, inside, lens);
    col *= 1.0 - 0.35 * rim;
    finish(col);
}

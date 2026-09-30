#version 330 core
out vec4 fragColor;
/**
 * @file TextureGasGiantDive.frag
 * @brief TEXTURE GAS GIANT DIVE: hovering over the cloud tops of a gas
 * giant -- broad bands of atmosphere race past each other in opposite
 * directions, their edges curling into festoons and eddies, great oval
 * storms turn slowly between them, and the colours (cream, ochre, rust,
 * blue-grey) are drawn from the photograph's palette; the band structure
 * stretches endlessly across the view.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the jets flow (integrated, jump-free)
 *   audioSpread     -> the jets' speed contrast
 *   audioRoughness  -> turbulence at the band edges
 *   audioKick       -> lightning in the storms (light)
 *   audioMode       -> palette warmth
 *   audioSwell      -> the storms swell (slow)
 *
 * Knobs: bandP (band count), stormP (storm size), contrastP, hueP.
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
uniform float audioRoughness;
uniform float audioKick;
uniform float audioMode;
uniform float audioSwell;

uniform float bandP;
uniform float stormP;
uniform float contrastP;
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

float gBands, gT, gShear;
// Cloud texture advected by the zonal jets (flow-map with two phases).
float clouds(vec2 x, float phaseT)
{
    float u = sin(x.y * gBands) * gShear;                      // jet speed at this latitude
    vec2 q = x - vec2(u * phaseT, 0.0);
    vec2 w = vec2(fbm3(q * 1.5), fbm3(q * 1.5 + 5.0)) - 0.5;
    return fbm(vec2(q.x * 1.2, q.y * 6.0) + w * 1.2);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gBands = 5.0 + 6.0 * clamp(bandP, 0.0, 1.0);
    gShear = 0.15 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    vec2 x = p * 1.5;
    // Storms: ovals on a jittered grid; they swirl the coordinates.
    float S = 1.2;
    vec2 g = x * vec2(S, S * 1.6);
    vec2 gi = floor(g);
    float stormSize = (0.15 + 0.15 * clamp(stormP, 0.0, 1.0)) * (0.8 + 0.4 * swell);
    float stormGlow = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        if (hash21(id) > 0.45) continue;
        vec2 c = id + 0.5 + 0.3 * (hash22(id + 1.0) - 0.5) + vec2(0.1 * sin(0.02 * sceneTime + hash21(id + 2.0) * 6.28), 0.0);   // bounded wander
        vec2 d = (g - c) / vec2(1.6, 1.0);
        float R = stormSize * (0.6 + 0.8 * hash21(id + 3.0));
        float fall = exp(-dot(d, d) / (R * R)) * smoothstep(0.95, 0.5, length(g - c));   // ends inside the 3x3 search
        float ang = fall * (3.0 + 1.5 * sin(0.1 * sceneTime + 0.5 * audioAdvance + hash21(id + 4.0) * 6.28)) * (hash21(id + 6.0) < 0.5 ? 1.0 : -1.0);   // bounded winding
        g = c + rot2(ang) * (g - c);
        stormGlow += fall * step(0.7, hash21(id + 5.0));
    }
    x = g / vec2(S, S * 1.6);
    // Flow map: two phases half a period apart, cross-faded (no smearing forever).
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    float P = 6.0;
    float ph1 = fract(T / P), ph2 = fract(T / P + 0.5);
    float c1 = clouds(x + 3.1 * floor(T / P), ph1 * P);
    float c2 = clouds(x + 3.1 * floor(T / P + 0.5) + 7.7, ph2 * P);
    float wgt = abs(ph1 * 2.0 - 1.0);                           // 1 where phase 1 is at its seam
    float cl = mix(c1, c2, wgt);
    // Band colours from the photo palette by latitude, modulated by the clouds.
    float lat = x.y * gBands / 6.2831853;
    float band = 0.5 + 0.5 * sin(x.y * gBands * 0.5 + 0.7);
    vec3 cA = imgPalette(fract(lat * 0.37 + hueP * 0.159));
    vec3 cB = imgPalette(fract(lat * 0.37 + 0.33 + hueP * 0.159));
    vec3 col = mix(cA, cB, smoothstep(0.3, 0.7, band + (cl - 0.5) * (0.8 + 0.8 * rough)));
    col = mix(col, col * mix(vec3(0.85, 0.9, 1.1), vec3(1.15, 0.95, 0.8), mode), 0.6);
    float con = 0.6 + 0.8 * clamp(contrastP, 0.0, 1.0);
    col *= 0.55 + con * 0.6 * cl;
    col += vec3(1.0, 0.95, 0.9) * smoothstep(0.65, 0.9, cl) * 0.15;
    // Lightning inside the storms.
    col += vec3(0.7, 0.8, 1.0) * stormGlow * kick * 0.6;
    finish(col);
}

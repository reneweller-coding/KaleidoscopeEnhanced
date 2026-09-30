#version 330 core
out vec4 fragColor;
/**
 * @file TextureBurrow.frag
 * @brief TEXTURE BURROW: crawling through an organic burrow -- a tunnel with
 * soft, irregular, breathing walls, its cross-section a wobbling blob
 * rather than a circle, the walls ribbed with rings like a gullet and
 * lined with the photograph, glistening wet in a light that we carry
 * with us; the passage winds and narrows and widens as we move.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the crawl (integrated, jump-free)
 *   audioSpread     -> the walls breathe wider
 *   audioBass       -> the wet glisten (light)
 *   audioMode       -> the light: cold blue in minor, warm red in major
 *   audioRoughness  -> the ribs deepen
 *   audioSwell      -> depth darkness (slow)
 *
 * Knobs: ribP (rib spacing), wobbleP (cross-section wobble), wallZoomP, hueP.
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

uniform float ribP;
uniform float wobbleP;
uniform float wallZoomP;
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
    float travel = 0.35 * sceneTime + 2.5 * audioAdvance;
    // The passage winds: shift the centre with depth-dependent offset (approx.).
    vec2 bend = 0.12 * vec2(sin(travel * 0.4), cos(travel * 0.33));
    vec2 q = p - bend * 0.5;
    float a = atan(q.y, q.x);
    vec2 cs = vec2(cos(a), sin(a));
    float r = max(length(q), 1e-4);
    // Wobbling cross-section: radius varies with angle (on the unit circle, no seam) and depth.
    float wob = 0.15 + 0.35 * clamp(wobbleP, 0.0, 1.0);
    float z = 0.5 / r;
    for (int i = 0; i < 3; ++i) {
        float wz0 = z + travel;
        float R = 1.0 + wob * (fbm3(cs * 1.5 + vec2(wz0 * 0.2, 0.0)) - 0.5) * 2.0;
        R *= 1.0 + (0.1 + 0.15 * clamp(audioSpread, 0.0, 1.0)) * sin(0.8 * sceneTime + wz0 * 0.5);
        z = 0.5 * R / r;
    }
    float wz = z + travel;
    // Ribs: rings along the depth.
    float rf = 2.0 + 3.0 * clamp(ribP, 0.0, 1.0);
    float rib = 0.5 + 0.5 * cos(wz * rf * 6.2831853 / 3.0);
    float ribD = (0.3 + 0.5 * rough) * pow(rib, 3.0);
    float zoom = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(a / 3.14159265, wz * zoom * 0.3);
    float fw = max(length(fwidth(cs)) / 3.14159265, fwidth(z) * zoom * 0.3) * 1024.0;
    vec3 wall = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    vec3 flesh = mix(vec3(0.55, 0.65, 0.85), vec3(0.95, 0.55, 0.5), mode);
    vec3 col = mix(wall, wall * flesh * 1.3, 0.5);
    // Headlamp we carry: the near wall bright, ribs shading.
    float lamp = exp(-z * (0.12 + 0.15 * swell));
    col *= (0.35 + 0.8 * lamp) * (1.0 - ribD * 0.6);
    // Wet glisten on the rib crests.
    float wet = pow(rib, 12.0) * (0.3 + 0.7 * noise2(vec2(a * 6.0, wz * 3.0)));
    col += mix(flesh, vec3(1.0), 0.6) * wet * lamp * (0.25 + 0.8 * bass);
    // Darkness in the depth, a faint glow where the passage continues.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.03, 0.0), hueP * 0.159);
    col = mix(gc * 0.05, col, exp(-z * 0.08));
    col += gc * exp(-r * 12.0) * 0.3;
    finish(col);
}

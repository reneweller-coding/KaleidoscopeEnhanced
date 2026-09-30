#version 330 core
out vec4 fragColor;
/**
 * @file TextureCoilSpring.frag
 * @brief TEXTURE COIL SPRING: flying through the inside of an endless coil
 * -- a thick helical ribbon, wrapped in the photograph, winds around us
 * turn after turn into the distance, lit from inside so its inner face
 * glows and its edges catch the light; through the gaps between the
 * turns a second, slower coil turns in the opposite direction further
 * out, and behind it a dim glow.  The coil stretches and compresses like
 * a spring as we fly.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the coils turn (integrated)
 *   audioSpread     -> the spring stretches (wider gaps)
 *   audioKick       -> the edges flash (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the glow behind (slow)
 *
 * Knobs: turnsP (turn density), widthP (ribbon width), outerP (outer coil), hueP.
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
uniform float audioPhase;
uniform float audioSpread;
uniform float audioKick;
uniform float audioMode;
uniform float audioSwell;

uniform float turnsP;
uniform float widthP;
uniform float outerP;
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

// One helical ribbon at radius R: returns (coverage, along, across) at depth z.
vec3 coil(float z, float a, float pitch, float width, float turn)
{
    float u = z / pitch - (a + turn) / 6.2831853;              // turn coordinate (continuous across the atan cut)
    float f = fract(u);
    float c = abs(f - 0.5) * 2.0;                              // 0 at the ribbon's centre line
    return vec3(c, u, f);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    vec2 cs = vec2(cos(a), sin(a));
    float travel = 0.5 * sceneTime + 3.0 * audioAdvance;
    float turn = 0.05 * sceneTime + 0.4 * audioPhase;
    float pitch = (0.5 + 0.8 * (1.0 - clamp(turnsP, 0.0, 1.0))) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0) + 0.1 * sin(0.2 * sceneTime));
    float width = 0.35 + 0.35 * clamp(widthP, 0.0, 1.0);
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.88, 0.65), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.03, 0.0), hueP * 0.159);
    // Inner coil at radius 1.
    float z1 = 0.5 / r;
    vec3 c1 = coil(z1 + travel, a, pitch, width, turn);
    float px1 = (fwidth(z1) / pitch + length(fwidth(cs)) / 6.2831853) * 2.0 + 1e-4;
    float on1 = smoothstep(width + px1, width - px1, c1.x);
    vec2 uv1 = vec2(a / 3.14159265, (z1 + travel) / pitch * 0.25);   // continuous across the atan cut
    float fw1 = max(length(fwidth(cs)) / 3.14159265, fwidth(z1) / pitch * 0.25) * 1024.0;
    vec3 rib = imgLod(uv1 + vec2(0.0, (c1.z - 0.5) * 0.1), clamp(log2(max(fw1, 1.0)), 0.0, 9.0));
    float prof = sqrt(max(0.0, 1.0 - (c1.x / width) * (c1.x / width)));
    vec3 ribC = rib * lc * (0.4 + 0.8 * prof) * exp(-z1 * 0.08);
    float edge = exp(-abs(c1.x - width) / (px1 * 1.5));
    ribC += mix(gc, vec3(1.0), 0.5) * edge * (0.25 + 1.0 * kick) * exp(-z1 * 0.08);
    // Outer coil at radius 2 (seen through the gaps), counter-rotating, slower.
    float z2 = 1.0 / r;
    vec3 c2 = coil(z2 + travel * 0.6, -a, pitch * 1.3, width, -turn * 0.7);
    float px2 = (fwidth(z2) / pitch + length(fwidth(cs)) / 6.2831853) * 2.0 + 1e-4;
    float on2 = smoothstep(width + px2, width - px2, c2.x) * clamp(outerP + 0.2, 0.0, 1.0);
    vec3 rib2 = imgLod(vec2(-a / 3.14159265, (z2 + travel * 0.6) / pitch * 0.2 + 0.5), clamp(log2(max(fw1, 1.0)) + 1.0, 0.0, 9.0));
    vec3 rib2C = rib2 * lc * 0.45 * exp(-z2 * 0.1);
    vec3 back = gc * (0.08 + 0.5 * swell) * exp(-r * 2.0);
    vec3 col = mix(back, rib2C, on2);
    col = mix(col, ribC, on1);
    col += gc * exp(-r * 14.0) * (0.4 + swell);
    finish(col);
}

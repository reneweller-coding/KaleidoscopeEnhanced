#version 330 core
out vec4 fragColor;
/**
 * @file TexturePinArt.frag
 * @brief TEXTURE PIN ART: the pin-art toy -- a dense bed of polished metal
 * pins seen from above, pushed up into a relief of the photograph (bright
 * parts stand high, dark parts sink), each pin head a small shiny dome
 * reflecting the light, the high pins casting long shadows over the low
 * ones; slow waves roll through the bed as if a hand pressed from below,
 * and the relief slowly morphs as the photo drifts.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves roll and the photo drifts (integrated)
 *   audioSpread     -> relief depth
 *   audioBass       -> a push wave from the centre (slow-smoothed light-level motion)
 *   audioKick       -> the pin heads flash (light)
 *   audioMode       -> metal: chrome in minor, brass in major
 *   audioSwell      -> the light swings lower (longer shadows, slow)
 *
 * Knobs: pinP (pin density), waveP (wave height), tintP (photo tint on the heads), hueP.
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
uniform float audioKick;
uniform float audioMode;
uniform float audioSwell;

uniform float pinP;
uniform float waveP;
uniform float tintP;
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

float gT;
float heightAt(vec2 w)
{
    vec2 uv = w * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime;
    float h = luma(imgLod(uv, 3.0));
    h += clamp(waveP, 0.0, 1.0) * 0.25 * sin(dot(w, vec2(3.0, 1.7)) - gT) * sin(dot(w, vec2(-1.3, 2.4)) + gT * 0.7);
    return h;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = 0.3 * sceneTime + 2.0 * audioAdvance;
    float S = 22.0 + 22.0 * clamp(pinP, 0.0, 1.0);
    float depth = (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    // Light direction (low when swelling -> long shadows).
    vec2 ld = normalize(vec2(-0.7, 0.6));
    float shadowLen = (0.6 + 1.2 * swell) * depth;               // in pin spacings per unit height
    vec2 g = p * S;
    // Hex packing.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(g, s) - s * 0.5;
    vec2 b = mod(g - s * 0.5, s) - s * 0.5;
    vec2 l = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = g - l;
    float h = heightAt(cid / S);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 metal = mix(vec3(0.75, 0.78, 0.82), vec3(0.85, 0.65, 0.35), mode);
    vec2 uvc = cid / S * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime;
    vec3 tint = mix(vec3(1.0), imgLod(uvc, 2.0) * 1.4 + 0.2, clamp(tintP, 0.0, 1.0));
    // Pin head dome shading.
    float rr = length(l) / 0.42;
    float px = S / resolution.y * 2.0;
    float head = smoothstep(1.0 + px, 1.0 - px, rr);
    vec3 n = normalize(vec3(l / 0.42 * 0.9, sqrt(max(0.0, 1.0 - rr * rr))));
    vec3 L = normalize(vec3(ld, 0.6 - 0.3 * swell));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    vec3 headC = metal * tint * (0.2 + 0.95 * diff) * (0.3 + 1.1 * h) + vec3(1.0) * spec * (0.5 + 1.2 * kick);
    // The bed between the pins: in shadow; plus shadows cast by higher
    // neighbours toward -ld.
    float shade = 1.0;
    for (int k = 1; k <= 3; ++k) {
        vec2 sp = cid / S + ld * float(k) / S;                   // neighbour toward the light
        float hn = heightAt(sp);
        float drop = (hn - h) * depth * shadowLen * S * 0.1 - float(k) * 0.35;
        shade *= 1.0 - 0.45 * smoothstep(0.0, 0.3, drop);
    }
    vec3 bed = vec3(0.03, 0.03, 0.035) + metal * 0.08 * h;
    vec3 col = mix(bed, headC * shade, head);
    // Faint glow at the tallest pins.
    vec3 gc = glowColour(imgLod(uvc, 5.0), cid * 0.02, hueP * 0.159);
    col += gc * head * smoothstep(0.75, 1.0, h) * 0.15;
    finish(col);
}

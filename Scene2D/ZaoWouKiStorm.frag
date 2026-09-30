#version 330 core
out vec4 fragColor;
/**
 * @file ZaoWouKiStorm.frag
 * @brief ZAO WOU-KI STORM: a lyrical abstract painting in motion -- vast
 * masses of thinned oil colour swirl like a storm over the sea, deep blues
 * and near-blacks torn open by a luminous core of light, washes bleeding
 * into each other with soft edges, and across them fine, nervous
 * calligraphic strokes and spatters; the painting keeps churning slowly,
 * the light core wandering.  The colours come from the photograph.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the masses churn (integrated, jump-free)
 *   audioSpread     -> how far the light tears the dark open
 *   audioRoughness  -> the calligraphic strokes grow nervous
 *   audioKick       -> the core flares (light)
 *   audioMode       -> the light: cold white in minor, golden in major
 *   audioSwell      -> the washes brighten (slow)
 *
 * Knobs: churnP (warp strength), strokeP (stroke density), photoP (photo colours), hueP.
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

uniform float churnP;
uniform float strokeP;
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
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    float churn = 0.8 + 1.2 * clamp(churnP, 0.0, 1.0);
    // Domain-warped masses.
    vec2 q = p * 1.3;
    vec2 w1 = vec2(fbm(q + vec2(T, 0.0)), fbm(q + vec2(5.2, 1.3) - vec2(0.0, T)));
    vec2 w2 = vec2(fbm(q + churn * w1 + vec2(1.7, 9.2) + T * 0.7), fbm(q + churn * w1 + vec2(8.3, 2.8) - T * 0.5));
    float mass = fbm(q + churn * w2);
    // The light core wandering; it tears the dark open along the warp.
    vec2 core = 0.35 * vec2(sin(0.017 * sceneTime + 0.1 * audioAdvance), cos(0.013 * sceneTime));
    float open = 0.12 + 0.25 * clamp(audioSpread, 0.0, 1.0);
    float light = smoothstep(open + 0.3, 0.0, length(p - core + 0.25 * (w2 - 0.5)) - 0.4 * (mass - 0.5));
    // Palette: the photo's colours folded into a storm scheme.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 dark = mix(vec3(0.01, 0.03, 0.09), vec3(0.03, 0.03, 0.07), mode);
    vec3 midC = mix(vec3(0.08, 0.22, 0.5), vec3(0.15, 0.3, 0.45), mode);
    vec3 lightC = mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.85, 0.55), mode);
    vec2 uv = p * 0.5 + 0.5 + 0.2 * (w2 - 0.5);
    vec3 ph = imgLod(uv, 4.0);
    vec3 pcol = glowColour(ph, w1 * 2.0, hueP * 0.159);
    midC = mix(midC, pcol * 0.5, 0.3 * clamp(photoP, 0.0, 1.0));
    vec3 col = mix(dark, midC, smoothstep(0.4, 0.75, mass) * (0.6 + 0.4 * swell));
    col = mix(col, mix(midC * 1.6, lightC, smoothstep(0.3, 0.9, light)), smoothstep(0.0, 0.8, light));
    col += lightC * pow(light, 4.0) * (0.2 + 0.6 * kick);
    // Wash edges: a slightly darker rim where one wash meets the next.
    float wash = abs(fract(mass * 4.0 + 0.2 * w1.x) - 0.5);
    col *= 0.88 + 0.12 * smoothstep(0.0, 0.08, wash);
    // Calligraphic strokes: thin isolines of a second warped field, broken.
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sf = fbm(p * 2.5 + 2.0 * w2 + vec2(0.0, 0.3 * T) + rough * 0.15 * vec2(noise2(p * 30.0 + T * 20.0)));
    float e = 0.004;
    float sfx = fbm((p + vec2(e, 0.0)) * 2.5 + 2.0 * w2 + vec2(0.0, 0.3 * T) + rough * 0.15 * vec2(noise2((p + vec2(e, 0.0)) * 30.0 + T * 20.0)));
    float sfy = fbm((p + vec2(0.0, e)) * 2.5 + 2.0 * w2 + vec2(0.0, 0.3 * T) + rough * 0.15 * vec2(noise2((p + vec2(0.0, e)) * 30.0 + T * 20.0)));
    float gl = length(vec2(sfx - sf, sfy - sf)) / e / resolution.y + 1e-5;
    float lines = 0.0;
    for (int k = 0; k < 3; ++k) {
        float lv = 0.35 + 0.12 * float(k);
        float dpx = abs(sf - lv) / gl;
        float wdt = 1.2 + 3.5 * noise2(p * 4.0 + float(k) * 7.0);   // brush pressure
        float on = smoothstep(0.45, 0.6, noise2(p * 3.0 + float(k) * 3.3 + T)) * (0.4 + 0.6 * clamp(strokeP, 0.0, 1.0));
        lines = max(lines, smoothstep(wdt + 1.0, wdt - 0.5, dpx) * on);
    }
    vec3 ink = mix(dark * 0.5, lightC, light);
    col = mix(col, ink, lines * 0.85);
    // Spatters: round drops of thinned paint.
    vec2 sg = p * 18.0 + 3.0;
    vec2 si = floor(sg), sfr = fract(sg);
    vec2 sc = 0.2 + 0.6 * hash22(si);
    float sr = 0.05 + 0.12 * hash21(si + 4.0);
    float sp = smoothstep(sr, sr * 0.6, length(sfr - sc)) * step(hash21(si + 9.0), 0.08 * (0.3 + clamp(strokeP, 0.0, 1.0)));
    col = mix(col, ink * 0.8, sp * 0.7);
    // Canvas weave, faint.
    col *= 0.96 + 0.04 * noise2(gl_FragCoord.xy * 0.7);
    finish(col);
}

#version 330 core
out vec4 fragColor;
/**
 * @file SaltWatercolorBlooms.frag
 * @brief SALT WATERCOLOR BLOOMS: salt sprinkled into wet watercolour -- in a
 * dark, saturated wash, each salt grain draws the pigment away and leaves
 * a pale starburst: tiny feathery crystals of light spread across the
 * colour like frost flowers, clustering where the salt fell thickly,
 * while the wash itself shifts slowly between the photograph's colours.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the washes drift, the bursts grow (integrated, jump-free)
 *   audioSpread     -> burst size
 *   audioKick       -> the bursts brighten (light)
 *   audioMode       -> the wash: cool deep blues in minor, warm magentas in major (tint)
 *   audioRoughness  -> the feathering of the bursts
 *   audioSwell      -> wash saturation (slow)
 *
 * Knobs: saltP (salt density), washP (wash darkness), photoP (photo colours in the wash), hueP.
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

uniform float saltP;
uniform float washP;
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
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    // The wash: soft variations of two or three pigments.
    vec2 uv = p * 0.4 + 0.5 + 0.1 * vec2(fbm3(p + T), fbm3(p - T + 3.0));
    vec3 ph = imgLod(uv, 4.0);
    vec3 pig = mix(mix(vec3(0.1, 0.2, 0.55), vec3(0.55, 0.1, 0.4), mode), glowColour(ph, p, hueP * 0.159) * 0.7, 0.5 * clamp(photoP, 0.0, 1.0));
    pig = max(mix(vec3(luma(pig)), pig, 0.8 + 0.6 * swell), 0.0);
    float washV = 0.75 + 0.25 * fbm(p * 2.0 + vec2(T, 0.0));
    vec3 col = mix(vec3(0.95, 0.93, 0.88), pig, clamp(washV * (0.75 + 0.35 * clamp(washP, 0.0, 1.0)), 0.0, 1.0));
    // Salt bursts: jittered grains; each a feathery starburst of paler colour.
    float burstR = 0.3 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    float clusterF = (0.25 + 0.75 * smoothstep(0.3, 0.7, fbm3(p * 1.5 + 9.0))) * (0.3 + 0.7 * clamp(saltP, 0.0, 1.0));
    float bleach = 0.0;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        float S = 6.0 + 6.0 * fl;
        vec2 g = p * S + fl * 7.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl) > clusterF) continue;
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl * 3.0);
            vec2 d = g - c;
            float r = length(d);
            float grow = smoothstep(0.0, 1.0, fract(T * 2.0 + hash21(id + 5.0)));
            float life = fract(T * 2.0 + hash21(id + 5.0));
            float R = burstR * (0.5 + 0.5 * hash21(id + 2.0)) * (0.3 + 0.7 * grow);
            float ang = atan(d.y, d.x);
            vec2 u = vec2(cos(ang), sin(ang));
            // Feathery arms: noise on the unit circle (seamless).
            float arms = 0.7 + 0.3 * (fbm3(u * (3.0 + 4.0 * rough) + id) - 0.5) * 2.0 + 0.15 * noise2(u * 14.0 + id * 3.0);
            float b = smoothstep(R * arms, R * arms * 0.3, r);
            b *= smoothstep(1.0, 0.8, life) * smoothstep(0.0, 0.05, life);
            bleach = max(bleach, b * (0.7 - 0.2 * fl));
        }
    }
    // Pale starbursts with a slightly darker rim (pigment pushed outward).
    vec3 pale = mix(col, vec3(0.95, 0.93, 0.88), 0.75);
    col = mix(col, pale * (1.0 + 0.3 * kick), bleach);
    col *= 1.0 - 0.15 * smoothstep(0.0, 0.2, bleach) * (1.0 - smoothstep(0.2, 0.5, bleach));
    finish(col);
}

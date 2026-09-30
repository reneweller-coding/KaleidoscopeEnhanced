#version 330 core
out vec4 fragColor;
/**
 * @file TextureUVBlacklight.frag
 * @brief TEXTURE UV BLACKLIGHT: the photograph under a black light -- the
 * picture itself sinks into a deep violet dark, while fluorescent paint
 * glows on it: contour lines of the photo's brightness, drawn in neon pink,
 * acid green, orange and cyan, creep slowly across the picture as their
 * levels rise and fall (like a psychedelic black-light poster that keeps
 * redrawing itself), the brightest parts of the photo fluoresce blue-white,
 * and specks of fluorescent lint float in the air.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the contour levels creep (integrated, jump-free)
 *   audioSpread     -> how many contour lines glow
 *   audioKick       -> the paint flares (light)
 *   audioHigh       -> the floating lint sparkles (light)
 *   audioMode       -> palette: cool (cyan/violet/green) in minor, hot (pink/orange/yellow) in major
 *   audioSwell      -> the photo's own fluorescence (slow)
 *
 * Knobs: lineP (line width), detailP (how detailed the contours are), lintP, hueP.
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
uniform float audioHigh;
uniform float audioMode;
uniform float audioSwell;

uniform float lineP;
uniform float detailP;
uniform float lintP;
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

vec3 uvNeon(float k, float mode)
{
    vec3 hot[4]; vec3 cold[4];
    hot[0] = vec3(1.0, 0.1, 0.6); hot[1] = vec3(1.0, 0.5, 0.05); hot[2] = vec3(0.95, 1.0, 0.1); hot[3] = vec3(0.3, 1.0, 0.2);
    cold[0] = vec3(0.1, 0.9, 1.0); cold[1] = vec3(0.6, 0.2, 1.0); cold[2] = vec3(0.3, 1.0, 0.3); cold[3] = vec3(1.0, 0.2, 0.8);
    int i = int(mod(k, 4.0));
    vec3 a = hot[0], b = cold[0];
    if (i == 1) { a = hot[1]; b = cold[1]; } else if (i == 2) { a = hot[2]; b = cold[2]; } else if (i == 3) { a = hot[3]; b = cold[3]; }
    return mix(b, a, mode);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.75 + 0.5 + vec2(0.005, 0.003) * sceneTime;
    vec3 ph = imgLod(uv, 0.5);
    float lodC = 5.0 - 1.8 * clamp(detailP, 0.0, 1.0);
    float l = luma(imgLod(uv, lodC)) + 0.08 * (fbm3(p * 2.0 + 0.02 * sceneTime) - 0.5);
    float e = exp2(lodC) / 1024.0;
    vec2 gl = vec2(luma(imgLod(uv + vec2(e, 0.0), lodC)) - luma(imgLod(uv - vec2(e, 0.0), lodC)),
                   luma(imgLod(uv + vec2(0.0, e), lodC)) - luma(imgLod(uv - vec2(0.0, e), lodC))) / (2.0 * e) * 0.75;
    float gpx = length(gl) / resolution.y + 1e-4;              // luma change per pixel
    // The picture under UV: deep violet.
    vec3 col = vec3(0.09, 0.03, 0.2) * luma(ph) * 1.4 + vec3(0.02, 0.0, 0.05);
    // Fluorescent whites.
    col += vec3(0.55, 0.65, 1.0) * smoothstep(0.55, 0.95, luma(ph)) * (1.0 - satOf(ph)) * (0.25 + 0.5 * swell);
    // Neon contour lines, their levels creeping.
    float nL = 2.5 + 3.5 * clamp(audioSpread, 0.0, 1.0);
    float lv = l * nL + 0.15 * sceneTime + 1.2 * audioAdvance;
    float k = floor(lv + 0.5);                                   // nearest level (in space, not time)
    float dl = abs(lv - k) / nL;                                 // luma distance to it
    float dpx = dl / gpx;                                        // in pixels
    float w = 1.2 + 3.0 * clamp(lineP, 0.0, 1.0);
    vec3 nc = mix(uvNeon(k, mode), glowColour(imgLod(uv, 6.0), p, hueP * 0.159), 0.15);
    float line = smoothstep(w + 1.0, w - 1.0, dpx);
    float halo = exp(-dpx / (w * 4.0));
    col += nc * (line * 1.3 + halo * 0.35) * (0.8 + 0.8 * kick);
    col = mix(col, nc * 1.6 + 0.3, line * 0.35);
    // Floating fluorescent lint: round soft specks drifting.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p * (9.0 + 6.0 * fl) + vec2(0.1 * sceneTime, -0.06 * sceneTime) * (1.0 + fl) + fl * 5.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl * 3.0);
        float on = step(hash21(gi + 9.0 + fl), 0.2 + 0.5 * clamp(lintP, 0.0, 1.0));
        float d = length(gf - c);
        float tw = 0.4 + 0.6 * sin(sceneTime * (1.0 + hash21(gi)) + hash21(gi + 1.0) * 6.28);
        col += on * uvNeon(floor(hash21(gi + 4.0) * 4.0), mode) * (smoothstep(0.06, 0.01, d) * 0.9 + exp(-d * 14.0) * 0.2) * (0.3 + 0.7 * hi) * tw;
    }
    finish(col);
}

#version 330 core
out vec4 fragColor;
/**
 * @file PhotoWovenThreads.frag
 * @brief PHOTO WOVEN THREADS: the photograph woven into cloth -- the warp
 * threads carry the picture, the weft threads carry a second, shifted
 * view of it, and they pass over and under each other in a twill, each
 * thread round and shaded like real yarn with a fine fibre texture; the
 * cloth billows in slow waves, the threads ripple, and the picture
 * emerges from the interlacing.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pictures drift through the cloth (integrated)
 *   audioSpread     -> the billowing waves
 *   audioKick       -> the silk sheen flares (light)
 *   audioMode       -> the weft: complementary colours in minor, the same photo in major (blend)
 *   audioRoughness  -> the fibre fuzz
 *   audioSwell      -> the threads' sheen (slow)
 *
 * Knobs: threadP (thread count), twillP (twill step), gapP (gaps between threads), hueP.
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
uniform float audioRoughness;
uniform float audioSwell;

uniform float threadP;
uniform float twillP;
uniform float gapP;
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
// The photo read through a turning kaleidoscope -- the trick of the original
// Kaleidoscope/Tunnel scenes: uv is folded into mirrored wedges around a
// slowly wandering centre and turned with time and the integrated audio
// phase, so the texture itself keeps changing (detailed, continuous, never
// repeating).  The fold is continuous at every wedge border and at the atan
// cut (sides is a whole number); the explicit mip level avoids seams.
vec2 kaleidoUV(vec2 uv, float sides)
{
    vec2 c = vec2(0.5) + 0.2 * vec2(sin(0.0107 * sceneTime), cos(0.0131 * sceneTime));
    vec2 d = uv - c;
    float r = length(d);
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    a += 0.03 * sceneTime + 0.25 * audioPhase;
    return c + r * vec2(cos(a), sin(a));
}
vec3 imgK(vec2 uv, float lod) { return imgLod(kaleidoUV(uv, 6.0), lod); }
// Other channels than RGB: the photo's structure, read through the kaleidoscope.
// Gradient / edges / Laplacian are rotation invariant in magnitude, so they
// stay seamless across the mirror folds (direction-based colours would not).
vec2 imgKGrad(vec2 uv, float lod)
{
    float e = exp2(lod) / 1024.0 + 0.001;
    return vec2(luma(imgK(uv + vec2(e, 0.0), lod)) - luma(imgK(uv - vec2(e, 0.0), lod)),
                luma(imgK(uv + vec2(0.0, e), lod)) - luma(imgK(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
float imgKEdge(vec2 uv, float lod) { return length(imgKGrad(uv, lod)) * (exp2(lod) / 1024.0 + 0.001) * 6.0; }
float imgKLap(vec2 uv, float lod)
{
    float e = exp2(lod) / 1024.0 + 0.001;
    float c = luma(imgK(uv, lod));
    return (luma(imgK(uv + vec2(e, 0.0), lod)) + luma(imgK(uv - vec2(e, 0.0), lod)) +
            luma(imgK(uv + vec2(0.0, e), lod)) + luma(imgK(uv - vec2(0.0, e), lod)) - 4.0 * c) * 4.0;
}
// Embossed relief of the kaleidoscoped photo, lit from a direction.
float imgKRelief(vec2 uv, float lod, vec2 lightDir)
{
    vec2 g = imgKGrad(uv, lod) * (exp2(lod) / 1024.0 + 0.001) * 8.0;
    return clamp(0.5 + dot(g, normalize(lightDir)), 0.0, 1.0);
}
// A second continuous transform: the photo wound into a log-polar spiral that
// zooms forever (Droste-like).  angle/pi spans one mirror period, so the atan
// cut is seamless; the zoom runs on integrated time, never jumps.
vec2 spiralUV(vec2 uv, float arms, float zoom)
{
    vec2 d = uv - 0.5;
    float r = max(length(d), 1e-4);
    float a = atan(d.y, d.x);
    // Both coordinates jump by whole mirror periods (2) at the cut: the shear
    // a/pi jumps by 2, and a/pi*arms/2 by arms (arms must be even).
    return vec2(log(r) * 0.5 - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5);
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
    // Billowing cloth.
    float bill = (0.01 + 0.03 * clamp(audioSpread, 0.0, 1.0));
    vec2 wv = vec2(sin(p.y * 3.0 + 0.3 * sceneTime), sin(p.x * 2.5 - 0.25 * sceneTime));
    vec2 q = p + bill * wv;
    float shadeB = 1.0 + 3.0 * bill * (cos(p.y * 3.0 + 0.3 * sceneTime) + cos(p.x * 2.5 - 0.25 * sceneTime)) * 0.5;
    float N = 18.0 + 30.0 * clamp(threadP, 0.0, 1.0);
    vec2 g = q * N;
    vec2 gi = floor(g);
    vec2 f = fract(g) - 0.5;
    // Twill: warp over weft when (x + y * step) mod 4 < 2.
    float st = floor(1.0 + 2.0 * clamp(twillP, 0.0, 1.0));
    float warpOver = step(mod(gi.x + gi.y * st, 4.0), 1.5);
    float gap = 0.05 + 0.2 * clamp(gapP, 0.0, 1.0);
    // Thread profiles: round across, with fuzz.
    float warpW = smoothstep(0.5, 0.5 - gap, abs(f.x));
    float weftW = smoothstep(0.5, 0.5 - gap, abs(f.y));
    float warpProf = sqrt(max(0.0, 1.0 - (f.x * 2.0) * (f.x * 2.0)));
    float weftProf = sqrt(max(0.0, 1.0 - (f.y * 2.0) * (f.y * 2.0)));
    // Where the thread dips under, it darkens toward the crossing edges.
    float dipWarp = 0.6 + 0.4 * sqrt(max(0.0, 1.0 - (f.y * 2.0) * (f.y * 2.0)));
    float dipWeft = 0.6 + 0.4 * sqrt(max(0.0, 1.0 - (f.x * 2.0) * (f.x * 2.0)));
    float T = 0.01 * sceneTime + 0.08 * audioAdvance;
    vec2 cw = (gi + 0.5) / N;
    vec3 warpC = imgK(cw * 0.6 + 0.5 + vec2(T, 0.3 * T), 1.5);
    vec3 weftSame = imgK(cw * 0.6 + 0.5 + vec2(0.13 - 0.5 * T, 0.07 + T), 1.5);
    vec3 weftC = mix(vec3(1.0) - weftSame * 0.8, weftSame, mode);
    weftC = mix(weftC, glowColour(weftSame, cw, hueP * 0.159) * 0.8, 0.25);
    float fuzz = 1.0 - (0.08 + 0.2 * rough) * noise2(g * vec2(1.0, 8.0) + gi.y);
    float fuzz2 = 1.0 - (0.08 + 0.2 * rough) * noise2(g * vec2(8.0, 1.0) + gi.x);
    vec3 warp = warpC * (0.35 + 0.75 * warpProf) * fuzz * (warpOver > 0.5 ? 1.0 : dipWarp);
    vec3 weft = weftC * (0.35 + 0.75 * weftProf) * fuzz2 * (warpOver > 0.5 ? dipWeft : 1.0);
    // Sheen along each thread.
    float sheenA = pow(warpProf, 8.0), sheenB = pow(weftProf, 8.0);
    warp += vec3(1.0) * sheenA * (0.05 + 0.2 * swell + 0.4 * kick);
    weft += vec3(1.0) * sheenB * (0.05 + 0.2 * swell + 0.4 * kick);
    vec3 top = warpOver > 0.5 ? warp : weft;
    float topW = warpOver > 0.5 ? warpW : weftW;
    vec3 bot = warpOver > 0.5 ? weft * 0.55 : warp * 0.55;
    float botW = warpOver > 0.5 ? weftW : warpW;
    vec3 col = vec3(0.02);
    col = mix(col, bot, botW);
    col = mix(col, top, topW);
    // Where threads are finer than pixels, blend to the mean.
    float fine = smoothstep(0.25, 0.5, fwidth(g.x));
    col = mix(col, mix(warpC, weftC, 0.5) * 0.6, fine);
    finish(col * shadeB);
}

#version 330 core
out vec4 fragColor;
/**
 * @file HoneyFold.frag
 * @brief HONEY FOLD: a thick stream of honey falling onto itself, seen close
 * and backlit -- the viscous rope coils and folds into loops on a growing
 * mound, the golden light shining through it, bright where it is thin and
 * deep amber where it is thick, with glossy highlights along every fold and
 * tiny air bubbles caught inside.  Many ropes side by side fill the frame,
 * each coiling at its own rhythm, so the whole picture is an endless
 * golden weave in motion.  The honey's tint follows the photo's warm tones.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the coiling (integrated, jump-free)
 *   audioSpread     -> rope thickness
 *   audioRoughness  -> the coils wobble
 *   audioBass       -> the backlight (light)
 *   audioHigh       -> the glints on the folds (light)
 *   audioMode       -> pale acacia honey in major, dark buckwheat in minor
 *
 * Knobs: ropesP (how many ropes), coilP (coil size), bubbleP, hueP.
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
uniform float audioBass;
uniform float audioHigh;
uniform float audioMode;

uniform float ropesP;
uniform float coilP;
uniform float bubbleP;
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
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.4 * audioAdvance;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 thin = mix(vec3(1.0, 0.72, 0.22), vec3(1.0, 0.88, 0.5), mode);
    vec3 thick = mix(vec3(0.3, 0.09, 0.01), vec3(0.6, 0.3, 0.04), mode);
    vec3 phc = imgLod(p * 0.3 + 0.5, 6.0);
    if (satOf(phc) > 0.25) thin = mix(thin, hsv2rgb(vec3(hue_of(phc), 0.6, 1.0)), 0.2);
    // Folds of a viscous sheet: a domain-warped field, folded over itself
    // (the absolute value makes the creases), creeping slowly.
    float sc = 1.2 + 1.5 * clamp(coilP, 0.0, 1.0);
    vec2 q = p * sc;
    vec2 w = vec2(fbm3(q * 0.7 + vec2(T, 0.0)), fbm3(q * 0.7 + vec2(0.0, -T) + 5.0));
    q += (1.2 + 0.4 * rough) * (w - 0.5);
    float n = fbm(q * (0.9 + 0.6 * clamp(ropesP, 0.0, 1.0)) + vec2(0.0, T * 0.5));
    float fold = 1.0 - abs(n * 2.0 - 1.0);                       // creases where n = 0.5
    float thickness = (0.4 + 1.8 * pow(fold, 2.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    // Slope of the surface for the gloss.
    float e = 0.01;
    float nx = fbm(( (p + vec2(e, 0.0)) * sc + (1.2 + 0.4 * rough) * (w - 0.5)) * (0.9 + 0.6 * clamp(ropesP, 0.0, 1.0)) + vec2(0.0, T * 0.5));
    float ny = fbm(( (p + vec2(0.0, e)) * sc + (1.2 + 0.4 * rough) * (w - 0.5)) * (0.9 + 0.6 * clamp(ropesP, 0.0, 1.0)) + vec2(0.0, T * 0.5));
    vec2 g = vec2(1.0 - abs(nx * 2.0 - 1.0) - fold, 1.0 - abs(ny * 2.0 - 1.0) - fold) / e;
    vec3 nrm = normalize(vec3(-g * 0.02, 1.0));
    // Backlight through honey (Beer-Lambert), plus the gloss of the surface.
    vec3 col = mix(thin * 1.5, thick, 1.0 - exp(-thickness * 1.2)) * (0.7 + 0.6 * bass);
    vec3 L = normalize(vec3(-0.4, 0.5, 1.0));
    float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    col += vec3(1.0, 0.95, 0.85) * spec * (0.3 + 0.9 * hi);
    // Air bubbles caught in the honey: round, bright-rimmed.
    vec2 bq = q * 6.0, bi = floor(bq), bf = fract(bq);
    vec2 bc = 0.3 + 0.4 * hash22(bi);
    float br = 0.06 + 0.1 * hash21(bi + 3.0);
    float bub = step(1.0 - 0.12 * clamp(bubbleP, 0.0, 1.0), hash21(bi + 7.0));
    float bd = length(bf - bc);
    col = mix(col, col * 1.5 + 0.1, bub * smoothstep(br, br * 0.7, bd) * 0.5);
    col += vec3(1.0) * bub * smoothstep(0.02, 0.0, abs(bd - br * 0.85)) * 0.3;
    finish(col);
}

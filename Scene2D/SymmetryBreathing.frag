#version 330 core
out vec4 fragColor;
/**
 * @file SymmetryBreathing.frag
 * @brief SYMMETRY BREATHING: a kaleidoscope whose symmetry itself breathes --
 * the photograph folded into a rosette that grows smoothly from 3-fold to
 * 12-fold and back, each count blending continuously into the next (the
 * mirrors slide apart as a new wedge opens between them), while the
 * rosette rotates and the window into the photo drifts.  Rings of the
 * rosette carry different symmetries at once, so the pattern is a stack
 * of concentric kaleidoscopes, each breathing at its own pace.  Endless,
 * mirrorable, like the original Kaleidoscope.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> rotation (integrated, jump-free)
 *   audioAdvance    -> the window drifts through the photo (integrated)
 *   audioSwell      -> the symmetry grows toward more folds (slow)
 *   audioMode       -> round petals in major, pointed star in minor (superellipse)
 *   audioHarmChange -> the ring layers shift against each other (smoothed)
 *   audioHigh       -> the mirror seams glint (light)
 *
 * Knobs: minFoldP, maxFoldP (the breathing range), ringsP (how many ring
 * layers), hueP.
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
uniform float audioSwell;
uniform float audioMode;
uniform float audioHarmChange;
uniform float audioHigh;

uniform float minFoldP;
uniform float maxFoldP;
uniform float ringsP;
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

vec3 kaleido(vec2 p, float n, vec2 win, out float seam)
{
    float r = length(p);
    float a = atan(p.y, p.x);
    float sec = 3.14159265 / n;
    float fa = mod(a, 2.0 * sec);
    fa = abs(fa - sec);
    seam = min(fa, sec - fa) * r;
    vec2 f = vec2(cos(fa), sin(fa)) * r;
    return imgLod(win + f * 0.35, 0.3);
}

void main()
{
    vec2 p = screenP() * 2.0;
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    // Superellipse metric (like the original Kaleidoscope's power knob).
    float powV = mix(0.75, 1.4, clamp(audioMode, 0.0, 1.0));
    float r0 = pow(pow(abs(p.x), 2.0 * powV) + pow(abs(p.y), 2.0 * powV), 1.0 / (2.0 * powV));
    p = normalize(p + 1e-5) * r0;
    p = rot2(0.02 * sceneTime + 0.3 * audioPhase) * p;
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.012 * sceneTime + 0.2 * audioAdvance), cos(0.01 * sceneTime + 0.15 * audioAdvance));
    float mn = 3.0 + 3.0 * clamp(minFoldP, 0.0, 1.0);
    float mx = mn + 3.0 + 6.0 * clamp(maxFoldP, 0.0, 1.0);
    // Ring layers: each ring has its own breathing phase.
    float nR = 1.0 + floor(clamp(ringsP, 0.0, 1.0) * 3.0);
    float ringW = 1.4 / nR;
    // Ring index as a continuous value; the colour is a blend of the two
    // nearest rings, so ring borders are soft.
    float rc = clamp(r0 / ringW - 0.5, 0.0, nR - 1.0);
    float r0i = floor(rc), rt = smoothstep(0.35, 0.65, rc - r0i);
    vec3 col = vec3(0.0); float seam = 0.0;
    for (int k = 0; k < 2; ++k) {
        float rr = min(r0i + float(k), nR - 1.0);
        float w = (k == 0) ? 1.0 - rt : rt;
        float breath = 0.5 - 0.5 * cos(sceneTime * (0.05 + 0.02 * rr) + rr * 1.7 + 0.8 * clamp(audioHarmChange, 0.0, 1.0));
        breath = clamp(breath + 0.3 * clamp(audioSwell, 0.0, 1.0), 0.0, 1.0);
        float nF = mix(mn, mx, breath);
        float n0 = floor(nF), f = smoothstep(0.0, 1.0, nF - n0);
        float s0, s1;
        vec2 pr = rot2(rr * 0.4) * p;
        vec3 c0 = kaleido(pr, n0, win + rr * 0.07, s0);
        vec3 c1 = kaleido(pr, n0 + 1.0, win + rr * 0.07, s1);
        col += w * mix(c0, c1, f);
        seam += w * mix(s0, s1, f);
    }
    float m = luma(imgLod(win, 8.0));
    col = (col - m) * 1.5 + m;
    vec3 hueF = hsv2rgb(vec3(fract(hueP * 0.159 + 0.2 * r0 + 0.02 * audioAdvance), 0.7, 1.0));
    col *= mix(vec3(1.0), mix(glowColour(imgLod(win, 5.0), p * 0.5, hueP * 0.159), hueF, 0.5) * 1.4, 0.4);
    col += vec3(1.0, 0.97, 0.92) * exp(-seam / (2.5 / resolution.y * 2.0)) * (0.04 + 0.25 * hi);
    finish(col * 1.05);
}

#version 330 core
out vec4 fragColor;
/**
 * @file FidenzaStrokes.frag
 * @brief FIDENZA STROKES: fat curving ribbons of paint laid side by side
 * along a flow field, in the manner of generative flow-field art -- each
 * ribbon follows the field's curves, broken into strokes of different
 * lengths with rounded ends, the strokes coloured from the photograph's
 * palette, with a thin dark gap between neighbours and a subtle painted
 * texture inside each stroke.  The field slowly bends, so the whole
 * composition flows, ribbons are born and fade where the field turns.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the strokes slide along their ribbons (integrated)
 *   audioSpread     -> ribbon width (few fat ones or many thin ones)
 *   audioRoughness  -> the painted texture inside the strokes
 *   audioMode       -> the palette: muted in minor, vivid in major
 *   audioKick       -> the strokes brighten (light)
 *   audioHarmChange -> the field bends further (slow, smoothed)
 *
 * Knobs: curlP (how much the field curls), strokeP (stroke length), gapP (gap width), hueP.
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
uniform float audioMode;
uniform float audioKick;
uniform float audioHarmChange;

uniform float curlP;
uniform float strokeP;
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

float lcOf(vec3 c) { return 0.4 + 0.8 * luma(c); }
float streamFn(vec2 p, float t, float curl)
{
    return p.y + curl * (fbm3(p * 0.7 + vec2(t, 0.3 * t)) - 0.5) * 2.2 + 0.3 * sin(p.x * 0.8 + t * 0.7);
}

void main()
{
    vec2 p = screenP() * 3.0;
    float kick = clamp(audioKick, 0.0, 1.0);
    float t = 0.02 * sceneTime + 0.1 * clamp(audioHarmChange, 0.0, 1.0);
    float curl = 0.7 + 1.1 * clamp(curlP, 0.0, 1.0);
    float psi = streamFn(p, t, curl);
    float e = 0.01;
    vec2 gpsi = vec2(streamFn(p + vec2(e, 0.0), t, curl) - psi, streamFn(p + vec2(0.0, e), t, curl) - psi) / e;
    float N = 4.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float bandF = psi * N;
    float band = floor(bandF);
    float across = fract(bandF);                               // 0..1 across the ribbon
    // Along-ribbon coordinate: x warped slightly by the band's curve.
    vec2 tang = normalize(vec2(gpsi.y, -gpsi.x));
    float along = p.x + 0.3 * psi * tang.y + 0.15 * sceneTime * (0.5 + hash11(band)) + 0.6 * audioAdvance * (0.5 + hash11(band + 3.0));
    float segL = 0.35 + 1.2 * clamp(strokeP, 0.0, 1.0);
    float sa = along / segL + hash11(band * 1.7) * 7.0;
    float seg = floor(sa);
    float fs = fract(sa);
    // Pixel sizes for antialiasing.
    float pxA = length(gpsi) * N * 3.0 / resolution.y;          // across units per pixel
    float pxL = 3.0 / resolution.y / segL;                      // along units per pixel
    float gap = 0.06 + 0.12 * clamp(gapP, 0.0, 1.0);
    // Rounded stroke ends: an ellipse-ish cap in (along, across) space.
    float halfW = 0.5 - gap * 0.5;
    float ca = (across - 0.5);
    float capL = min(0.2, halfW * segL * 0.9 / segL);
    float ex = max(0.0, max(capL - fs, fs - (1.0 - capL))) / capL; // 0 in the body, 0..1 in the caps
    float r = sqrt(ex * ex + (ca / halfW) * (ca / halfW));
    float inStroke = smoothstep(1.0 + pxA / halfW * 1.5, 1.0 - pxA / halfW * 1.5, r);
    // Some strokes are missing (the field shows through).
    float present = step(0.12, hash21(vec2(band, seg) + 0.3));
    // Colour from the photo's palette.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 cuv = vec2(hash21(vec2(band, seg)), hash21(vec2(seg, band) + 2.0));
    vec3 c = imgLod(cuv, 4.0);
    c = mix(c, glowColour(c, vec2(band, seg) * 0.3, hueP * 0.159), 0.35 + 0.3 * mode);
    c = mix(c, hsv2rgb(vec3(fract(hueP * 0.159 + 0.5 * hash21(vec2(band * 0.37, 1.0))), 0.75, 1.0)) * lcOf(c), step(0.8, hash21(vec2(seg, band) + 9.0)));
    float lc = luma(c);
    c = max(mix(vec3(lc), c, 0.9 + 0.8 * mode), 0.0);
    c = c / max(max(c.r, max(c.g, c.b)), 0.25) * (0.55 + 0.4 * hash21(vec2(band, seg) + 5.0));
    // Painted texture: bristle streaks along the stroke.
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float bristle = noise2(vec2(fs * 3.0 * segL, across * 40.0) + vec2(seg, band) * 3.7);
    c *= 0.85 + (0.12 + 0.25 * rough) * (bristle - 0.5) * 2.0;
    c *= 0.85 + 0.3 * smoothstep(1.0, 0.0, r);                 // a little body shading
    vec2 uv = p / 3.0 * 0.8 + 0.5;
    vec3 ground = mix(vec3(0.93, 0.9, 0.84), imgLod(uv, 3.0), 0.25) * (0.35 + 0.25 * (1.0 - mode));
    vec3 col = mix(ground, c * (1.0 + 0.4 * kick), inStroke * present);
    finish(col);
}

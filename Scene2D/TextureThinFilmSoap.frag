#version 330 core
out vec4 fragColor;
/**
 * @file TextureThinFilmSoap.frag
 * @brief TEXTURE THIN FILM SOAP: a vast soap film seen against the dark --
 * its thickness paints it in interference colours: bands of magenta,
 * gold, green and blue, thinning toward black at the top where the film
 * drains, while Marangoni swirls stir the colours into curling eddies and
 * plumes; the photograph shows faintly as a reflection in the film, a
 * soft window highlight glides over it.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the swirls turn and the film drains (integrated)
 *   audioSpread     -> the film's thickness range (more colour orders)
 *   audioRoughness  -> the turbulence
 *   audioKick       -> the highlight flares (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the reflection of the photo (slow)
 *
 * Knobs: swirlP, bandP (drainage banding), reflectP, hueP.
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

uniform float swirlP;
uniform float bandP;
uniform float reflectP;
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

// Interference colour of a film of optical thickness d (nm), 7 wavelengths.
vec3 filmColour(float d)
{
    vec3 c = vec3(0.0), ws = vec3(0.0);
    for (int i = 0; i < 7; ++i) {
        float lam = 400.0 + 50.0 * float(i);
        float x = (lam - 400.0) / 300.0;
        vec3 w = clamp(vec3(1.5 - abs(x - 1.0) * 2.8, 1.5 - abs(x - 0.55) * 3.2, 1.5 - abs(x - 0.12) * 3.2), 0.0, 1.0);
        float I = 0.5 - 0.5 * cos(12.566 * 1.33 * d / lam);
        c += w * I;
        ws += w;
    }
    return c / ws * 1.2;               // each channel normalised: white at the mean
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    // Swirls: a curl-like warp from two noise fields.
    float sw = 0.4 + 0.8 * clamp(swirlP, 0.0, 1.0);
    vec2 q = p * 1.4;
    vec2 w1 = vec2(fbm3(q + vec2(0.0, T)), fbm3(q + vec2(5.2, -T))) - 0.5;
    vec2 q2 = q + sw * rot2(1.5707963) * w1 * 1.5;
    vec2 w2 = vec2(fbm3(q2 * 1.7 + vec2(T * 1.3, 2.0)), fbm3(q2 * 1.7 + vec2(8.0, -T))) - 0.5;
    vec2 q3 = q2 + sw * rot2(-1.2) * w2 * (1.2 + 1.0 * rough);
    // Thickness: drains toward the top (in a mirrored, endless way: a slow
    // wave in y), plus the stirred structure.
    float band = 0.5 + 0.5 * sin(p.y * (1.5 + 2.0 * clamp(bandP, 0.0, 1.0)) + T * 2.0);
    float range = 450.0 + 500.0 * clamp(audioSpread, 0.0, 1.0);
    float stir = fbm(q3 * 1.3 + vec2(0.0, T * 0.5));
    float d = 40.0 + range * (0.1 + 0.35 * band + 0.9 * stir * stir);
    vec3 film = filmColour(d);
    // Black film where it is thinnest.
    film *= smoothstep(20.0, 160.0, d);
    float mode = clamp(audioMode, 0.0, 1.0);
    film *= mix(vec3(0.9, 0.97, 1.1), vec3(1.1, 0.98, 0.9), mode);
    film = max(mix(vec3(luma(film)), film, 1.5), 0.0);            // vivid like real soap
    film = mix(film, film.gbr, 0.5 - 0.5 * cos(hueP * 0.159 * 6.2831853)); // hue knob rotates the palette
    // The film against the dark, lit unevenly.
    float lightF = 0.35 + 0.45 * smoothstep(-0.2, 0.8, fbm3(p * 0.7 + 3.0));
    // Reflection of the photo, bent by the film's surface.
    vec2 uv = p * 0.6 + 0.5 + 0.03 * w2;
    vec3 refl = imgLod(uv, 2.0);
    vec3 col = film * lightF * (0.7 + 0.5 * luma(refl)) + refl * 0.08 * clamp(reflectP, 0.0, 1.0) * (0.3 + swell);
    // A soft window highlight gliding over the film.
    vec2 hc = vec2(0.5 * sin(0.03 * sceneTime), 0.25 * cos(0.021 * sceneTime));
    vec2 hd = abs(p - hc + 0.05 * w1) - vec2(0.16, 0.1);
    float win = smoothstep(0.12, -0.02, max(hd.x, hd.y));
    col += film * win * (0.35 + 0.8 * kick);
    finish(col);
}

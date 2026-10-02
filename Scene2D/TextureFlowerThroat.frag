#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureFlowerThroat.frag
 * @brief TEXTURE FLOWER THROAT: diving into the throat of an endless flower
 * -- ring after ring of petals opens toward us, each whorl turned half a
 * petal against the one before, the petals cut from the photograph and
 * veined, cupped (bright at their tips, shadowed at their bases), glowing
 * translucent where the light shines through; deep inside, a glowing
 * heart of stamens.  The whorls slowly turn in alternating directions.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the dive (integrated, jump-free)
 *   audioPhase      -> the whorls turn (integrated)
 *   audioSpread     -> the petals open wider
 *   audioKick       -> the heart glows (light)
 *   audioMode       -> petal light: cool in minor, warm in major
 *   audioSwell      -> translucency (slow)
 *
 * Knobs: petalsP (petals per whorl), shapeP (petal shape), veinP, hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioSpread;   ///< Spectral spread, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float petalsP;
uniform float shapeP;
uniform float veinP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

// ---- shared building blocks (texture pool, noise, shapes) ----
/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
/// @brief Fractal noise of three octaves, 0..1.
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}
/// Mirror-repeat in the shader (the engine's textures mirror, the editor's
/// repeat -- doing it here makes both identical).  Identity inside [0,1].
vec2 mirrorUV(vec2 uv) { return 1.0 - abs(fract(uv * 0.5) * 2.0 - 1.0); }
/// The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
vec3 imgLod(vec2 uv, float lod) {
    uv = mirrorUV(uv);
    return (interpolation * textureLod(tex0, uv, lod) + (1.0 - interpolation) * textureLod(tex1, uv, lod)).rgb;
}
/// @brief Luminance of a colour (Rec. 601 weights).
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
/// @brief HSV (all 0..1) to RGB.
vec3 hsv2rgb(vec3 c) {
    vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), k, c.y);
}
/// @brief Hue of a colour, 0..1.
float hue_of(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn + 1e-5;
    float h = (mx == c.r) ? (c.g - c.b) / d : (mx == c.g) ? 2.0 + (c.b - c.r) / d : 4.0 + (c.r - c.g) / d;
    return fract(h / 6.0);
}
/// @brief Saturation of a colour, 0..1.
float satOf(vec3 c) { float mx = max(c.r, max(c.g, c.b)); return (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3); }
/// A glowing colour for a place: the photo's own hue where it has one, a
/// slowly wandering hue field (anchored on hue0) where the photo is grey.
vec3 glowColour(vec3 photo, vec2 q, float hue0) {
    vec3 field = hsv2rgb(vec3(fract(hue0 + 0.55 * fbm3(q * 0.8) + 0.03 * audioAdvance), 0.85, 1.0));
    vec3 own = photo / max(max(photo.r, max(photo.g, photo.b)), 1e-3); own = own * own * own;
    return mix(field, own, smoothstep(0.12, 0.35, satOf(photo)));
}
/// Push a colour toward full saturation, keeping its hue (neon from a photo).
vec3 neonOf(vec3 c, float k) {
    vec3 n = c / max(max(c.r, max(c.g, c.b)), 1e-3);
    return pow(n, vec3(k));
}
/// The photo along an endless scroll in y without mirror seams: the photo
/// repeats mirrored, so a scroll crosses a visible fold every unit; two reads
/// half a period apart are cross-faded so each fold is hidden by the other.
vec3 imgScroll(vec2 uv, float lod) {
    float w = abs(fract(uv.y) - 0.5) * 2.0;           // 1 at the fold, 0 between
    w = smoothstep(0.55, 1.0, w);
    return mix(imgLod(uv, lod), imgLod(uv + vec2(0.37, 0.5), lod), w);
}
/// Height from the photo: broad masses plus a share of the detail.
float texHeight(vec2 uv, float lodBroad, float detail) {
    return mix(luma(imgLod(uv, lodBroad)), luma(imgLod(uv, max(lodBroad - 3.0, 0.0))), detail);
}
/// Gradient of the photo's luma at a mip level (per UV unit).
vec2 texGrad(vec2 uv, float lod) {
    float e = exp2(lod) / 1024.0;
    return vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
/// Edge strength of the photo (0..1-ish) at a mip level.
float texEdge(vec2 uv, float lod) { return length(texGrad(uv, lod)) * exp2(lod) / 1024.0 * 6.0; }

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief 2D rotation matrix.
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
/// @brief Smooth minimum of two distances (blend width k).
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
/// Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
vec2 screenP() { return (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0); }
/// House finish: loudness brightness and the soft highlight roll-off.
void finish(vec3 col)
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max(col, 0.0);
    t /= 1.0 + 0.35 * max(t.r, max(t.g, t.b));
    fragColor = vec4(clamp(t, 0.0, 1.0), 1.0);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float lr = log(r);
    float n = 2.0 * floor(3.0 + 3.0 * clamp(petalsP, 0.0, 1.0)); // petals per whorl (even)
    float dive = 0.25 * sceneTime + 1.5 * audioAdvance;
    float turn = 0.03 * sceneTime + 0.3 * audioPhase;
    float spacing = 0.45;                                       // whorl spacing in log radius
    // Whorls stack from the outside in; the petals of whorl w reach out from
    // their base (inner) to their tip (outer). Check the whorl at this radius
    // and the one inside it (its tips overlap ours).
    float u = (lr + dive) / spacing;
    float wi = floor(u);
    vec3 col = vec3(0.0);
    float got = 0.0;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.75, 0.85, 1.1), vec3(1.15, 0.9, 0.75), mode);
    float open = 0.8 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float fwA = length(fwidth(vec2(cos(a), sin(a))));            // derivatives before any branch
    for (int k = 0; k < 2; ++k) {
        float w = wi - float(k);                                // outer first (it lies on top)
        float t = (u - w) / (1.6 * open);                       // 0 at the base, 1 at the tip
        if (t < 0.0 || t > 1.0) continue;
        float rotw = turn * (mod(w, 2.0) < 0.5 ? 1.0 : -1.0) + 0.5 * mod(w, 2.0) * 6.2831853 / n;
        float pa = (a + rotw) * n / 6.2831853;
        float pf = fract(pa) - 0.5;                             // -0.5..0.5 across the petal
        // Petal outline: width as a function of t (round tip, narrow base).
        float sh = 0.4 + 0.6 * clamp(shapeP, 0.0, 1.0);
        float halfW = 0.5 * pow(sin(3.14159265 * clamp(t, 0.0, 1.0)), sh) * (0.8 + 0.2 * t);
        float px = fwA * n / 6.2831853 + 1e-4;
        float inside = smoothstep(halfW + px, halfW - px, abs(pf));
        if (inside <= 0.0) continue;
        // Photo on the petal, one piece per petal.
        float pid = mod(floor(pa), n);
        vec2 puv = vec2(pf * 0.6 + pid * 0.23 + w * 0.11, t * 0.5 + w * 0.17);
        vec3 ph = imgLod(puv, 1.0);
        vec3 c = ph * lc;
        // Cupping: shadow at the base, light at the tip; midrib and veins.
        c *= 0.35 + 0.85 * smoothstep(0.0, 0.8, t);
        float vein = exp(-abs(pf) / 0.02) * 0.4 + 0.25 * pow(abs(sin(pf * 30.0 - t * 6.0)), 20.0) * clamp(veinP, 0.0, 1.0);
        c *= 1.0 - 0.3 * vein;
        c += lc * vein * 0.1;
        // Translucent glow near the edge.
        c += glowColour(ph, vec2(w, pid), hueP * 0.159) * smoothstep(halfW * 0.5, halfW, abs(pf)) * (0.1 + 0.4 * swell) * t;
        // Shadow cast by the petal on top onto the petal below (k == 1).
        c *= k == 1 ? 0.65 : 1.0;
        col = mix(col, c, inside * (1.0 - got));
        got = max(got, inside);
    }
    // The heart deep inside and the dark between petals.
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(dive * 0.05, 0.0), hueP * 0.159);
    vec3 dark = gc * 0.05;
    col = mix(dark, col, got);
    col *= smoothstep(-3.5, -1.0, lr);                          // deep whorls fade
    col += gc * exp(-r * 10.0) * (0.8 + 1.4 * kick);
    // Stamens: glowing dots around the heart.
    float sa = (a + turn * 2.0) * 14.0 / 6.2831853;
    float sr = abs(fract(sa) - 0.5) + abs(r - 0.07) * 20.0;
    col += gc * smoothstep(0.25, 0.0, sr) * 0.8;
    finish(col);
}

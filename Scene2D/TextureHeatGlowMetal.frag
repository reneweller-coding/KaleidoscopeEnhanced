#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureHeatGlowMetal.frag
 * @brief TEXTURE HEAT GLOW METAL: a steel plate with the photograph stamped
 * into it, heated by wandering torches -- where the flames play, the metal
 * glows through the incandescent colours (dull red, cherry, orange,
 * yellow, near white), the relief of the photo glowing unevenly, and
 * around each hot spot the temper colours bloom in rings (straw, bronze,
 * purple, blue) where the steel has been heated and cooled; the rest is
 * dark forged steel with a faint sheen.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the torches wander (integrated, jump-free)
 *   audioBass       -> the glow flares (light)
 *   audioSpread     -> the heat spreads wider
 *   audioMode       -> fewer, hotter torches in major; more, cooler in minor (blend)
 *   audioRoughness  -> the scale texture on the steel
 *   audioSwell      -> the temper rings widen (slow)
 *
 * Knobs: torchP (torch count), temperP (temper colours), reliefP (photo relief), hueP.
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
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSpread;   ///< Spectral spread, 0..1.
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float torchP;
uniform float temperP;
uniform float reliefP;   ///< Relief knob, 0..1.
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

vec3 blackbody(float t)
{
    // t 0..1: dark -> dull red -> orange -> yellow -> white.
    vec3 c = mix(vec3(0.0), vec3(0.45, 0.02, 0.0), smoothstep(0.0, 0.3, t));
    c = mix(c, vec3(1.0, 0.25, 0.02), smoothstep(0.3, 0.55, t));
    c = mix(c, vec3(1.0, 0.7, 0.2), smoothstep(0.55, 0.8, t));
    c = mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.8, 1.0, t));
    return c;
}
vec3 temper(float t)
{
    // Temper sequence by (past) temperature: straw, bronze, purple, blue, grey.
    vec3 c = mix(vec3(0.3, 0.3, 0.32), vec3(0.85, 0.75, 0.45), smoothstep(0.0, 0.2, t));
    c = mix(c, vec3(0.7, 0.45, 0.25), smoothstep(0.2, 0.4, t));
    c = mix(c, vec3(0.45, 0.2, 0.5), smoothstep(0.4, 0.6, t));
    c = mix(c, vec3(0.2, 0.3, 0.7), smoothstep(0.6, 0.8, t));
    c = mix(c, vec3(0.45, 0.55, 0.65), smoothstep(0.8, 1.0, t));
    return c;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    float relief = texHeight(uv, 3.0, 0.4);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float heat = 0.0, past = 0.0;
    float nT = 2.0 + 3.0 * clamp(torchP, 0.0, 1.0);
    float spread = 0.08 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nT - 0.5);
        if (on <= 0.0) break;
        vec2 c = vec2(0.75 * sin(T * (0.6 + 0.2 * fi) + fi * 2.3), 0.4 * cos(T * (0.5 + 0.25 * fi) + fi * 1.7));
        float d = length(p - c);
        float hot = exp(-d * d / (spread * spread * mix(1.3, 0.7, mode)));
        heat += hot * on * mix(0.8, 1.2, mode);
        // Where the torch has been: a wider, older heating (temper rings).
        past += exp(-d * d / (spread * spread * (8.0 + 10.0 * swell))) * on;
    }
    float tp = clamp(heat * (0.45 + 0.6 * relief * (0.5 + clamp(reliefP, 0.0, 1.0))) * (0.7 + 0.4 * bass), 0.0, 1.1);
    // Forged steel with scale.
    float scale = noise2(p * 60.0) * 0.5 + noise2(p * 180.0) * 0.5;
    vec3 steel = vec3(0.12, 0.12, 0.13) * (0.7 + 0.6 * relief) * (0.85 + (0.1 + 0.3 * rough) * scale);
    vec3 tc = temper(clamp(past * 0.8, 0.0, 1.0));
    vec3 col = mix(steel, steel * 0.4 + tc * 0.45, smoothstep(0.05, 0.3, past) * (0.4 + 0.6 * clamp(temperP, 0.0, 1.0)));
    col += blackbody(tp) * 1.4;
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.06);
    // Faint sheen.
    col += vec3(0.8, 0.85, 0.9) * pow(max(0.0, dot(normalize(vec3(-texGrad(uv, 3.0) * 0.003, 1.0)), normalize(vec3(-0.5, 0.5, 0.7)))), 40.0) * 0.15;
    finish(col);
}

#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureNeonCalligraphy.frag
 * @brief TEXTURE NEON CALLIGRAPHY: glowing brush calligraphy written in light
 * -- broad sweeping strokes that swell and taper like a brush pen, drawn
 * across the dark as we watch, loops and hooks and flourishes, each
 * stroke a neon tube of the photograph's colours with a hot white core
 * and a soft bloom; old strokes fade as new ones are written, the whole
 * script drifting slowly.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the writing (integrated, jump-free)
 *   audioSpread     -> stroke width
 *   audioKick       -> the strokes flare (light)
 *   audioMode       -> palette: cool neon in minor, warm neon in major (tint)
 *   audioRoughness  -> the strokes get shakier
 *   audioSwell      -> the bloom (slow)
 *
 * Knobs: strokeP (stroke count), loopP (loopiness), photoP (photo colours), hueP.
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
uniform float audioSpread;   ///< Spectral spread, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float strokeP;
uniform float loopP;
uniform float photoP;   ///< Photo knob: how much of the photo shows, 0..1.
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
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 col = imgLod(uv, 4.0) * 0.03;
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    float nS = 3.0 + 4.0 * clamp(strokeP, 0.0, 1.0);
    float loop = 1.0 + 3.0 * clamp(loopP, 0.0, 1.0);
    float wBase = 0.006 + 0.012 * clamp(audioSpread, 0.0, 1.0);
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nS - 0.5);
        if (on <= 0.0) break;
        // Each stroke lives a cycle: written (0..0.4), shown, faded (0.8..1).
        float cyc = T * 0.35 + fk / 7.0;
        float life = fract(cyc);
        float gen = floor(cyc);
        float h = hash11(fk * 3.7 + gen * 1.31);
        vec2 c0 = vec2(1.4 * (hash11(h * 11.0) - 0.5), 0.8 * (hash11(h * 17.0) - 0.5));
        float drawn = smoothstep(0.0, 0.4, life);
        float alpha = smoothstep(1.0, 0.8, life) * on;
        // Stroke path: a parametric curve sampled in segments; distance to it,
        // with the exact curve parameter at the closest point (smooth width).
        float best = 1e3, bestT = 0.0;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 40; ++i) {
            float t = float(i) / 40.0;
            if (t > drawn + 1.0 / 40.0) break;
            float a = t * 6.2831853 * 0.9;
            vec2 pt = c0 + vec2(t * 0.9 - 0.45, 0.0) * (0.8 + 0.4 * h) + 0.12 * vec2(sin(a * loop + h * 6.0), cos(a * loop * 0.7 + h * 9.0) * 1.3);
            pt += rough * 0.008 * vec2(noise2(vec2(t * 40.0, h * 10.0)) - 0.5, noise2(vec2(h * 10.0, t * 40.0)) - 0.5);
            if (i > 0) {
                vec2 pa = p - prev, ba = pt - prev;
                float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
                float dd = length(pa - ba * hh);
                if (dd < best) { best = dd; bestT = t - (1.0 - hh) / 40.0; }
            }
            prev = pt;
        }
        // Brush profile: swell in the middle of the stroke, taper at the ends.
        float w = wBase * (0.3 + 1.4 * sin(3.14159 * clamp(bestT / max(drawn, 0.05), 0.0, 1.0))) * (0.75 + 0.5 * (0.5 + 0.5 * sin(bestT * 9.0 + h * 5.0)));
        vec3 nc = hsv2rgb(vec3(fract(h + hueP * 0.159 + mix(0.55, 0.0, mode) * 0.5), 0.85, 1.0));
        nc = mix(nc, glowColour(imgLod(vec2(h, fract(h * 7.0)), 4.0), vec2(h, 0.0), hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.6);
        float core = smoothstep(w, w * 0.3, best);
        float tube = smoothstep(w * 2.2, w, best);
        float bloom = exp(-best / (0.02 + 0.03 * swell));
        col += (nc * tube * 0.9 + vec3(1.0) * core * 0.6 + nc * bloom * 0.25) * alpha * (1.0 + 0.8 * kick);
    }
    finish(col);
}

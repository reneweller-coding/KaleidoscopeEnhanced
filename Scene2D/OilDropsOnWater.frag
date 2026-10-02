#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file OilDropsOnWater.frag
 * @brief OIL DROPS ON WATER: the classic macro photograph -- a dish of water
 * with drops of oil floating on it, held above a colourful background, so
 * every oil drop is a lens that shows the background magnified and
 * bent, ringed by a dark refraction edge and a bright rim; small drops
 * cluster around big ones, drops drift together and merge.  The
 * background is the photograph, soft and colourful, and moves slowly
 * beneath.  An endless field, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drops drift (integrated, jump-free)
 *   audioSpread     -> magnification of the lenses
 *   audioSwell      -> drop size (slow)
 *   audioRoughness  -> the water surface trembles (ripples in the view)
 *   audioHigh       -> the rims sparkle (light)
 *   audioMode       -> the background warms in major
 *
 * Knobs: dropsP (how many), sizeP (drop size), blurP (background blur), hueP.
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
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.

uniform float dropsP;
uniform float sizeP;   ///< Size knob, 0..1.
uniform float blurP;
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
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    vec2 base = p * 0.7 + 0.5 + vec2(0.01, 0.006) * sceneTime;
    float blur = 2.5 + 3.0 * clamp(blurP, 0.0, 1.0);
    // Ripples on the water bend the view slightly.
    vec2 rip = 0.004 * rough * vec2(sin(p.y * 40.0 + sceneTime * 2.0), sin(p.x * 40.0 - sceneTime * 1.7));
    vec3 bgc = imgLod(base + rip, blur);
    bgc = mix(bgc, glowColour(bgc, base, hueP * 0.159) * (0.4 + 0.9 * luma(bgc)), 0.5) * 1.3;
    bgc *= mix(vec3(0.95, 1.0, 1.1), vec3(1.1, 1.0, 0.9), clamp(audioMode, 0.0, 1.0));
    vec3 col = bgc * 0.75;
    float mag = 0.25 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float szK = (0.6 + 0.8 * clamp(sizeP, 0.0, 1.0)) * (0.85 + 0.3 * swell);
    // Drops at three sizes (big lenses, medium, small satellites).
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float cell = (0.26 - 0.07 * fl) * szK;
        vec2 g = p / cell + vec2(T * (1.0 + fl * 0.5), T * 0.6) + fl * 17.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl * 9.0) > 0.35 + 0.45 * clamp(dropsP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.25 * (hash22(id + fl) - 0.5);
            float r = 0.22 + 0.2 * hash21(id + 3.0 + fl);
            vec2 d = g - c;
            float dl = length(d) / r;
            if (dl > 1.08) continue;
            float z = sqrt(max(1.0 - dl * dl, 0.0));
            // The lens: the background seen through the drop, magnified and bent.
            vec2 cw = (c - vec2(T * (1.0 + fl * 0.5), T * 0.6) - fl * 17.0) * cell;
            vec2 luv = cw * 0.7 + 0.5 + vec2(0.01, 0.006) * sceneTime + (p - cw) * 0.7 * mag * (0.5 + 0.8 * z);
            vec3 inD = imgLod(luv, blur * 0.4);
            inD = mix(inD, glowColour(inD, luv, hueP * 0.159) * (0.4 + 0.9 * luma(inD)), 0.5) * 1.5;
            // Dark refraction edge, bright inner rim, a highlight.
            inD *= mix(1.0, 0.1, smoothstep(0.75, 1.0, dl));
            inD += vec3(1.0) * exp(-pow((dl - 0.85) / 0.05, 2.0)) * 0.25;
            inD += vec3(1.0) * smoothstep(0.25, 0.0, length(d / r - vec2(-0.35, 0.4))) * (0.4 + 0.9 * hi);
            float aa = 2.0 / resolution.y / (cell * r);
            col = mix(col, inD, smoothstep(1.0 + aa, 1.0 - aa, dl));
        }
    }
    finish(col);
}

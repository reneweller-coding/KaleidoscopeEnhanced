#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureIceFloes.frag
 * @brief TEXTURE ICE FLOES: pack ice seen from above -- white and pale-blue
 * floes of every size drift on the dark sea, slowly turning and jostling,
 * their edges rounded by the waves, pressure ridges running across them,
 * snow drifts textured by the photograph, meltwater ponds glowing turquoise
 * on some; between them black water with rafts of brash ice and a low sun
 * glinting on the leads.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pack drifts (integrated, jump-free)
 *   audioSpread     -> the leads widen (floes spread apart)
 *   audioKick       -> sun glints on the water (light)
 *   audioMode       -> light: blue polar night in minor, pink midnight sun in major
 *   audioRoughness  -> more pressure ridges
 *   audioSwell      -> meltwater ponds (slow)
 *
 * Knobs: floeP (floe size), pondP (ponds), snowP (photo texture on the snow), hueP.
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
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float floeP;
uniform float pondP;
uniform float snowP;
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
/// The photo read through a turning kaleidoscope -- the trick of the original
/// Kaleidoscope/Tunnel scenes: uv is folded into mirrored wedges around a
/// slowly wandering centre and turned with time and the integrated audio
/// phase, so the texture itself keeps changing (detailed, continuous, never
/// repeating).  The fold is continuous at every wedge border and at the atan
/// cut (sides is a whole number); the explicit mip level avoids seams.
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
/// @brief The photo through the scene's kaleidoscope.
vec3 imgK(vec2 uv, float lod) { return imgLod(kaleidoUV(uv, 6.0), lod); }
/// Other channels than RGB: the photo's structure, read through the kaleidoscope.
/// Gradient / edges / Laplacian are rotation invariant in magnitude, so they
/// stay seamless across the mirror folds (direction-based colours would not).
vec2 imgKGrad(vec2 uv, float lod)
{
    float e = exp2(lod) / 1024.0 + 0.001;
    return vec2(luma(imgK(uv + vec2(e, 0.0), lod)) - luma(imgK(uv - vec2(e, 0.0), lod)),
                luma(imgK(uv + vec2(0.0, e), lod)) - luma(imgK(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
/// @brief Edge strength of the kaleidoscoped photo.
float imgKEdge(vec2 uv, float lod) { return length(imgKGrad(uv, lod)) * (exp2(lod) / 1024.0 + 0.001) * 6.0; }
/// @brief Laplacian of the kaleidoscoped photo's luma (ridges and valleys).
float imgKLap(vec2 uv, float lod)
{
    float e = exp2(lod) / 1024.0 + 0.001;
    float c = luma(imgK(uv, lod));
    return (luma(imgK(uv + vec2(e, 0.0), lod)) + luma(imgK(uv - vec2(e, 0.0), lod)) +
            luma(imgK(uv + vec2(0.0, e), lod)) + luma(imgK(uv - vec2(0.0, e), lod)) - 4.0 * c) * 4.0;
}
/// Embossed relief of the kaleidoscoped photo, lit from a direction.
float imgKRelief(vec2 uv, float lod, vec2 lightDir)
{
    vec2 g = imgKGrad(uv, lod) * (exp2(lod) / 1024.0 + 0.001) * 8.0;
    return clamp(0.5 + dot(g, normalize(lightDir)), 0.0, 1.0);
}
/// A second continuous transform: the photo wound into a log-polar spiral that
/// zooms forever (Droste-like).  angle/pi spans one mirror period, so the atan
/// cut is seamless; the zoom runs on integrated time, never jumps.
vec2 spiralUV(vec2 uv, float arms, float zoom)
{
    vec2 d = uv - 0.5;
    float r = max(length(d), 1e-4);
    float a = atan(d.y, d.x);
    // Both coordinates jump by whole mirror periods (2) at the cut: the shear
    // a/pi jumps by 2, and a/pi*arms/2 by arms (arms must be even).
    return vec2(log(r) * 0.5 - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5);
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
    float T = 0.05 * sceneTime + 0.4 * audioAdvance;
    float S = 2.5 + 4.0 * (1.0 - clamp(floeP, 0.0, 1.0));
    vec2 x = p * S + vec2(0.3 * T, 0.1 * T);
    vec2 i = floor(x), f = fract(x);
    float d1 = 9.0, d2 = 9.0; vec2 id = i; vec2 toC = vec2(0.0);
    for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
        vec2 o = vec2(xx, y);
        vec2 h = hash22(i + o);
        vec2 c = o + 0.5 + 0.3 * vec2(sin(T * (0.5 + h.x) + h.y * 6.28), cos(T * (0.4 + h.y) + h.x * 6.28));
        float d = length(f - c);
        if (d < d1) { d2 = d1; d1 = d; id = i + o; toC = f - c; } else if (d < d2) d2 = d;
    }
    float edge = d2 - d1;                                       // distance to the floe boundary
    float lead = 0.04 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    lead *= 0.7 + 0.6 * noise2(x * 3.0);                         // uneven leads, rounded corners
    float px = fwidth(x.x) * 1.2;
    float ice = smoothstep(lead - px, lead + px, edge);
    // Floe surface: snow textured by the photo in the floe's own rotating frame.
    float h = hash21(id);
    vec2 lc = rot2(T * (h - 0.5) * 0.6 + h * 6.28) * toC;
    vec2 suv = lc * 0.25 + hash22(id + 3.0);
    float snow = luma(imgK(suv, 2.0));
    vec3 lightC = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.85), mode);
    vec3 floe = mix(vec3(0.82, 0.88, 0.95), vec3(0.95, 0.97, 1.0), snow * clamp(snowP + 0.2, 0.0, 1.0)) * lightC;
    floe *= 0.85 + 0.15 * smoothstep(0.0, 0.25, edge);          // rounded, shaded rims
    // Pressure ridges: lines across the floe.
    float ridge = exp(-abs(dot(lc, vec2(0.8, 0.6)) * 8.0 + sin(dot(lc, vec2(-0.6, 0.8)) * 6.0) * 0.4 - (h - 0.5) * 3.0) * 6.0);
    floe *= 1.0 - 0.25 * ridge * step(0.4 - 0.3 * rough, hash21(id + 5.0));
    floe += lightC * ridge * 0.05;
    // Meltwater ponds.
    float pond = smoothstep(0.62, 0.7, fbm3(lc * 3.0 + h * 9.0)) * (0.3 + 0.7 * clamp(pondP, 0.0, 1.0)) * (0.4 + 0.8 * swell);
    floe = mix(floe, vec3(0.3, 0.75, 0.85) * lightC, clamp(pond, 0.0, 1.0) * smoothstep(0.1, 0.25, edge));
    // Water: dark, with brash ice and sun glints.
    vec3 water = mix(vec3(0.02, 0.04, 0.07), vec3(0.05, 0.04, 0.07), mode);
    float brash = smoothstep(0.7, 0.8, noise2(x * 25.0)) * smoothstep(lead * 1.5, 0.0, edge);
    water += vec3(0.6, 0.65, 0.7) * brash * 0.5;
    vec2 sg = x * 20.0;
    vec2 si = floor(sg), sf = fract(sg);
    float tw = pow(max(0.0, sin(sceneTime * (0.8 + hash21(si)) + hash21(si + 1.0) * 30.0)), 10.0);
    float glint = smoothstep(0.3, 0.0, length(sf - 0.25 - 0.5 * hash22(si))) * step(0.85, hash21(si + 2.0)) * tw;
    water += lightC * glint * (0.3 + 1.2 * kick);
    vec3 col = mix(water, floe, ice);
    col = mix(col, col * glowColour(imgLod(p * 0.5 + 0.5, 6.0), p, hueP * 0.159) * 1.3, 0.06);
    finish(col);
}

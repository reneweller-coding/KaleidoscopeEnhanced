#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TruchetMaze.frag
 * @brief TRUCHET MAZE: an endless Truchet labyrinth -- every cell holds two
 * quarter-circle bands that join the neighbours' bands into long winding
 * loops, never ending, never branching; in the bands the kaleidoscoped
 * photograph flows like liquid through tubes, lit as rounded pipes, while the
 * gaps between them show the photo dim and far away.  Two layers of
 * different size lie over each other, the whole field drifting and slowly
 * turning; waves of light travel through the pipes with the music.
 * No up or down: endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the field drifts, the photo flows through the pipes (integrated, jump-free)
 *   audioPhase      -> the colour field wanders (integrated)
 *   audioSwell      -> the pipes swell (slow)
 *   audioKick       -> light waves in the pipes flash (light)
 *   audioMode       -> the palette: cool in minor, warm in major
 *
 * Knobs: cellP (cell size), widthP (pipe width), layerP (second layer),
 * styleP (photo pipes / neon pipes), hueP.
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
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float cellP;   ///< Cell size knob, 0..1.
uniform float widthP;   ///< Width knob, 0..1.
uniform float layerP;   ///< Layer knob, 0..1.
uniform float styleP;   ///< Look knob, 0..1.
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

/// One Truchet layer: returns the band's cross coordinate (0 at the centre
/// line, 1 at the edge; > 1 outside) and the band direction.
float truchet(vec2 x, float w, out vec2 dir)
{
    vec2 id = floor(x), f = fract(x) - 0.5;
    float h = hash21(id);
    float sx = h > 0.5 ? -1.0 : 1.0;                          // the cell's orientation, fixed per cell
    f.x *= sx;
    vec2 d1 = f - vec2(0.5), d2 = f + vec2(0.5);
    float e1 = abs(length(d1) - 0.5), e2 = abs(length(d2) - 0.5);
    vec2 dv = e1 < e2 ? d1 : d2;
    dir = normalize(vec2(-dv.y, dv.x)) * vec2(sx, 1.0);
    return min(e1, e2) / w;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float cells = 3.0 + 7.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    float w = (0.08 + 0.12 * clamp(widthP, 0.0, 1.0)) * (0.85 + 0.3 * swell);
    vec2 x = rot2(0.012 * sceneTime) * p * cells + vec2(0.9 * T, 0.5 * T) + 17.0;
    float px = fwidth(x.x);
    vec2 dir1, dir2;
    float c1 = truchet(x, w, dir1);
    float c2 = truchet(x * 0.5 + 3.7, w * 0.8, dir2);            // the second, larger layer
    float lay = smoothstep(0.1, 0.9, clamp(layerP, 0.0, 1.0));
    // Photo: the background far and dim, the pipes carry it flowing along.
    vec2 uv = p * 0.5 + 0.5;
    vec3 back = imgK(uv * 0.7 + 0.15, 3.0) * 0.18;
    float hueF = hueP * 0.159 + 0.12 * audioPhase + 0.3 * mode;
    vec3 col = back;
    for (int L = 0; L < 2; ++L) {
        float cc = L == 0 ? c2 : c1;
        vec2 dir = L == 0 ? dir2 : dir1;
        float on = L == 0 ? lay : 1.0;
        float pxL = px / w * (L == 0 ? 0.5 : 1.0) * 1.2;
        float band = smoothstep(1.0 + pxL, 1.0 - pxL, cc) * on;
        if (band <= 0.0) continue;
        float round_ = sqrt(max(1.0 - cc * cc, 0.0));          // pipe profile
        vec2 fuv = uv + vec2(0.7, 0.4) * T * 0.3 + (L == 0 ? 0.37 : 0.0);   // flowing (integrated); not along dir: it flips at cell borders
        vec3 ph = imgK(fuv, 1.5);
        float m = luma(ph);
        vec3 field = hsv2rgb(vec3(fract(hueF + 0.25 * m + 0.35 * float(L) + 0.1 * (x.x + x.y) * 0.05), 0.7, 1.0));
        vec3 pipe = mix(max((ph - m) * 1.4 + m, 0.0) * mix(vec3(1.0), field, 0.35), field * (0.3 + 1.2 * m), smoothstep(0.3, 0.7, clamp(styleP, 0.0, 1.0)));
        pipe *= 0.35 + 0.75 * round_;
        pipe += vec3(1.0) * pow(round_, 12.0) * (0.15 + 0.3 * swell);   // highlight along the pipe's crest
        // light waves travelling through the pipes
        float wave = pow(0.5 + 0.5 * sin(dot(x, vec2(0.7, 0.4)) * 2.0 - T * 12.0 + float(L) * 2.0), 8.0);
        pipe += field * wave * (0.25 + 0.9 * kick) * round_;
        col = mix(col, pipe, band);
        col *= 1.0 - 0.35 * smoothstep(1.0, 1.35, cc) * (1.0 - band) * on;   // the pipe's shadow
    }
    finish(col);
}

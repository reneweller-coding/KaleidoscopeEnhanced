#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureGeodeInterior.frag
 * @brief TEXTURE GEODE INTERIOR: looking into a hollow geode that opens
 * endlessly into the depth -- the cavity is lined with crystal points, all
 * pointing inward toward the centre, ring after ring of them receding, each
 * crystal a faceted wedge glowing with light that shines through the
 * stone from outside; the crystals' colours are the photo's colours, and
 * the banded agate crust between the rings is the photo itself.  A light
 * travels slowly around the cavity and sets the facets sparkling.  An
 * endless polar field (like Tunnel), mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift into the depth (integrated, jump-free)
 *   audioPhase      -> the ring of crystals turns (integrated)
 *   audioSpread     -> crystal length (wide spectrum = long points)
 *   audioMode       -> the glow: violet-blue in minor, amber-gold in major (slow blend)
 *   audioHigh       -> facets sparkle (light)
 *   audioBass       -> the light through the stone (light)
 *
 * Knobs: countP (crystals per ring), bandP (share of agate crust), glowP, hueP.
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
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.

uniform float countP;
uniform float bandP;   ///< Band knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
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
    vec2 p = screenP() * 2.5;
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.012 * sceneTime + 0.2 * audioPhase;
    float z = 0.45 / max(r, 1e-3);
    float u = z + 0.18 * sceneTime + 1.0 * audioAdvance;
    float nA = 2.0 * floor(14.0 + 14.0 * clamp(countP, 0.0, 1.0));
    float ringSp = 0.22;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 glowC = mix(vec3(0.55, 0.35, 1.0), vec3(1.0, 0.65, 0.25), mode);
    float lightA = 0.1 * sceneTime;
    // Crystals from this ring and the two rings behind overlap (long points
    // reach into the next ring); draw back to front.
    vec3 crystal = vec3(0.0);
    float cover = 0.0;
    for (int k = 2; k >= 0; --k) {
        float ry = floor(u / ringSp) - float(k);
        float off = hash11(ry * 1.3);
        float gx = a / 6.2831853 * nA - off;
        vec2 gi = vec2(floor(gx), ry);
        float hx = hash21(vec2(mod(gi.x, nA), gi.y));
        vec2 gf = vec2(fract(gx) - 0.5 + 0.2 * (hx - 0.5), (u - ry * ringSp) / ringSp);
        float len = (1.2 + 1.6 * hx) * (0.7 + 0.5 * clamp(audioSpread, 0.0, 1.0));
        float w = 0.48 * (1.0 - gf.y / len);
        float fwx = fwidth(gx) + 0.01;
        float ins = step(0.0, gf.y) * smoothstep(0.0, 0.02, len - gf.y) * smoothstep(w + fwx, w - fwx, abs(gf.x));
        if (ins <= 0.0) continue;
        float facet = gf.x > 0.0 ? 1.0 : 0.0;
        float lit = 0.5 + 0.5 * cos(a - lightA + (facet - 0.5) * 1.3 + hx * 2.0);
        vec2 cuv = vec2(mod(gi.x, nA) * 0.071, gi.y * 0.233);
        vec3 ph = imgLod(cuv, 4.0);
        vec3 cc = mix(glowColour(ph, vec2(cos(a), sin(a)) + gi.y * 0.1, hueP * 0.159), glowC, 0.35);
        // Translucent quartz: the core glows, the facets reflect.
        float t = gf.y / len;
        float trans = (0.5 + 0.9 * clamp(glowP, 0.0, 1.0)) * (0.6 + 0.6 * bass) * (1.0 - 0.5 * t);
        vec3 c = cc * (0.2 + 0.9 * lit) * trans + cc * 0.3 * (1.0 - abs(gf.x) / max(w, 1e-3));
        float edge = smoothstep(0.04, 0.0, abs(abs(gf.x) - w)) + smoothstep(0.03, 0.0, abs(gf.x)) * 0.6;
        c += vec3(1.0) * edge * lit * (0.1 + 0.6 * hi);
        // Glitter at the tips.
        c += vec3(1.0) * smoothstep(0.15, 0.0, len - gf.y) * (0.3 + 1.0 * hi) * step(0.6, hash21(gi + 5.0)) * lit;
        crystal = mix(crystal, c, ins);
        cover = max(cover, ins);
    }
    float inside = cover;
    // The agate crust between the crystals: the photo in bands.
    vec2 buv = vec2(a / 6.2831853 * 2.0, u * 0.35);
    vec3 crust = imgLod(buv, clamp(log2(max(fwidth(u) * 1024.0 * 0.35, 1.0)), 0.0, 8.0));
    crust *= 0.35 + 0.35 * clamp(bandP, 0.0, 1.0);
    vec3 col = mix(crust, crystal, inside);
    // Depth: far rings fade into a glowing core.
    float far = smoothstep(2.0, 8.0, z);
    col = mix(col, glowC * 0.5, far);
    col += glowC * exp(-r * 3.0) * (0.3 + 0.5 * bass);
    finish(col);
}

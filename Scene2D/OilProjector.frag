#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file OilProjector.frag
 * @brief OIL PROJECTOR (rebuilt 30.09.2026): a Mathmos oil-wheel light show,
 * built from what makes the real one mesmerising -- two immiscible dyed
 * oils and clear water sealed between glass, so the picture is made of
 * SHARP rounded interfaces, never of smeared colour: blobs of deep magenta
 * and yellow oil float in the bright water, where they overlap the dyes
 * multiply to red and green, every interface is a dark refraction line
 * with a bright focused rim and a rainbow fringe from the lens, and small
 * air bubbles drift through with dark rings.  The wheel turns slowly, the
 * oils creep and merge under the lamp's heat.  Two or three projectors
 * overlap, their soft light circles blending into one endless wall of
 * light.  The dyes are taken from the photo where it has colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the heat that makes the oils creep (integrated, jump-free)
 *   audioPhase      -> the wheel's turning (integrated)
 *   audioSpread     -> viscosity: a wide spectrum makes the blobs smaller and busier
 *   audioMode       -> the dye pair shifts warmer in major (slow blend)
 *   audioRoughness  -> the interfaces tremble
 *   audioBass       -> the lamps' brightness (light)
 *   audioSwell      -> the size of the oil blobs (slow)
 *
 * Knobs: projP (how many projectors), focusP (sharp or dreamy focus),
 * bubbleP (amount of air bubbles), scaleP (magnification), hueP.
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
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.

uniform float projP;
uniform float focusP;
uniform float bubbleP;
uniform float scaleP;   ///< Scale knob.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
// @expr focusP = clamp(0.55 + 0.25*seed2, 0.0, 1.0)

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

float gHeat, gVisc, gBlob, gRough, gSharp;

/// One oil phase: a warped, smooth field thresholded into round blobs.
/// Returns the signed distance-ish value (0 at the interface, > 0 inside).
float oilField(vec2 q, float seed)
{
    vec2 w = q + 0.55 * vec2(fbm3(q * 0.6 + seed + gHeat * 0.35), fbm3(q * 0.6 + seed + 5.2 - gHeat * 0.3));
    w += 0.03 * gRough * vec2(sin(q.y * 17.0 + sceneTime * 0.7), cos(q.x * 17.0 - sceneTime * 0.6));
    // Few octaves: surface tension keeps the interfaces round, never ragged.
    float f = 0.7 * noise2(w * gVisc + seed * 3.1 + vec2(gHeat * 0.12, -gHeat * 0.09)) + 0.3 * noise2(w * gVisc * 2.1 + seed);
    return (f - (0.57 - 0.08 * gBlob)) * 5.0;
}

/// Light transmitted through the wheel at q for one colour channel's offset.
vec3 wheel(vec2 q, vec3 dyeA, vec3 dyeB, out float edgeA, out float edgeB)
{
    float a = oilField(q, 1.7);
    float b = oilField(q * 1.13 + 3.0, 9.4);
    float s = gSharp;
    float inA = smoothstep(-s, s, a);
    float inB = smoothstep(-s, s, b);
    // Subtractive dyes: each oil absorbs, overlaps multiply.
    vec3 T = vec3(1.0);
    T *= mix(vec3(1.0), dyeA, inA);
    T *= mix(vec3(1.0), dyeB, inB);
    // Interfaces: a dark refraction line with a bright focused rim inside.
    edgeA = exp(-a * a / (s * s * 1.5 + 0.004));
    edgeB = exp(-b * b / (s * s * 1.5 + 0.004));
    float rimA = exp(-pow((a - 2.5 * s) / (s * 1.2 + 0.03), 2.0));
    float rimB = exp(-pow((b - 2.5 * s) / (s * 1.2 + 0.03), 2.0));
    T *= 1.0 - 0.85 * max(edgeA, edgeB);
    T += (dyeA * rimA + dyeB * rimB) * 0.35;
    return T;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gRough = clamp(audioRoughness, 0.0, 1.0);
    gHeat = 0.08 * sceneTime + 0.8 * audioAdvance;
    gVisc = 0.8 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    gBlob = swell;
    gSharp = mix(0.12, 0.03, clamp(focusP, 0.0, 1.0));
    float mag = 1.6 + 1.6 * clamp(scaleP, 0.0, 1.0);

    // Dyes: saturated colours from the photo (or a hue pair where it is grey);
    // the second dye sits across the colour wheel from the first.
    float h0 = hueP * 0.159 + 0.08 * clamp(audioMode, 0.0, 1.0);
    vec3 photoC = imgLod(vec2(0.5) + 0.25 * vec2(sin(0.01 * sceneTime), cos(0.013 * sceneTime)), 6.0);
    // Subtractive dyes like the real oils: bright colours that each absorb
    // one band (yellow, magenta, cyan family), a third of the wheel apart,
    // so their overlaps give the deep red, green and blue.
    float hA = (satOf(photoC) > 0.2) ? hue_of(photoC) : h0;
    vec3 dA = hsv2rgb(vec3(fract(hA), 0.85, 1.0));
    vec3 dB = hsv2rgb(vec3(fract(hA + 0.333), 0.85, 1.0));
    dA = 1.0 - (1.0 - dA) * 1.1; dB = 1.0 - (1.0 - dB) * 1.1;
    dA = clamp(dA * vec3(1.0) + (1.0 - max(dA.r, max(dA.g, dA.b))), 0.0, 1.0);
    dB = clamp(dB + (1.0 - max(dB.r, max(dB.g, dB.b))), 0.0, 1.0);

    int nP = 2 + int(clamp(projP, 0.0, 1.0) * 1.99);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; ++k) {
        if (k >= nP) break;
        float fk = float(k);
        // Each projector: its own wheel angle and a light circle on the wall.
        vec2 c = vec2(0.55 * (fk - 0.5 * float(nP - 1)), 0.08 * sin(fk * 2.3));
        float wheelA = 0.015 * sceneTime * (fk == 1.0 ? -1.0 : 1.0) + 0.3 * audioPhase + fk * 2.1;
        vec2 q = rot2(wheelA) * (p - c) * mag + vec2(fk * 11.0, 0.0);
        // Lens dispersion: each channel sees the wheel slightly shifted
        // radially, which gives the rainbow fringes on the interfaces.
        vec2 disp = (p - c) * 0.012 * mag;
        float eA, eB, e2, e3;
        vec3 tR = wheel(q + disp, dA, dB, eA, eB);
        vec3 tG = wheel(q, dA, dB, e2, e3);
        vec3 tB = wheel(q - disp, dA, dB, e2, e3);
        vec3 T = vec3(tR.r, tG.g, tB.b);
        // Air bubbles: round, bright core, dark refraction ring, drifting with the heat.
        vec2 bq = q * 1.8 + vec2(gHeat * 0.4, -gHeat * 0.25), bi = floor(bq), bf = fract(bq);
        vec2 bc = 0.25 + 0.5 * hash22(bi);
        float br = 0.08 + 0.14 * hash21(bi + 3.0);
        float bd = length(bf - bc) / br;
        float has = step(1.0 - 0.18 * clamp(bubbleP, 0.0, 1.0), hash21(bi + 7.0));
        float ring = exp(-pow((bd - 0.92) / 0.07, 2.0));
        T = mix(T, T * 0.25, has * ring);
        T += vec3(1.0) * has * 0.35 * smoothstep(0.35, 0.0, length(bf - bc - vec2(-0.25, 0.25) * br) / br);
        // The projector's light circle: soft edge, a hot centre.
        float d = length(p - c);
        float lamp = smoothstep(0.95, 0.45, d) * (0.85 + 0.3 * exp(-d * d * 3.0));
        col += T * lamp * (0.55 + 0.4 * bass);
    }
    // Overlapping projectors add up; a little stray light on the wall between.
    col = col / (1.0 + 0.25 * float(nP - 1)) + vec3(0.02, 0.015, 0.03);
    col = mix(vec3(luma(col)), col, 1.25);                 // the dyes glow rich on the wall
    finish(col * 1.05);
}

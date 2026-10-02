#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LavaLamp.frag
 * @brief LAVA LAMP (rebuilt 30.09.2026): inside a lava lamp, filling the frame
 * -- warm wax rises from the heat below in slow, heavy columns, bulges into
 * round heads, pinches off at thin necks, floats up, cools and sinks again,
 * blobs meet and melt into each other.  What makes a real lamp hypnotic and
 * what this rebuild is about: the wax GLOWS from inside (light scattered
 * through it, bright at the thin edges and necks, deep in the thick cores),
 * the liquid around it is tinted and lit from below, every blob is a lens
 * that bends the light behind it, and everything moves at the speed of
 * warm honey.  The wax and liquid colours come from the photo where it has
 * colour.  The view is a flat slab of the lamp, repeated and mirrored
 * across the frame so it runs on without edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the heat that drives the wax up (integrated, jump-free)
 *   audioSwell      -> the amount of wax (slow)
 *   audioSpread     -> viscosity: wide spectrum makes smaller, quicker blobs
 *   audioMode       -> the wax warms from red toward orange-yellow in major (slow blend)
 *   audioBass       -> the glow of the heat below (light)
 *   audioRoughness  -> the wax surface shimmers
 *
 * Knobs: waxP (wax amount), sizeP (blob size), glowP (inner glow), hueP.
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
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSpread;   ///< Spectral spread, 0..1.
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.

uniform float waxP;
uniform float sizeP;   ///< Size knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
// @expr waxP = clamp(0.45 + 0.35*swell + 0.1*seed2, 0.0, 1.0)

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

float gHeat, gVisc;

/// Metaball field of the wax: blobs on lanes that rise and fall slowly,
/// stretched vertically while they move (elongation from their speed).
float waxField(vec2 q, out float neck)
{
    float f = 0.0;
    neck = 0.0;
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float lane = ((fi + 0.5) / 8.0 * 2.0 - 1.0) * 1.6 + 0.1 * sin(fi * 5.3);
        // Each blob: a slow cycle up and down, never in step with the others.
        float per = (22.0 + 12.0 * hash11(fi * 1.7)) / gVisc;
        float ph = gHeat / per + hash11(fi * 3.1);
        float y = -1.3 + 2.6 * (0.5 - 0.5 * cos(ph * 6.2831853));
        float vel = sin(ph * 6.2831853);                     // up/down speed
        float r = (0.16 + 0.12 * hash11(fi * 5.7)) * (0.7 + 0.6 * clamp(sizeP, 0.0, 1.0));
        vec2 c = vec2(lane * 0.9 + 0.05 * sin(ph * 3.0 + fi), y);
        vec2 d = q - c;
        d.y /= 1.0 + 0.55 * abs(vel);                         // stretch while moving
        float g = r * r / (dot(d, d) + 1e-4);
        f += g;
        neck += g * abs(vel);
        // A rising blob still hangs from the pool by a thinning neck.
        float dx = q.x - c.x;
        float col = 0.3 * r * r / (dx * dx + r * r * 0.12) * max(vel, 0.0)
                  * smoothstep(c.y, c.y - 0.25, q.y) * exp(-max(c.y + 1.3, 0.0) * 1.1) * smoothstep(-1.6, -1.2, q.y);
        f += col;
        neck += col;
    }
    // The pool of hot wax along the bottom and a cooler layer at the top.
    f += 0.35 * exp(-(q.y + 1.35) * 4.0) + 0.2 * exp((q.y - 1.35) * 5.0);
    return f;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gHeat = sceneTime * 0.9 + 6.0 * audioAdvance;
    gVisc = 0.8 + 0.6 * clamp(audioSpread, 0.0, 1.0);

    // A slab of the lamp, mirrored across the frame so it never ends.
    vec2 q = p * 2.0;
    q.x = abs(mod(q.x + 1.6, 6.4) - 3.2) - 1.6;
    q += 0.01 * clamp(audioRoughness, 0.0, 1.0) * vec2(sin(q.y * 30.0 + sceneTime), 0.0);

    float neck;
    float thr = 1.0 - 0.35 * clamp(waxP, 0.0, 1.0);
    float f = waxField(q, neck);
    // Gradient of the field (for the lens and the rim light).
    float e = 0.01, nn;
    vec2 gr = vec2(waxField(q + vec2(e, 0.0), nn) - f, waxField(q + vec2(0.0, e), nn) - f) / e;
    float inside = smoothstep(thr - 0.04, thr + 0.04, f);
    // Thickness: how deep into the blob (thin near the surface and at necks).
    float thick = clamp((f - thr) / (thr * 1.8), 0.0, 1.0);

    // Colours: the wax and the liquid, from the photo where it has colour.
    vec3 ph = imgLod(vec2(0.5) + 0.2 * vec2(sin(0.02 * sceneTime), cos(0.017 * sceneTime)), 6.0);
    float h = (satOf(ph) > 0.2) ? hue_of(ph) : hueP * 0.159;
    h += 0.06 * clamp(audioMode, 0.0, 1.0);
    vec3 waxHot = hsv2rgb(vec3(fract(h), 0.9, 1.0));
    vec3 waxDeep = hsv2rgb(vec3(fract(h - 0.03), 1.0, 0.45));
    vec3 liquid = hsv2rgb(vec3(fract(h + 0.5), 0.75, 0.35));

    // The liquid, lit from the heat below, and bent by the blobs (lens).
    vec2 bend = -gr * 0.004;
    vec3 bg = liquid * (0.35 + 0.9 * exp(-(q.y + 1.4) * 1.3) * (0.6 + 0.6 * bass));
    bg *= 0.85 + 0.15 * sin((q.x + bend.x * 20.0) * 12.0 + (q.y + bend.y) * 3.0);       // faint coil shadow bands
    // Wax: glows from inside -- bright where thin, deep where thick.
    float glow = 0.6 + 0.8 * clamp(glowP, 0.0, 1.0);
    // Scattering: the thin skin glows brightest, the core stays saturated.
    vec3 wax = mix(waxHot * 1.35, mix(waxHot, waxDeep, 0.45), smoothstep(0.0, 0.6, thick)) * glow;
    wax += waxHot * clamp(neck / max(f, 1e-3), 0.0, 1.0) * 0.25;       // moving blobs run a little hotter
    // Heat from below lights the wax more toward the bottom.
    wax *= 0.75 + 0.5 * smoothstep(1.3, -1.3, q.y) * (0.6 + 0.6 * bass);
    // Shape: the surface normal from the field; lit from the heat below,
    // a soft sheen from the room light above.
    // (height saturates into the blob, so the core is a smooth dome, not a crease)
    float kH = 2.5 / thr;
    vec2 gh = gr * kH * exp(-max(f - thr, 0.0) * kH);
    vec3 n = normalize(vec3(-gh * 0.012, 1.0));
    wax *= 0.7 + 0.45 * clamp(-n.y * 1.5 + 0.4, 0.0, 1.0);
    wax += vec3(1.0, 0.95, 0.9) * pow(max(dot(n, normalize(vec3(-0.3, 0.5, 1.0))), 0.0), 18.0) * 0.35 * inside;
    // The rim: light caught at the surface.
    float rim = smoothstep(thr + 0.12, thr, f) * inside;
    wax += vec3(1.0, 0.95, 0.85) * rim * 0.35;
    vec3 col = mix(bg, wax, inside);
    // A soft halo of scattered light around the blobs.
    col += waxHot * smoothstep(thr * 0.4, thr, f) * (1.0 - inside) * 0.18;
    finish(col);
}

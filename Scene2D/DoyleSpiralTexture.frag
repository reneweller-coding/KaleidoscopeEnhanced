#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file DoyleSpiralTexture.frag
 * @brief DOYLE SPIRAL TEXTURE: a Doyle spiral -- a packing of circles, each
 * touching six neighbours, winding out from an infinitely small centre in
 * interlocking spiral arms, every circle bigger than the one before; each
 * circle holds its own copy of the photograph (the map is conformal, so
 * every picture keeps its true shape), framed by a thin gold rim; the
 * spiral turns and grows toward us forever.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the spiral grows outward (integrated, jump-free)
 *   audioPhase      -> the spiral turns (integrated)
 *   audioSpread     -> the circles swell (gaps close)
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> the gaps: deep blue in minor, warm dark in major
 *   audioSwell      -> the pictures glow (slow)
 *
 * Knobs: armsP (spiral arms: 5-3 or 8-5 packing, blended), photoZoomP, rimP, hueP.
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

uniform float armsP;
uniform float photoZoomP;
uniform float rimP;
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

/// @brief Complex multiplication.
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv2(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }

/// Hex lattice in log space closing after one turn: 2*pi*i = m*e1 + n*e2, e2 = w*e1.
vec4 doyle(vec2 w, float m, float n, float grow, float zoom, out float rim, out float cellK)
{
    vec2 om = vec2(0.5, 0.8660254);
    vec2 e1 = cdiv2(vec2(0.0, 6.2831853), vec2(m, 0.0) + n * om);
    vec2 e2 = cmul(om, e1);
    // Lattice coordinates.
    float det = e1.x * e2.y - e1.y * e2.x;
    vec2 xy = vec2(w.x * e2.y - w.y * e2.x, e1.x * w.y - e1.y * w.x) / det;
    vec2 b = floor(xy);
    float best = 1e9; vec2 bc = b;
    for (int j = 0; j <= 1; ++j) for (int i = 0; i <= 1; ++i) {
        vec2 c = b + vec2(i, j);
        vec2 cw = c.x * e1 + c.y * e2;
        float d = length(w - cw);
        if (d < best) { best = d; bc = c; }
    }
    float L = length(e1);
    float R = 0.5 * L * grow;
    vec2 cw = bc.x * e1 + bc.y * e2;
    vec2 local = (w - cw) / R;                                  // -1..1 inside the circle
    cellK = bc.x * n - bc.y * m;                                // the same for cells that wrap onto each other
    rim = best / R;
    return vec4(local, best, R);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-5);
    vec2 w = vec2(log(r) - (0.04 * sceneTime + 0.3 * audioAdvance), atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase);
    float grow = 0.9 + 0.1 * clamp(audioSpread, 0.0, 1.0);
    float zoom = 0.25 + 0.3 * clamp(photoZoomP, 0.0, 1.0);
    float rimA, kA, rimB, kB;
    vec4 A = doyle(w, 5.0, 3.0, grow, zoom, rimA, kA);
    vec4 B = doyle(w, 8.0, 5.0, grow, zoom, rimB, kB);
    float mixB = smoothstep(0.47, 0.53, clamp(armsP, 0.0, 1.0) + 0.001);   // a short cross-fade: two packings never sit on top of each other for long
    vec3 gap = mix(vec3(0.02, 0.03, 0.08), vec3(0.06, 0.03, 0.02), mode);
    vec3 outC[2]; float rims[2]; vec4 D[2]; float ks[2];
    D[0] = A; D[1] = B; rims[0] = rimA; rims[1] = rimB; ks[0] = kA; ks[1] = kB;
    for (int s = 0; s < 2; ++s) {
        vec4 d = D[s];
        vec2 local = d.xy;
        float rr = length(local);
        vec2 uv = local * zoom + vec2(hash11(ks[s] * 0.123), hash11(ks[s] * 0.371 + 1.0)) * 0.6 + 0.2 + vec2(0.003, 0.002) * sceneTime;
        vec3 ph = imgLod(uv, 0.8) * (0.85 + 0.4 * swell);
        float px = fwidth(rr) + 1e-4;
        float inside = smoothstep(1.0 + px, 1.0 - px, rr);
        vec3 rimC = mix(vec3(1.0, 0.8, 0.4), glowColour(ph, local, hueP * 0.159), 0.3);
        float rw = 0.04 + 0.08 * clamp(rimP, 0.0, 1.0);
        float rim = smoothstep(rw + px, 0.0, abs(rr - 1.0 + rw));
        vec3 c = mix(gap, ph * (0.8 + 0.2 * (1.0 - rr * rr)), inside);
        c = mix(c, rimC * (0.7 + 1.0 * kick), rim);
        outC[s] = c;
    }
    vec3 col = mix(outC[0], outC[1], mixB);
    // The infinitely small centre dissolves into a glow.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(w.x * 0.1, 0.0), hueP * 0.159);
    col = mix(col, gc * 0.4, smoothstep(0.012, 0.0, r));
    finish(col);
}

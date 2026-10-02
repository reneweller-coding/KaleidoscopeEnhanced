#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureCircuitGlow.frag
 * @brief TEXTURE CIRCUIT GLOW: the photograph etched into a glowing circuit --
 * its structure is traced as circuit traces running only horizontally,
 * vertically and at 45 degrees, with solder pads at the junctions and
 * little vias, on a dark green-black board; pulses of light race along the
 * traces from pad to pad, the board around the busy traces faintly
 * back-lit.  The trace layout follows the photo (each photo wires a
 * different board).  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pulses travel (integrated, jump-free)
 *   audioSpread     -> trace density
 *   audioKick       -> pulses flare (light)
 *   audioMode       -> pulse colour: cyan in minor, amber in major
 *   audioHigh       -> the pads sparkle (light)
 *   audioSwell      -> the board's backlight (slow)
 *
 * Knobs: gridP (grid pitch), padP (pad density), boardP (board colour), hueP.
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
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float gridP;   ///< Grid knob, 0..1.
uniform float padP;
uniform float boardP;
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

float gPitch;
/// Does the edge from cell c in direction k (0 E, 1 NE, 2 N, 3 NW) carry a trace?
float edgeOn(vec2 c, int k, float dens)
{
    vec2 cuv = c / gPitch * 0.9 + 0.5;
    float busy = luma(imgLod(cuv, 3.5)) * 0.5 + length(texGrad(cuv, 4.0)) * 0.08;
    float pk = (k == 1 || k == 3) ? 0.45 : 1.0;               // fewer diagonals
    return step(hash21(c * 1.3 + float(k) * 17.0), (0.2 + 0.5 * busy + 0.3 * dens) * pk * 0.6);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gPitch = 12.0 + 16.0 * clamp(gridP, 0.0, 1.0);
    vec2 q = p * gPitch + vec2(0.15, 0.1) * sceneTime;
    vec2 gi = floor(q), gf = fract(q) - 0.5;
    float dens = clamp(audioSpread, 0.0, 1.0);
    // Segments from the cell centre toward its 8 neighbours; the incoming
    // ones use the neighbour's edge decision, so traces are continuous.
    vec2 dirs[4];
    dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(1.0, 1.0); dirs[2] = vec2(0.0, 1.0); dirs[3] = vec2(-1.0, 1.0);
    float dmin = 9.0; float conn = 0.0; float sAlong = 0.0;
    for (int k = 0; k < 4; ++k) {
        for (int sgn = 0; sgn < 2; ++sgn) {
            vec2 dv = dirs[k] * (sgn == 0 ? 1.0 : -1.0);
            float on = (sgn == 0) ? edgeOn(gi, k, dens) : edgeOn(gi - dirs[k], k, dens);
            if (on < 0.5) continue;
            conn += 1.0;
            vec2 b = dv * 0.5;
            float h = clamp(dot(gf, b) / dot(b, b), 0.0, 1.0);
            float d = length(gf - b * h);
            if (d < dmin) { dmin = d; sAlong = dot(gi, normalize(dirs[k])) + h * length(b) * (sgn == 0 ? 1.0 : -1.0); }
        }
    }
    float px = gPitch / resolution.y * 1.5;
    float w = 0.08;
    float trace = smoothstep(w + px, w - px, dmin);
    float pad = step(0.5, conn) * step(conn, 1.5) * smoothstep(0.2 + px, 0.2 - px, length(gf));   // pads at trace ends
    float via = step(2.5, conn) * smoothstep(0.14 + px, 0.14 - px, length(gf));                    // junctions
    float flow = 1.2 * sceneTime + 8.0 * audioAdvance;
    float pulse = pow(0.5 + 0.5 * sin(sAlong * 0.9 - flow + hash21(gi) * 0.5), 10.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 pc = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.7, 0.2), mode);
    pc = mix(pc, glowColour(imgLod(gi / gPitch * 0.9 + 0.5, 5.0), gi * 0.02, hueP * 0.159), 0.3);
    vec3 board = mix(vec3(0.01, 0.04, 0.025), vec3(0.03, 0.02, 0.05), clamp(boardP, 0.0, 1.0));
    board *= 0.9 + 0.2 * noise2(q * 3.0);
    vec3 copper = vec3(0.45, 0.32, 0.15);
    vec3 col = board + pc * 0.03 * (0.4 + 0.8 * swell);
    col = mix(col, copper * 0.55, max(trace, max(pad, via)));
    col += pc * trace * pulse * (1.3 + 1.5 * kick);
    col += pc * exp(-dmin * 10.0) * pulse * 0.3;
    float tw = pow(0.5 + 0.5 * sin(sceneTime * (0.8 + hash21(gi) * 1.5) + hash21(gi + 2.0) * 6.28), 6.0);
    col += vec3(1.0, 0.95, 0.8) * (pad + via) * (0.12 + 0.8 * hi) * tw;
    finish(col);
}

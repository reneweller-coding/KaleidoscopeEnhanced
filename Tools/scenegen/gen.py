# -*- coding: utf-8 -*-
"""Assemble Scene2D/<Name>.frag from Tools/scenegen/src/<Name>.glsl.

Source format:
    //@doc
     * @brief ...            (doc comment lines, without /** */)
    //@params fooP barP       (per-activation knobs, 0..1; hueP is always added)
    //@audio audioSwell audioSpectrum[32] ...
    //@expr fooP = clamp(0.5 + 0.3*swell, 0.0, 1.0)   (optional, any number)
    //@state W H RATE [32]    (optional: a field of its own, W x H texels, RATE steps a second, 32 for RGBA32F --
                               EffectShader::stepState; declares texState, statePass, stateFrame, stateRes, stateFrac
                               and the helpers of STATE_LIB; main() answers statePass == 1 with the next state)
    //@body
    ... GLSL (functions + main, main ends with finish(col);)
Usage: gen.py Name [Name ...]
"""
import io, os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SP = os.path.dirname(os.path.abspath(__file__))

# Audio uniforms the engine sets as vec3 (left/right energy per band: low, mid, high) -- EffectShader.cpp AL_STBAND*.
VEC3_AUDIO = {"audioStereoL", "audioStereoR"}
BASE_AUDIO = ["audioAdvance", "audioLevel", "audioValence", "audioChromaHue", "audioPhase"]

LIB = r"""
// ---- shared building blocks (texture pool, noise, shapes) ----
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}
// Mirror-repeat in the shader (the engine's textures mirror, the editor's
// repeat -- doing it here makes both identical).  Identity inside [0,1].
vec2 mirrorUV(vec2 uv) { return 1.0 - abs(fract(uv * 0.5) * 2.0 - 1.0); }
// The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
vec3 imgLod(vec2 uv, float lod) {
    uv = mirrorUV(uv);
    return (interpolation * textureLod(tex0, uv, lod) + (1.0 - interpolation) * textureLod(tex1, uv, lod)).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c) {
    vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), k, c.y);
}
float hue_of(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn + 1e-5;
    float h = (mx == c.r) ? (c.g - c.b) / d : (mx == c.g) ? 2.0 + (c.b - c.r) / d : 4.0 + (c.r - c.g) / d;
    return fract(h / 6.0);
}
float satOf(vec3 c) { float mx = max(c.r, max(c.g, c.b)); return (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3); }
// A glowing colour for a place: the photo's own hue where it has one, a
// slowly wandering hue field (anchored on hue0) where the photo is grey.
vec3 glowColour(vec3 photo, vec2 q, float hue0) {
    vec3 field = hsv2rgb(vec3(fract(hue0 + 0.55 * fbm3(q * 0.8) + 0.03 * audioAdvance), 0.85, 1.0));
    vec3 own = photo / max(max(photo.r, max(photo.g, photo.b)), 1e-3); own = own * own * own;
    return mix(field, own, smoothstep(0.12, 0.35, satOf(photo)));
}
// Push a colour toward full saturation, keeping its hue (neon from a photo).
vec3 neonOf(vec3 c, float k) {
    vec3 n = c / max(max(c.r, max(c.g, c.b)), 1e-3);
    return pow(n, vec3(k));
}
// The photo along an endless scroll in y without mirror seams: the photo
// repeats mirrored, so a scroll crosses a visible fold every unit; two reads
// half a period apart are cross-faded so each fold is hidden by the other.
vec3 imgScroll(vec2 uv, float lod) {
    float w = abs(fract(uv.y) - 0.5) * 2.0;           // 1 at the fold, 0 between
    w = smoothstep(0.55, 1.0, w);
    return mix(imgLod(uv, lod), imgLod(uv + vec2(0.37, 0.5), lod), w);
}
// Height from the photo: broad masses plus a share of the detail.
float texHeight(vec2 uv, float lodBroad, float detail) {
    return mix(luma(imgLod(uv, lodBroad)), luma(imgLod(uv, max(lodBroad - 3.0, 0.0))), detail);
}
// Gradient of the photo's luma at a mip level (per UV unit).
vec2 texGrad(vec2 uv, float lod) {
    float e = exp2(lod) / 1024.0;
    return vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
// Edge strength of the photo (0..1-ish) at a mip level.
float texEdge(vec2 uv, float lod) { return length(texGrad(uv, lod)) * exp2(lod) / 1024.0 * 6.0; }

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
// The photo read through a turning kaleidoscope -- the trick of the original
// Kaleidoscope/Tunnel scenes: uv is folded into mirrored wedges around a
// slowly wandering centre and turned with time and the integrated audio
// phase, so the texture itself keeps changing (detailed, continuous, never
// repeating).  The fold is continuous at every wedge border and at the atan
// cut (sides is a whole number); the explicit mip level avoids seams.
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
vec3 imgK(vec2 uv, float lod) { return imgLod(kaleidoUV(uv, 6.0), lod); }
// Other channels than RGB: the photo's structure, read through the kaleidoscope.
// Gradient / edges / Laplacian are rotation invariant in magnitude, so they
// stay seamless across the mirror folds (direction-based colours would not).
vec2 imgKGrad(vec2 uv, float lod)
{
    float e = exp2(lod) / 1024.0 + 0.001;
    return vec2(luma(imgK(uv + vec2(e, 0.0), lod)) - luma(imgK(uv - vec2(e, 0.0), lod)),
                luma(imgK(uv + vec2(0.0, e), lod)) - luma(imgK(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
float imgKEdge(vec2 uv, float lod) { return length(imgKGrad(uv, lod)) * (exp2(lod) / 1024.0 + 0.001) * 6.0; }
float imgKLap(vec2 uv, float lod)
{
    float e = exp2(lod) / 1024.0 + 0.001;
    float c = luma(imgK(uv, lod));
    return (luma(imgK(uv + vec2(e, 0.0), lod)) + luma(imgK(uv - vec2(e, 0.0), lod)) +
            luma(imgK(uv + vec2(0.0, e), lod)) + luma(imgK(uv - vec2(0.0, e), lod)) - 4.0 * c) * 4.0;
}
// Embossed relief of the kaleidoscoped photo, lit from a direction.
float imgKRelief(vec2 uv, float lod, vec2 lightDir)
{
    vec2 g = imgKGrad(uv, lod) * (exp2(lod) / 1024.0 + 0.001) * 8.0;
    return clamp(0.5 + dot(g, normalize(lightDir)), 0.0, 1.0);
}
// A second continuous transform: the photo wound into a log-polar spiral that
// zooms forever (Droste-like).  angle/pi spans one mirror period, so the atan
// cut is seamless; the zoom runs on integrated time, never jumps.
vec2 spiralUV(vec2 uv, float arms, float zoom)
{
    vec2 d = uv - 0.5;
    float r = max(length(d), 1e-4);
    float a = atan(d.y, d.x);
    // Both coordinates jump by whole mirror periods (2) at the cut: the shear
    // a/pi jumps by 2, and a/pi*arms/2 by arms (arms must be even).
    return vec2(log(r) * 0.5 - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5);
}
// Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
vec2 screenP() { return (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0); }
// House finish: loudness brightness and the soft highlight roll-off.
void finish(vec3 col)
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max(col, 0.0);
    t /= 1.0 + 0.35 * max(t.r, max(t.g, t.b));
    fragColor = vec4(clamp(t, 0.0, 1.0), 1.0);
}
"""

# The second photo (17.10.2026): the photo shown before the current one, kept by the app in two slots it fades
# between (RenderPipeline::takePhotoB()); for scenes that set two pictures against each other.
PHOTOB_LIB = r"""
// ---- the second photo ----
/**  The second photo at a mip level: the photo shown before the current one, gliding over to the next when the
 * photos change (the app's two slots, mixed by photoBMix).
 *
 * @param uv   The point (mirrored at the edges, as imgLod()). (in)
 * @param lod  The mip level: 0 full detail, ~4 a soft field. (in)
 *
 * @return
 *   The colour.
 **/
vec3 imgB(vec2 uv, float lod)
{
    uv = mirrorUV(uv);
    float m = smoothstep(0.0, 1.0, clamp(photoBMix, 0.0, 1.0));
    return mix(textureLod(texPhotoB0, uv, lod), textureLod(texPhotoB1, uv, lod), m).rgb;
}
"""

# The scene's colour family (22.10.2026): one wandering hue from the photo and its neighbours, instead of a different
# colour for every cell -- the list of 22.10. asks for "not too colourful" (docs/proposals-2026-10-22-abstrakt-400.md,
# guideline 9).  Appended for sources that call famHue(.
FAMILY_LIB = r"""
// ---- the scene's colour family ----
/**  The hue the scene is built on: the photo's broad colour at a slowly wandering place; where the photo is grey,
 * the hue knob.  It glides with the photos' cross-fade and never jumps.
 *
 * @return
 *   The hue in turns, 0..1.
 **/
float famHue()
{
    vec3 b = imgLod(vec2(0.5) + 0.28 * vec2(cos(0.009 * sceneTime + 0.013 * audioAdvance), sin(0.007 * sceneTime)), 7.0);
    float k = smoothstep(0.06, 0.22, satOf(b));
    vec2 v = mix(vec2(cos(hueP), sin(hueP)), vec2(cos(6.2831853 * hue_of(b)), sin(6.2831853 * hue_of(b))), k);
    return fract(atan(v.y, v.x) / 6.2831853 + 1.0);
}

/**  A colour of the family: t walks the neighbouring hues (a tenth of the circle around the base), at a fixed
 * saturation and full value.
 *
 * @param h  The family's hue (famHue()). (in)
 * @param t  Where in the family, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 famCol(float h, float t)
{
    return hsv2rgb(vec3(fract(h + 0.1 * (t - 0.5)), 0.7, 1.0));
}

/**  A family colour lifted toward warm white light: the highlights and cores of glowing things.
 *
 * @param h  The family's hue. (in)
 * @param t  Where in the family, 0..1. (in)
 * @param w  How far toward warm white, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 famLight(float h, float t, float w)
{
    return mix(famCol(h, t), vec3(1.0, 0.93, 0.82), clamp(w, 0.0, 1.0));
}

/**  The scene's light lifted toward a fuller picture (22.10.2026: the 400 new scenes were half as bright as the old
 * ones): a gain, a gamma below one that widens the glows' soft falloffs, and a faint haze of the colour family that
 * drifts slowly where the picture is dark.  The lift starts above a toe of 0.02, so a scene's flat dark ground stays
 * dark instead of turning into a flat coloured wash.  Each scene's values come from its catalogue frames.
 *
 * @param col   The scene's light. (in)
 * @param gain  The gain. (in)
 * @param gam   The gamma: 1 keeps the falloffs, below 1 widens them. (in)
 * @param haze  The haze's strength (0: none). (in)
 * @param h     The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 famExpose(vec3 col, float gain, float gam, float haze, float h)
{
    const float TOE = 0.02;
    vec3 c = max(col, vec3(0.0));
    col = min(c, vec3(TOE)) + gain * pow(max(c - TOE, vec3(0.0)), vec3(gam));
    vec2 q = screenP();
    float n = fbm(1.1 * q + vec2(0.011, -0.007) * sceneTime);
    vec3 mist = famCol(h, 0.3 + 0.4 * n) * haze * (0.45 + 0.55 * n);
    return col + mist * (1.0 - smoothstep(0.0, 0.25, luma(col)));
}
"""

# The labs of 23.10.2026 (docs/proposals-2026-10-23-flaechig-400.md, family A): a lab has a vocabulary of up to four
# slots, each with some classes; its walk steps one slot at a time to another class, cross-fading the two looks, and
# re-rolls all slots after a new section of the music.  Appended for sources that call labWalk(.
LAB_LIB = r"""
// ---- the lab's walk ----
/** Test pin of slot 0: 1 + the class to hold it on (0: the walk decides). */
uniform float labPinA;
/** Test pin of slot 1. */
uniform float labPinB;
/** Test pin of slot 2. */
uniform float labPinC;
/** Test pin of slot 3. */
uniform float labPinD;
/** The share of an epoch a class change takes to cross-fade. */
const float LAB_FADE = 0.2;
/** The classes of the four slots, for each of the (up to four) looks the walk blends. */
ivec4 gLabK[4];
/** The weights of those looks. */
float gLabW[4];

/**  A class of a slot in an epoch: a hash of the slot, the epoch and the walk's seed.
 *
 * @param s     The slot, 0..3. (in)
 * @param e     The epoch (a whole number). (in)
 * @param seed  The walk's seed. (in)
 * @param n     The number of classes in the slot. (in)
 *
 * @return
 *   The class, 0..n-1.
 **/
int labCls(int s, float e, float seed, int n)
{
    return int(min(floor(hash21(vec2(e * 1.7 + seed, float(s) * 9.13 + 2.1)) * float(n)), float(n - 1)));
}

/**  The lab's walk through its vocabulary, into gLabK (class of every slot) and gLabW (weight of each look).  The
 * slots change one after another (each takes a fifth of an epoch to cross-fade, the others stand), so a look differs
 * from the one it fades into by one class; a new section of the music re-rolls every slot (the old look fades out
 * over eight seconds).  The clock is the music's own advance with a floor of an epoch a minute.  The labPin knobs
 * hold a slot on a class (1 + class), for tests.
 *
 * @param seed    The walk's seed, rolled once per activation. (in)
 * @param n       The number of classes of each slot (0: the slot is not used). (in)
 * @param period  The epoch's length in units of the clock (1: about twenty seconds). (in)
 **/
void labWalk(float seed, ivec4 n, float period)
{
    int nS = max(int(n.x > 0) + int(n.y > 0) + int(n.z > 0) + int(n.w > 0), 1);
    float clk = (0.9 * sceneAdvance + sceneTime / 75.0) / period + fract(seed * 0.37) * 0.8;
    float m = smoothstep(0.0, 8.0, audioSectionAge);
    if (audioSectionPrev == audioSectionId) m = 1.0;
    for (int j = 0; j < 2; ++j) {
        float sd = seed + 0.713 * (j == 0 ? audioSectionPrev : audioSectionId);
        ivec4 base = ivec4(0), alt = ivec4(0);
        int fs = 0;
        float ff = 0.0;
        for (int s = 0; s < 4; ++s) {
            if (n[s] <= 0) continue;
            float w = clk + float(s) / float(nS);
            float e = floor(w);
            base[s] = labCls(s, e, sd, n[s]);
            alt[s] = labCls(s, e + 1.0, sd, n[s]);
            float f = smoothstep(1.0 - LAB_FADE, 1.0, w - e);
            if (f > 0.0) { fs = s; ff = f; }
        }
        float wj = j == 0 ? 1.0 - m : m;
        ivec4 b2 = base;
        b2[fs] = alt[fs];
        gLabK[2 * j] = base;
        gLabW[2 * j] = wj * (1.0 - ff);
        gLabK[2 * j + 1] = b2;
        gLabW[2 * j + 1] = wj * ff;
    }
    if (labPinA + labPinB + labPinC + labPinD > 0.5) {
        for (int i = 0; i < 4; ++i) {
            if (labPinA > 0.5) gLabK[i].x = min(int(labPinA + 0.5) - 1, n.x - 1);
            if (labPinB > 0.5) gLabK[i].y = min(int(labPinB + 0.5) - 1, n.y - 1);
            if (labPinC > 0.5) gLabK[i].z = min(int(labPinC + 0.5) - 1, n.z - 1);
            if (labPinD > 0.5) gLabK[i].w = min(int(labPinD + 0.5) - 1, n.w - 1);
            gLabW[i] = i == 0 ? 1.0 : 0.0;
        }
    }
}
"""

# Fractals filled with the photo (family D of docs/proposals-2026-10-23-flaechig-400.md): the orbit trap is the photo,
# read at the iterates that fall into a window of the plane.  Appended for sources that call fracTrap(.
FRAC_LIB = r"""
// ---- fractals with the photo as orbit trap ----
/**  The photo at an iterate of an orbit, if the iterate lies in the trap window: the photo covers the window
 * |x|, |y| < sc, mirrored beyond it by the photo's mirror repeat.
 *
 * @param z   The iterate. (in)
 * @param sc  The window's half size. (in)
 *
 * @return
 *   The photo's colour (rgb) and the trap's weight (a: 1 well inside the window, 0 outside).
 **/
vec4 fracTrap(vec2 z, float sc)
{
    vec2 q = z / sc;
    float w = (1.0 - smoothstep(0.75, 1.0, max(abs(q.x), abs(q.y)))) * step(dot(z, z), 1e6);
    if (w < 0.002) return vec4(0.0);
    return vec4(imgLod(q * 0.5 + 0.5, 0.6), w);
}

/**  The zoom of an endless-looking fractal tour: a raised cosine over the clock (continuous in value and speed, no
 * wrap jump), from the whole set to a deep zoom and back.
 *
 * @param run    The clock; one cycle per unit. (in)
 * @param depth  How deep the zoom goes, in powers of e. (in)
 *
 * @return
 *   The scale of the view, 1 (the whole set) down to exp(-depth).
 **/
float fracZoom(float run, float depth)
{
    return exp(-depth * (0.5 - 0.5 * cos(6.2831853 * run)));
}

/**  The finished colour of a fractal pixel: the photo gathered by the trap where the orbit visited the window, the
 * dimmed photo's far-away colour where it did not, shaded by how long the orbit lived.
 *
 * @param acc   The sum of the trap's colours weighted. (in)
 * @param accw  The sum of the weights. (in)
 * @param esc   How long the orbit lived, 0 (escaped at once) to 1 (never). (in)
 * @param uv    The pixel's place in the photo, for the background. (in)
 *
 * @return
 *   The colour.
 **/
vec3 fracCompose(vec3 acc, float accw, float esc, vec2 uv)
{
    vec3 hit = acc / max(accw, 1e-3);
    vec3 bg = imgLod(uv, 2.0) * (0.55 + 0.4 * esc);
    return mix(bg, hit, smoothstep(0.0, 0.6, accw));
}

/**  The product of two complex numbers.
 *
 * @param a  The first factor. (in)
 * @param b  The second factor. (in)
 *
 * @return
 *   a times b.
 **/
vec2 fcMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
/**  The quotient of two complex numbers.
 *
 * @param a  The dividend. (in)
 * @param b  The divisor. (in)
 *
 * @return
 *   a divided by b.
 **/
vec2 fcDiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12); }
/**  The complex sine.
 *
 * @param z  The argument. (in)
 *
 * @return
 *   sin z.
 **/
vec2 fcSin(vec2 z) { return vec2(sin(z.x) * cosh(z.y), cos(z.x) * sinh(z.y)); }
/**  The complex exponential.
 *
 * @param z  The argument. (in)
 *
 * @return
 *   exp z.
 **/
vec2 fcExp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }
/**  A real power of a complex number (principal branch).
 *
 * @param z  The base. (in)
 * @param p  The power. (in)
 *
 * @return
 *   z to the power p.
 **/
vec2 fcPow(vec2 z, float p) { float r = length(z), a = atan(z.y, z.x); return pow(r, p) * vec2(cos(p * a), sin(p * a)); }
"""

# Flows that carry the photo (family H of docs/proposals-2026-10-23-flaechig-400.md): a scene defines licVel() and smears the
# photo along its streamlines with licSmear().  Appended for sources that call licSmear(.
LIC_LIB = r"""
// ---- the photo smeared along a flow ----
/**  The photo gathered along the streamline through a place (a line-integral convolution): fourteen dithered steps, seven each way,
 * a tapering kernel, the photo read at a coarser level the farther the step.
 *
 * @param p    The place. (in)
 * @param t    The flow clock. (in)
 * @param len  The length of the smear, in screen units. (in)
 * @param ch   The channel, passed on to licVel(). (in)
 *
 * @return
 *   The colour.
 **/
vec3 licSmear(vec2 p, float t, float len, int ch)
{
    float h = len / 7.0;
    vec3 sum = imgLod(p * 0.8 + 0.5, 0.4);
    float ws = 1.0;
    for (int sg = 0; sg < 2; ++sg) {
        vec2 x = p;
        for (int i = 1; i <= 7; ++i) {
            vec2 v = licVel(x, t, ch);
            float jit = 1.0 + 0.7 * (hash21(gl_FragCoord.xy + vec2(17.0 * float(i), 71.0 * float(sg))) - 0.5);
            x += (sg == 0 ? 1.0 : -1.0) * normalize(v + 1e-4) * h * jit * (0.4 + 0.6 * min(length(v), 1.5));
            float fi = float(i) / 7.0;
            float w = 1.0 - 0.85 * fi;
            sum += w * imgLod(x * 0.8 + 0.5, 0.5 + 1.5 * fi);
            ws += w;
        }
    }
    return sum / ws;
}
"""

# Long exposures of the photo (family J of docs/proposals-2026-10-23-flaechig-400.md): a scene defines expPath() and gathers the photo along it
# with expAccum().  Appended for sources that call expAccum(.
EXPO_LIB = r"""
// ---- the photo as a long exposure ----
/**  The exposure: sixteen dithered readings of the photo along the path of expPath(), averaged (a long exposure), lightened
 * (the brightest and most colourful places leave sharp trails) or weighted with a comet's tail.
 *
 * @param p     The pixel's place. (in)
 * @param t     The clock. (in)
 * @param mode  0 mean, 1 lighten stack, 2 comet (the weights fall off along the path). (in)
 * @param lodk  How much coarser the reads get toward the ends of the path (mip levels). (in)
 *
 * @return
 *   The colour.
 **/
vec3 expAccum(vec2 p, float t, int mode, float lodk)
{
    vec3 sum = vec3(0.0);
    vec3 mx = vec3(0.0);
    float best = -1.0;
    float ws = 0.0;
    float jit = hash21(gl_FragCoord.xy) - 0.5;
    for (int i = 0; i < 16; ++i) {
        float u = (float(i) + jit) / 15.0 - 0.5;
        vec3 c = imgLod(expPath(p, u, t) * 0.8 + 0.5, 0.5 + lodk * abs(u));
        float w = mode == 2 ? exp(-3.0 * (u + 0.5)) : 1.0;
        sum += w * c;
        ws += w;
        float score = luma(c) * (0.3 + 2.0 * satOf(c));
        if (score > best) { best = score; mx = c; }
    }
    vec3 mean = sum / ws;
    return mode == 1 ? mix(mean * 0.55, mx * 1.1, 0.85) : (mode == 2 ? mean * 1.3 : mean);
}
"""

# The music as a building plan (family L of docs/proposals-2026-10-23-flaechig-400.md): beat, bar and phrase clocks that
# fall back to a steady clock where the tempo is not known, and a smooth bump on a cycle.  Appended for sources that
# call rhyBeat(, rhyBar(, rhyPhrase( or rhySec.
RHY_LIB = r"""
// ---- the beat, the bar and the phrase as clocks ----
/**  The position inside the beat, 0..1 (a steady two-beats-a-second clock where the tempo is not known).
 *
 * @return
 *   The phase; use it only through periodic functions, it wraps once a beat.
 **/
float rhyBeat() { return audioBeatPhase > 0.001 ? audioBeatPhase : fract(sceneTime * 2.0); }
/**  The position inside the bar (four beats), 0..1 (a two-second clock where the tempo is not known).
 *
 * @return
 *   The phase; it wraps once a bar.
 **/
float rhyBar() { return audioBarPhase > 0.001 ? audioBarPhase : fract(sceneTime * 0.5); }
/**  The position inside the phrase (eight bars), 0..1 (a sixteen-second clock where the tempo is not known).
 *
 * @return
 *   The phase; it wraps once a phrase.
 **/
float rhyPhrase() { return audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime * 0.0625); }
/**  A smooth bump on a cycle: 1 at a position, 0 farther away than a width, the cycle closing round (no jump at its end).
 *
 * @param x   The position on the cycle. (in)
 * @param at  The bump's centre. (in)
 * @param n   The cycle's length. (in)
 * @param w   The bump's half width. (in)
 *
 * @return
 *   The bump, 0..1.
 **/
float rhyBump(float x, float at, float n, float w)
{
    float d = abs(mod(x - at + 0.5 * n, n) - 0.5 * n);
    return smoothstep(w, 0.0, d);
}
/**  How far a section change has been taken over: 0 right after it, 1 six seconds later.
 *
 * @return
 *   The blend, 0..1.
 **/
float rhySecBlend() { return smoothstep(0.0, 6.0, audioSectionAge); }
/**  The previous section's number, folded into a count of choices.
 *
 * @param n  How many choices. (in)
 *
 * @return
 *   0 .. n-1.
 **/
float rhySecPrev(float n) { return mod(max(audioSectionPrev, 0.0), n); }
/**  The current section's number, folded into a count of choices.
 *
 * @param n  How many choices. (in)
 *
 * @return
 *   0 .. n-1.
 **/
float rhySecCur(float n) { return mod(max(audioSectionId, 0.0), n); }
"""

# Scenes with a field of their own (//@state W H RATE [32], EffectShader::stepState): the step's helpers.
STATE_LIB = r"""
// ---- the scene's own field (state pass) ----
/**  An integer hash (Wellons' lowbias32).
 *
 * @param x  The input. (in)
 *
 * @return
 *   A well mixed 32-bit value.
 **/
uint stHashU(uint x)
{
    x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
    return x;
}
/**  A random number for this cell and this step (state pass): a different one for every k.
 *
 * @param k  Which of the cell's random streams. (in)
 *
 * @return
 *   A pseudo-random number 0..1, the same for the same cell, step and k.
 **/
float stRand(int k)
{
    uvec2 c = uvec2(gl_FragCoord.xy);
    uint  h = stHashU(c.x + stHashU(c.y + stHashU(uint(stateFrame) * 8u + uint(k))));
    return float(h >> 8u) / 16777216.0;
}
/**  A random number for this step, the same in every cell (state pass).
 *
 * @param k  Which of the step's random streams. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float stRandStep(int k) { return float(stHashU(uint(stateFrame) * 8u + uint(k) + 0x9e3779b9u) >> 8u) / 16777216.0; }
/**  A cell wrapped into the field (the field is a torus).
 *
 * @param ip  The cell, anywhere. (in)
 *
 * @return
 *   The same cell inside 0..stateRes-1.
 *
 * The wrap uses floor, not %: GLSL leaves % undefined for a negative operand, and NVIDIA's -1 % 200 read a cell in
 * the middle of the field (a rotor-router grew four discs from one source).
 **/
ivec2 stWrap(ivec2 ip)
{
    vec2 s = stateRes;
    return ivec2(vec2(ip) - s * floor((vec2(ip) + 0.5) / s));
}
/**  The field at a cell, wrapped around.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The cell's state from the last step.
 **/
vec4 stAt(ivec2 ip) { return texelFetch(texState, stWrap(ip), 0); }
/**  This texel's cell in the state pass.
 *
 * @return
 *   The cell's integer coordinate.
 **/
ivec2 stCell() { return ivec2(gl_FragCoord.xy); }
/**  The field filtered at a coordinate in cells (linear, wrapped).
 *
 * @param c  The coordinate in cells (cell centres at .5). (in)
 *
 * @return
 *   The interpolated state.
 **/
vec4 stLin(vec2 c) { return texture(texState, c / stateRes); }
/**  The five-point Laplacian of the field at a cell.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The neighbours' sum minus four times the cell.
 **/
vec4 stLap(ivec2 ip)
{
    return stAt(ip + ivec2(1, 0)) + stAt(ip - ivec2(1, 0)) + stAt(ip + ivec2(0, 1)) + stAt(ip - ivec2(0, 1))
           - 4.0 * stAt(ip);
}
/**  The nine-point Laplacian (isotropic: the diagonals weigh a quarter, the sides a half).
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   The isotropic Laplacian of the field.
 **/
vec4 stLap9(ivec2 ip)
{
    vec4 s = stAt(ip + ivec2(1, 0)) + stAt(ip - ivec2(1, 0)) + stAt(ip + ivec2(0, 1)) + stAt(ip - ivec2(0, 1));
    vec4 d = stAt(ip + ivec2(1, 1)) + stAt(ip - ivec2(1, 1)) + stAt(ip + ivec2(1, -1)) + stAt(ip + ivec2(-1, 1));
    return 0.5 * s + 0.25 * d - 3.0 * stAt(ip);
}
/**  Where the screen shows the field: a screen point (screenP()) mapped to field cells, the field's height
 * filling the screen's height divided by zoom; the field repeats beyond it.
 *
 * @param p     The screen point. (in)
 * @param zoom  How many field heights the screen shows. (in)
 *
 * @return
 *   The coordinate in cells.
 **/
vec2 stView(vec2 p, float zoom) { return (p * zoom + vec2(0.5 * stateRes.x / stateRes.y, 0.5)) * stateRes.y; }
/**  The photo carried by a flow, one step (state pass).  The field's rg hold the displacement D = uv - x / H of the
 * photo coordinate each cell shows: periodic where uv itself is not, so the torus has no seam.  Moving the fluid by
 * vel gives D_new(x) = D(x - vel) - vel / H (traced back, linearly filtered); fresh pulls it back toward the plain
 * photo.  b and a travel along with the fluid.
 *
 * @param vel    The fluid's displacement at this cell this step, in cells. (in)
 * @param fresh  The share pulled back toward the plain photo this step. (in)
 *
 * @return
 *   The new displacement (rg) and the carried b, a.
 **/
vec4 stCarry(vec2 vel, float fresh)
{
    vec4 c = stLin(vec2(stCell()) + 0.5 - vel);
    c.rg = (c.rg - vel / stateRes.y) * (1.0 - fresh);
    return c;
}
/**  The photo coordinate the frame shows at a field coordinate (a field carried by stCarry()).
 *
 * @param cc  The coordinate in cells. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 stUV(vec2 cc) { return cc / stateRes.y + stLin(cc).rg; }
/**  The mip level for a carried photo: how much the map stretches one screen pixel (strands finer than a pixel are
 * averaged, not aliased).
 *
 * @param cc     The coordinate in cells. (in)
 * @param cellPx Screen pixels per cell. (in)
 *
 * @return
 *   The mip level, 0..6.
 **/
float stLod(vec2 cc, float cellPx)
{
    vec2 d0 = stLin(cc).rg;
    vec2 ux = stLin(cc + vec2(1.0, 0.0)).rg - d0 + vec2(1.0 / stateRes.y, 0.0);
    vec2 uy = stLin(cc + vec2(0.0, 1.0)).rg - d0 + vec2(0.0, 1.0 / stateRes.y);
    return clamp(log2(max(max(length(ux), length(uy)) * 1024.0 / max(cellPx, 1e-3), 1.0)), 0.0, 6.0);
}
"""

CHAIN_LIB = r"""
// ---- composable continuous transforms (photo space, centre 0.5) ----
// Every stage may be followed by mirrorUV: it is continuous and periodic with
// the photo's mirror period 2, so stages whose output jumps by whole periods
// (log-polar at the atan cut) stay seamless, in any order and any number.
vec2 tKaleido(vec2 uv, vec2 c, float sides, float rot)
{
    vec2 d = uv - c;
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec) + rot;
    return c + length(d) * vec2(cos(a), sin(a));
}
vec2 tSpiral(vec2 uv, vec2 c, float arms, float scale, float zoom)
{
    vec2 d = uv - c;
    float a = atan(d.y, d.x);
    // both outputs jump by even integers at the cut (arms even) -> seamless after mirrorUV
    return vec2(log(max(length(d), 1e-5)) * scale - zoom + a / 3.14159265, a / 3.14159265 * arms * 0.5);
}
vec2 tMobius(vec2 uv, vec2 pa, vec2 pb, float scale)
{
    vec2 z1 = uv - pa, z2 = uv - pb;
    vec2 w = vec2(z1.x * z2.x + z1.y * z2.y, z1.y * z2.x - z1.x * z2.y) / max(dot(z2, z2), 1e-6);
    return 0.5 + w * scale;
}
vec2 tSquare(vec2 uv, vec2 c, float scale)
{
    vec2 z = (uv - c) * scale;
    return c + vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
}
vec2 tInvert(vec2 uv, vec2 c, float R)
{
    vec2 d = uv - c;
    return c + d * R * R / max(dot(d, d), 1e-5);
}
vec2 tTwirl(vec2 uv, vec2 c, float amount, float radius)
{
    vec2 d = uv - c;
    float a = amount * exp(-dot(d, d) / (radius * radius));
    return c + rot2(a) * d;
}
vec2 tWarp(vec2 uv, float strength, float t)
{
    return uv + strength * (vec2(fbm3(uv * 3.0 + vec2(t, 0.0)), fbm3(uv * 3.0 + vec2(5.2, -t))) - 0.5);
}
vec2 tFold(vec2 uv, float ang, float scale, float iters)
{
    vec2 q = uv - 0.5;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        q = abs(q);
        q = rot2(ang) * q - vec2(0.12, 0.08);
        q *= scale;
    }
    return q + 0.5;
}
vec2 tP4m(vec2 uv, float cells)
{
    vec2 f = abs(fract(uv * cells * 0.5) * 2.0 - 1.0);
    return f.y > f.x ? f.yx : f;
}
vec2 tRot(vec2 uv, vec2 c, float a) { return c + rot2(a) * (uv - c); }
// The classic tunnel: angle around, 1/r along (both jump by whole periods at the cut).
vec2 tTunnel(vec2 uv, vec2 c, float depth, float travel)
{
    vec2 d = uv - c;
    return vec2(atan(d.y, d.x) / 3.14159265, depth / max(length(d), 1e-3) + travel);
}
// Plain polar unwrap: angle across, radius along.
vec2 tPolar(vec2 uv, vec2 c, float scale)
{
    vec2 d = uv - c;
    return vec2(atan(d.y, d.x) / 3.14159265, length(d) * scale);
}
// Six-fold mirror tiling (p6m) of the plane, cell size 1/cells.
vec2 tHex(vec2 uv, float cells)
{
    vec2 q = (uv - 0.5) * cells;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float an = atan(h.y, h.x);
    float sec = 1.0471976;
    an = abs(mod(an, sec) - 0.5 * sec);
    return 0.5 + length(h) * vec2(cos(an), sin(an)) / cells * 2.0;
}
// Complex exponential and sine: entire functions, smooth everywhere.
vec2 tExp(vec2 uv, vec2 c, float k)
{
    vec2 z = (uv - c) * k;
    return c + exp(z.x) * vec2(cos(z.y), sin(z.y)) * 0.3;
}
vec2 tSin(vec2 uv, vec2 c, float k)
{
    vec2 z = (uv - c) * k;
    return c + vec2(sin(z.x) * cosh(z.y), cos(z.x) * sinh(z.y)) * 0.3;
}
// Radial ripple and a sinusoidal shear wave.
vec2 tRipple(vec2 uv, vec2 c, float freq, float amp, float t)
{
    vec2 d = uv - c;
    float r = length(d);
    return uv + d / max(r, 1e-4) * amp * sin(r * freq - t);
}
vec2 tWave(vec2 uv, float freq, float amp, float t)
{
    return uv + amp * vec2(sin(uv.y * freq + t), sin(uv.x * freq * 1.3 - t * 0.8));
}
// Lens: bulge (k > 0) or pinch (k < 0) inside radius R.
vec2 tLens(vec2 uv, vec2 c, float R, float k)
{
    vec2 d = uv - c;
    float r = length(d) / R;
    float f = r < 1.0 ? pow(max(r, 1e-4), k) / max(r, 1e-4) : 1.0;
    return c + d * mix(1.0, f, smoothstep(1.0, 0.6, r));
}
// Droste zoom without a spiral: the radius is folded in log scale (a
// triangle wave in log r), so the picture repeats inward at every scale,
// mirrored at each repeat; the zoom runs on integrated time.
vec2 tDroste(vec2 uv, vec2 c, float K, float zoom)
{
    vec2 d = uv - c;
    float r = max(length(d), 1e-5);
    float u = log(r) / log(K) - zoom;
    float tri = abs(fract(u * 0.5) * 2.0 - 1.0);               // 0..1 triangle wave
    return c + d / r * exp(tri * log(K)) * 0.15;
}
// A single mirror line through c at angle a (the half-plane reflected).
vec2 tMirrorLine(vec2 uv, vec2 c, float a)
{
    vec2 n = vec2(cos(a), sin(a));
    float s = dot(uv - c, n);
    return uv - n * (s - abs(s));
}

// The {p,q} reflection folding inside the unit disk (shared by the disk and
// the band model).
vec2 poincareFold(vec2 z, float p, float q)
{
    float a = 3.14159265 / p;
    float cq = cos(3.14159265 / q), sa = sin(a);
    float R = 1.0 / sqrt(max(cq * cq / (sa * sa) - 1.0, 1e-4));
    vec2 cc = vec2(R * cq / sa, 0.0);
    for (int i = 0; i < 14; ++i) {
        float an = atan(z.y, z.x);
        an = abs(mod(an, 2.0 * a) - a);                         // mirror into the wedge [0, pi/p]
        z = length(z) * vec2(cos(an), sin(an));
        vec2 d = z - cc;
        float dd = dot(d, d);
        if (dd < R * R) z = cc + d * (R * R / dd);               // mirror in the orthogonal circle
    }
    return z;
}
// Poincare-disc transform about c (zoom, move: hyperbolic drift).
// Hyperbolic {p,q} tiling of the Poincare disk, built only from mirrors (the
// p-fold kaleidoscope and the inversion in a circle orthogonal to the rim), so
// the map is continuous; the outside of the disk is folded in by the inversion
// in the rim.  `move` is a point inside the disk: the disk automorphism
// z -> (z - a) / (1 - conj(a) z) carries the tiling along it (a flight
// through the hyperbolic plane).  Needs 1/p + 1/q < 1/2.
vec2 tPoincare(vec2 uv, vec2 c, float p, float q, float zoom, vec2 move)
{
    vec2 z = (uv - c) * zoom;
    float r2 = dot(z, z);
    if (r2 > 1.0) z /= r2;                                      // fold the outside in (continuous at the rim)
    vec2 nu = z - move, de = vec2(1.0, 0.0) - vec2(move.x * z.x + move.y * z.y, move.x * z.y - move.y * z.x);
    z = vec2(nu.x * de.x + nu.y * de.y, nu.y * de.x - nu.x * de.y) / max(dot(de, de), 1e-6);
    return c + poincareFold(z, p, q) * 0.9;
}
// The hyperbolic plane in the BAND model (the hyperbolic Mercator: a line of
// the plane becomes the band's axis), z = tanh(pi w / 4).  The screen's
// height is mirror-folded into the band, so the tiling runs as an endless
// strip; a shift along the band is an exact hyperbolic translation -- the
// strip flows without end.
vec2 tHyperBand(vec2 uv, vec2 c, float p, float q, float height, float travel)
{
    vec2 w = (uv - c) * vec2(4.0, 2.0 / height);
    w.y = abs(fract(w.y * 0.5 + 0.5) * 2.0 - 1.0) * 2.0 - 1.0;   // triangle wave: mirrored at the band's rims
    w.y *= 0.985;                                               // the rims are the circle at infinity
    w.x += travel;
    w *= 0.7853982;                                             // pi / 4
    // tanh of a complex number: (sinh 2x + i sin 2y) / (cosh 2x + cos 2y)
    float den = cosh(2.0 * w.x) + cos(2.0 * w.y);
    vec2 z = vec2(sinh(2.0 * w.x), sin(2.0 * w.y)) / max(den, 1e-4);
    return c + poincareFold(z, p, q) * 0.9;
}
// The spiral Droste of Escher's "Print Gallery" as reconstructed by Lenstra
// and de Smit: in log space the picture is multiplied by beta = 1 - i log(K)/(2 pi),
// so one turn around the centre is two scale steps K; the log-radius is folded
// by a mirrored triangle wave of period log K, the angle is kept -- the
// picture contains itself, turned and shrunk, endlessly, and zooms along the
// spiral (zoom: integrated time).  Seamless: one turn shifts the log-radius
// by exactly one period of the mirrored wave (2 log K; with log K it was half
// a period, and the mirror showed as a hard seam).
vec2 tDrosteSpiral(vec2 uv, vec2 c, float K, float zoom)
{
    vec2 d = uv - c;
    vec2 L = vec2(log(max(length(d), 1e-5)), atan(d.y, d.x));
    float lk = log(K), b = -lk / 3.14159265;                   // one turn = TWO mirrored steps (one period of the triangle wave)
    vec2 w = vec2(L.x - b * L.y, L.y + b * L.x);               // (1 + i b) * L
    float u = (w.x - zoom * lk) / lk;
    float tri = abs(fract(u * 0.5) * 2.0 - 1.0);               // mirrored, period 2: 0..1..0
    return c + exp(tri * lk - lk) * vec2(cos(w.y), sin(w.y)) * 0.45;
}
vec2 cexpi(float a) { return vec2(cos(a), sin(a)); }
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-8); }
vec2 hexWave3(vec2 X, float n, float m)
{
    const float TAU = 6.2831853;
    vec2 Y = vec2(X.x + X.y * 0.5773503, X.y * 1.1547005);
    return (cexpi(TAU * (n * Y.x + m * Y.y)) + cexpi(TAU * (m * Y.x - (n + m) * Y.y)) + cexpi(TAU * (-(n + m) * Y.x + n * Y.y))) / 3.0;
}
vec2 sqWave4(vec2 X, float n, float m)
{
    const float TAU = 6.2831853;
    return (cexpi(TAU * (n * X.x + m * X.y)) + cexpi(TAU * (-m * X.x + n * X.y))
          + cexpi(TAU * (-n * X.x - m * X.y)) + cexpi(TAU * (m * X.x - n * X.y))) / 4.0;
}
vec2 farrisWave(vec2 X, int kind, float n, float m)
{
    const float TAU = 6.2831853;
    if (kind == 6) return 0.5 * (hexWave3(X, n, m) + hexWave3(X, m, n));            // p3m1: p3 + mirrors
    if (kind >= 10) {                                                                // p1, p2, pm, cm
        vec2 Z = kind == 13 ? X * vec2(0.8, 1.3) : vec2(X.x + 0.3 * X.y, X.y * 1.1);       // oblique / centred lattice
        vec2 w = cexpi(TAU * (n * Z.x + m * Z.y));
        if (kind == 11) w += cexpi(-TAU * (n * Z.x + m * Z.y));                         // p2: half-turns
        if (kind == 12 || kind == 13) w += cexpi(TAU * (n * Z.x - m * Z.y));            // pm / cm: one mirror
        return w / (kind == 10 ? 1.0 : 2.0);
    }
    if (kind == 7) return 0.5 * (hexWave3(X, n, m) + hexWave3(X, -m, -n));          // p31m
    if (kind == 8) return 0.5 * (sqWave4(X, n, m) + (mod(n + m, 2.0) < 0.5 ? 1.0 : -1.0) * sqWave4(X, m, n));   // p4g: p4 + glides
    if (kind == 9) {                                                                 // cmm: centred rectangular, mirrors both ways
        vec2 Z = X * vec2(0.8, 1.3);
        return 0.25 * (cexpi(TAU * (n * Z.x + m * Z.y)) + cexpi(-TAU * (n * Z.x + m * Z.y))
                     + cexpi(TAU * (n * Z.x - m * Z.y)) + cexpi(-TAU * (n * Z.x - m * Z.y)));
    }
    if (kind == 1 || kind == 2) {                               // hexagonal lattice coordinates
        vec2 Y = vec2(X.x + X.y * 0.5773503, X.y * 1.1547005);
        vec2 w = cexpi(TAU * (n * Y.x + m * Y.y)) + cexpi(TAU * (m * Y.x - (n + m) * Y.y)) + cexpi(TAU * (-(n + m) * Y.x + n * Y.y));
        if (kind == 2) w += cexpi(-TAU * (n * Y.x + m * Y.y)) + cexpi(-TAU * (m * Y.x - (n + m) * Y.y)) + cexpi(-TAU * (-(n + m) * Y.x + n * Y.y));
        return w / (kind == 2 ? 6.0 : 3.0);
    }
    if (kind == 4 || kind == 5) {                               // glide groups on a rectangular lattice
        float sg = mod(n, 2.0) < 0.5 ? 1.0 : -1.0;                 // (-1)^n: the half-step of the glide
        vec2 w = cexpi(TAU * (n * X.x + m * X.y * 0.7)) + sg * cexpi(TAU * (n * X.x - m * X.y * 0.7));
        if (kind == 5) w += cexpi(-TAU * (n * X.x + m * X.y * 0.7)) + sg * cexpi(TAU * (-n * X.x + m * X.y * 0.7));
        return w / (kind == 5 ? 4.0 : 2.0);
    }
    vec2 w = cexpi(TAU * (n * X.x + m * X.y)) + cexpi(TAU * (-m * X.x + n * X.y))
           + cexpi(TAU * (-n * X.x - m * X.y)) + cexpi(TAU * (m * X.x - n * X.y));
    if (kind == 3) w += cexpi(TAU * (m * X.x + n * X.y)) + cexpi(TAU * (-n * X.x + m * X.y))
                      + cexpi(TAU * (-m * X.x - n * X.y)) + cexpi(TAU * (n * X.x - m * X.y));
    return w / (kind == 3 ? 8.0 : 4.0);
}
// Wallpaper-group transform about c (kind: the group, cells: cells per unit, t: phase).
// Farris wallpaper functions ("Creating Symmetry", 2015): sums of plane waves
// averaged over a symmetry group are smooth complex functions with exactly
// that symmetry; their value at a point picks the photo's pixel.  Three waves
// whose amplitudes and phases drift with time: the wallpaper keeps changing
// while keeping its symmetry.  kind 0: p4 (square), 1: p3 (hexagonal),
// 2: p6, 3: p4m (square with mirrors), 4: pg, 5: pgg (glide reflections --
// impossible as a fold, natural as a wave function), 6: p3m1, 7: p31m, 8: p4g, 9: cmm.
vec2 tFarris(vec2 uv, vec2 c, int kind, float cells, float t)
{
    vec2 X = (uv - c) * cells;
    vec2 f = cmul(cexpi(t * 0.7), farrisWave(X, kind, 1.0, 0.0)) * (0.8 + 0.2 * sin(t * 0.31))
           + cmul(cexpi(-t * 0.5 + 1.0), farrisWave(X, kind, 1.0, 1.0)) * (0.6 + 0.4 * sin(t * 0.23 + 2.0))
           + cmul(cexpi(t * 0.9 + 2.0), farrisWave(X, kind, 2.0, kind == 3 ? 1.0 : -1.0)) * (0.4 + 0.3 * sin(t * 0.17 + 4.0))
           + (kind == 3 ? cmul(cexpi(-t * 0.6), farrisWave(X, kind, 3.0, 1.0)) * 0.5 : vec2(0.0));   // p4m: chiral waves made symmetric by the mirrors
    return c + f * 0.35;
}
// ---- Peirce quincuncial: the plane as a square-tiled sphere ----
vec2 csin(vec2 a) { return vec2(sin(a.x) * cosh(a.y), cos(a.x) * sinh(a.y)); }
vec2 ccos(vec2 a) { return vec2(cos(a.x) * cosh(a.y), -sin(a.x) * sinh(a.y)); }
// Numerator and denominator of the Jacobi cn function via theta series.
// cn(u; m = 1/2) is doubly periodic on a square lattice (its periods 4K and
// 2K + 2iK, with K = K' = 1.8540747) and maps each square onto the Riemann
// sphere: Peirce's quincuncial projection, inverted.  For m = 1/2 the theta
// nome is q = exp(-pi), so three terms of each series are exact to float
// precision.  cn = (th4(0)/th2(0)) * th2(v) / th4(v), v = pi u / (2K).
void cnTheta(vec2 v, out vec2 N, out vec2 D)
{
    // reduce by the periods (2 pi and pi + i pi in v): the series stay small
    float n = floor(v.y / 3.14159265 + 0.5);
    v -= n * vec2(3.14159265, 3.14159265);
    v.x = mod(v.x + 3.14159265, 6.2831853) - 3.14159265;
    const float q14 = 0.4559381, q94 = 0.0008505, q254 = 1.6e-9;   // q^(1/4), q^(9/4), q^(25/4)
    const float q1 = 0.0432139, q4 = 3.487e-6;                       // q, q^4
    vec2 th2 = 2.0 * (q14 * ccos(v) + q94 * ccos(3.0 * v) + q254 * ccos(5.0 * v));
    vec2 th4 = vec2(1.0, 0.0) + 2.0 * (-q1 * ccos(2.0 * v) + q4 * ccos(4.0 * v));
    N = th2 * (1.0 - 2.0 * q1 + 2.0 * q4) / (2.0 * (q14 + q94 + q254));   // th4(0) / th2(0)
    D = th4;
}
// The picture on a turning sphere, seen through Peirce's square tiling.  The
// sphere point is lifted from N/D without dividing (poles are harmless), turned
// about two axes, and projected back stereographically.
vec2 tQuincunx(vec2 uv, vec2 c, float scale, float a1, float a2)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    z = vec2(z.x - z.y, z.x + z.y) * 0.7071068;                  // squares upright
    vec2 N, D;
    cnTheta(z * 0.8472131, N, D);                                // pi / (2K)
    vec2 ND = vec2(N.x * D.x + N.y * D.y, N.y * D.x - N.x * D.y);   // N * conj(D)
    float nn = dot(N, N), dd = dot(D, D);
    vec3 P = vec3(2.0 * ND, nn - dd) / max(nn + dd, 1e-12);
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return c + P.xy / max(1.0 - P.z, 1e-3) * 0.4;
}
// Apollonian inversion fold: mirrored repetition and inversion in the unit
// circle, alternating -- the circle packings and limit-set lace of Kleinian
// groups (Indra's Pearls), built only from continuous steps (a mirrored
// triangle wave instead of the usual fract, an unconditional inversion).
vec2 tApollo(vec2 uv, vec2 c, float s, float iters)
{
    vec2 p = (uv - c) * 2.2;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0) * 2.0 - 1.0;   // mirrored repeat, period 4 (continuous)
        p *= s / max(dot(p, p), 1e-3);
    }
    return c + p * 0.25;
}
// Farris rosettes: sums of z^n conj(z)^m with n - m = k (mod p) -- p-fold
// rosettes; with k = 1 the pattern has COLOUR TURNING: turning the plane by
// 2 pi / p turns the picture looked up by the same step, so the photo's
// colours travel round the rosette.  Coefficients turn with time.
vec2 rosetteTerm(float r, float th, float d, float e) { return pow(r, e) * vec2(cos(d * th), sin(d * th)); }
vec2 tRosette(vec2 uv, vec2 c, float p, float k, float t)
{
    vec2 d0 = (uv - c) * 1.7;
    float r = length(d0), th = atan(d0.y, d0.x);
    float d1 = k + p, d2 = k - p;
    vec2 f = cmul(cexpi(t * 0.6), rosetteTerm(r, th, d1, abs(d1)))
           + cmul(cexpi(-t * 0.4 + 1.0), rosetteTerm(r, th, d2, abs(d2))) * 0.8
           + cmul(cexpi(t * 0.3 + 2.0), rosetteTerm(r, th, k, abs(k) + 2.0)) * 0.6;
    return c + f * 0.6;                                         // audit: 0.3 read too small a patch (flat, grey)
}
// ---- Penrose rhombus tiling (de Bruijn's pentagrid) ----
vec2 pentE(int j) { float a = 1.2566371 * float(j); return vec2(cos(a), sin(a)); }
float pentG(int j, vec4 g) { return j == 0 ? g.x : j == 1 ? g.y : j == 2 ? g.z : j == 3 ? g.w : -(g.x + g.y + g.z + g.w); }
// Finds the Penrose rhomb a point lies in (de Bruijn pentagrid).
// Five families of parallel lines (directions e_j = 72 deg apart, offsets
// gam_j with sum 0).  Every crossing of a line of family r (value n_r) with
// one of family s (n_s) is a rhombus with edges e_r, e_s; its corner is
// sum_j K_j e_j with K_j = ceil(p . e_j + gam_j) at the crossing p, and K_r,
// K_s = n_r, n_s.  The tiling is about 5/2 times the pentagrid, so the
// crossings near x * 0.4 are searched (3 x 3 per pair of families).  Returns
// the rhombus coordinates a, b in [0, 1] (x = base + a e_r + b e_s).
bool penroseFind(vec2 x, vec4 g, out vec2 ab, out int rr, out int ss, out vec2 base, out vec2 nrs)
{
    vec2 pg = x * 0.4;
    ab = vec2(0.5); rr = 0; ss = 1; base = vec2(0.0); nrs = vec2(0.0);
    for (int r = 0; r < 4; ++r)
    for (int s = 1; s < 5; ++s) {
        if (s <= r) continue;
        vec2 er = pentE(r), es = pentE(s);
        float gr = pentG(r, g), gs = pentG(s, g);
        float det = er.x * es.y - er.y * es.x;
        float nr0 = floor(dot(pg, er) + gr), ns0 = floor(dot(pg, es) + gs);
        for (int dr = -1; dr <= 1; ++dr)
        for (int ds = -1; ds <= 1; ++ds) {
            float nr = nr0 + float(dr), ns = ns0 + float(ds);
            vec2 p = vec2((nr - gr) * es.y - (ns - gs) * er.y, (ns - gs) * er.x - (nr - gr) * es.x) / det;
            vec2 b0 = nr * er + ns * es;
            for (int j = 0; j < 5; ++j)
                if (j != r && j != s) b0 += ceil(dot(p, pentE(j)) + pentG(j, g)) * pentE(j);
            vec2 d = x - b0;
            float a = (d.x * es.y - d.y * es.x) / det, b = (er.x * d.y - er.y * d.x) / det;
            if (a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0) {
                ab = vec2(a, b); rr = r; ss = s; base = b0; nrs = vec2(nr, ns);
                return true;
            }
        }
    }
    return false;
}
// Penrose mirror: the rhombus coordinates folded symmetrically -- distances to
// the nearer edge of each pair, sorted.  On a shared edge both tiles give the
// same pair (0, position along the edge, folded), so the map is continuous:
// a quasi-periodic kaleidoscope that never repeats.
vec2 tPenrose(vec2 uv, vec2 c, float cells, vec2 drift, vec4 g)
{
    vec2 ab, base, nrs; int r, s;
    penroseFind((uv - c) * cells + drift, g, ab, r, s, base, nrs);
    vec2 f = min(ab, 1.0 - ab);
    return c + vec2(min(f.x, f.y), max(f.x, f.y)) * 0.9;
}
// ---- round 5 ----
// Jacobi theta functions for m = 1/2 (q = e^-pi), all four, complex argument.
void thetaAll(vec2 v, out vec2 t1, out vec2 t2, out vec2 t3, out vec2 t4)
{
    float n = floor(v.y / 3.14159265 + 0.5);
    v -= n * vec2(3.14159265, 3.14159265);
    v.x = mod(v.x + 3.14159265, 6.2831853) - 3.14159265;
    const float q14 = 0.4559381, q94 = 0.0008505, q1 = 0.0432139, q4 = 3.487e-6;
    t1 = 2.0 * (q14 * csin(v) - q94 * csin(3.0 * v));
    t2 = 2.0 * (q14 * ccos(v) + q94 * ccos(3.0 * v));
    t3 = vec2(1.0, 0.0) + 2.0 * (q1 * ccos(2.0 * v) + q4 * ccos(4.0 * v));
    t4 = vec2(1.0, 0.0) + 2.0 * (-q1 * ccos(2.0 * v) + q4 * ccos(4.0 * v));
}
// sn and dn wallpapers (other poles and zeros than cn), values turned with time.
vec2 tJacobiWall(vec2 uv, vec2 c, float scale, int which, float t)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    vec2 t1, t2, t3, t4;
    thetaAll(z * 0.8472131, t1, t2, t3, t4);
    vec2 f = which == 0 ? cdiv(t1, t4) * 1.1803 : cdiv(t3, t4) * 0.8409;   // sn: th3(0)/th2(0); dn: th4(0)/th3(0)
    return c + cmul(f, cexpi(t * 0.3)) * 0.3;
}
// Hyperbolic Moebius flow: two fixed points on the unit circle, the picture
// streaming from one to the other along circular arcs (flow parameter = time).
vec2 tHypFlow(vec2 uv, vec2 c, float a, float t)
{
    vec2 z = (uv - c) * 2.0;
    vec2 p = cexpi(a), q = -p;
    vec2 w = cdiv(z - p, z - q);                                 // fixed points to 0 and infinity
    float lr = 0.5 * log(max(dot(w, w), 1e-10)) - t, an = atan(w.y, w.x);
    return vec2(lr * 0.5, an / 3.14159265 * 2.0);                 // log-polar of the flow: seamless (angle jumps by 4)
}
// Wandering poles: sum of k / (z - p_k) -- a rational map, flowers around every pole.
vec2 tPoles(vec2 uv, vec2 c, float n, float t)
{
    vec2 z = (uv - c) * 2.0, f = vec2(0.0);
    for (int k = 0; k < 5; ++k) {
        if (float(k) >= n) break;
        float fk = float(k);
        vec2 pk = 0.7 * vec2(sin(t * (0.21 + 0.05 * fk) + fk * 1.9), cos(t * (0.17 + 0.04 * fk) + fk * 2.7));
        f += cdiv(cexpi(fk * 1.3), z - pk) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
    }
    return c + f * 0.35;
}
// Bipolar Droste: the spiral Droste between two holes (log of the cross-ratio).
vec2 tBiDroste(vec2 uv, vec2 c, float f, float K, float zoom)
{
    vec2 w = cdiv(uv - c + vec2(f, 0.0), uv - c - vec2(f, 0.0));
    vec2 L = vec2(0.5 * log(max(dot(w, w), 1e-10)), atan(w.y, w.x));
    float lk = log(K), b = -lk / 3.14159265;
    vec2 W = vec2(L.x - b * L.y, L.y + b * L.x);
    float tri = abs(fract((W.x / lk - zoom) * 0.5) * 2.0 - 1.0);
    return c + exp(tri * lk - lk) * cexpi(W.y) * 0.45;
}
// Hyperbolic spiral r = a / theta: a tunnel whose rings are wound.
vec2 tHypSpiral(vec2 uv, vec2 c, float a, float wind, float travel)
{
    vec2 d = uv - c;
    float an = atan(d.y, d.x) / 3.14159265;
    return vec2(a / max(length(d), 1e-3) + an * wind - travel, an * 2.0);
}
// Riemann zeta, partial sum of n^-s: a few rotating spirals interfering.
vec2 tZeta(vec2 uv, vec2 c, float terms, float t)
{
    vec2 sv = (uv - c) * vec2(2.0, 14.0) + vec2(0.5, t);
    vec2 f = vec2(0.0);
    for (int n = 1; n <= 7; ++n) {
        if (float(n) > terms) break;
        float ln = log(float(n));
        f += exp(-sv.x * ln) * cexpi(-sv.y * ln);
    }
    return c + f * 0.2;
}
// Mandelbrot parameter map: z = 0, z <- z^2 + (the point), a few times.
vec2 tMandel(vec2 uv, vec2 c, float steps, float t)
{
    vec2 k = (uv - c) * 2.2 + vec2(-0.5, 0.0) + 0.1 * cexpi(t * 0.2);
    vec2 z = vec2(0.0);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; z = cmul(z, z) + k; }
    return c + z * 0.55;
}
// Burning ship: |Re| and |Im| before squaring (the mirror makes the ship).
vec2 tShip(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.2, k = vec2(-0.4, -0.55) + 0.12 * cexpi(t * 0.2);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; z = abs(z); z = cmul(z, z) + k; }
    return c + z * 0.55;
}
// Phoenix Julia: z_{n+1} = z^2 + k + p z_{n-1} (a memory term).
vec2 tPhoenix(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.2, zp = vec2(0.0);
    vec2 k = vec2(0.5667, 0.0) + 0.05 * cexpi(t * 0.2), pp = vec2(-0.5, 0.0);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        vec2 zn = cmul(z, z) + k + cmul(pp, zp);
        zp = z; z = zn;
    }
    return c + z * 0.3;
}
// Parabolic coordinates (sigma, tau): nested parabolas, mirror-folded.
vec2 tParabCoords(vec2 uv, vec2 c, float k, float travel)
{
    vec2 d = (uv - c) * k;
    float r = length(d);
    float sg = sqrt(max(r + d.x, 0.0)), ta = sqrt(max(r - d.x, 0.0));
    return vec2(sg - travel, ta);
}
// Cardioid coordinates: sqrt(1 - 4z) with the angle mirrored (the main bulb of
// the Mandelbrot set unrolled).
vec2 tCardioid(vec2 uv, vec2 c, float k, float t)
{
    vec2 z = (uv - c) * k;
    vec2 w = vec2(1.0, 0.0) - 4.0 * z;
    float r = sqrt(length(w)), a = abs(atan(w.y, w.x)) * 0.5;
    return c + r * cexpi(a + t * 0.2) * 0.6;
}
// Sunflower: two log-spiral families crossed (the parastichies of a seed head).
vec2 tSunflower(vec2 uv, vec2 c, float m1, float m2, float zoom)
{
    vec2 d = uv - c;
    float lr = log(max(length(d), 1e-5)) * 1.5 - zoom, an = atan(d.y, d.x) / 3.14159265;
    return vec2(lr + an * m1, lr - an * m2);
}
// Breathing sphere: the Riemann sphere bulged by a spherical harmonic, turning.
vec2 tBreathSphere(vec2 uv, vec2 c, float m, float t)
{
    vec2 z = (uv - c) * 2.2;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.xz = rot2(t * 0.3) * P.xz;
    float ph = atan(P.y, P.x), th = acos(clamp(P.z, -1.0, 1.0));
    float Y = pow(sin(th), m) * cos(m * ph + t);
    P *= 1.0 + 0.35 * Y;
    return c + P.xy / max(1.3 - P.z, 0.05) * 0.5;
}
// Cayley transform: the upper half-plane to the disk (and back out again).
vec2 tCayley(vec2 uv, vec2 c, float k)
{
    vec2 w = (uv - c) * k;
    return c + cdiv(w - vec2(0.0, 1.0), w + vec2(0.0, 1.0)) * 0.45;
}
// Fisheye / barrel: radius raised to a drifting power.
vec2 tFisheye(vec2 uv, vec2 c, float e)
{
    vec2 d = uv - c;
    float r = length(d);
    return c + d * pow(max(r, 1e-4) * 1.6, e - 1.0);
}
// Curved kaleidoscope: a kaleidoscope in hyperbolic-disk coordinates -- its
// mirrors are circular arcs (the fold conjugated by a moving disk automorphism).
vec2 tCurvedKaleido(vec2 uv, vec2 c, float sides, float rot, vec2 a)
{
    vec2 z = (uv - c) * 1.6;
    vec2 w = cdiv(z - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z));
    float sec = 6.2831853 / sides;
    float an = abs(mod(atan(w.y, w.x), sec) - 0.5 * sec) + rot;
    w = length(w) * cexpi(an);
    z = cdiv(w + a, vec2(1.0, 0.0) + cmul(vec2(a.x, -a.y), w));
    return c + z / 1.6;
}
// Levy C-curve fold: turn 45 deg, scale sqrt 2, mirror -- repeated.
vec2 tLevy(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = rot2(0.7853982) * p * 1.4142136; sc *= 1.4142136;
        p.x = abs(p.x) - 0.7;
    }
    return c + p / sc * 1.2;
}
// Pythagoras-tree fold: mirror, turn 45 deg about the branch point, scale sqrt 2.
vec2 tPythagoras(vec2 uv, vec2 c, float iters, float bend)
{
    vec2 p = (uv - c) * 2.5 + vec2(0.0, 0.8);
    float sc = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p.x = abs(p.x);
        p -= vec2(0.0, 1.0);
        p = rot2(0.7853982 + bend) * p * 1.4142136; sc *= 1.4142136;
    }
    return c + p / sc * 0.9;
}
// Vicsek (cross) fold: abs, sort, scale 3 about the arm.
vec2 tVicsek(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p = abs(p);
        if (p.x < p.y) p = p.yx;
        p = p * 3.0 - vec2(2.0, 0.0); sc *= 3.0;
    }
    return c + p / sc * 1.5;
}
// ---- multigrid quasicrystals (de Bruijn): N line families at pi/N ----
vec2 gridE(int j, float N) { float a = 3.14159265 * float(j) / N; return vec2(cos(a), sin(a)); }
float gridG(int j) { return fract(0.1234 + 0.6180339 * float(j)) - 0.5; }
// Finds the rhomb a point lies in (de Bruijn multigrid of N families).
// N = 4: Ammann-Beenker (8-fold), N = 5: Penrose (10-fold), N = 6: 12-fold,
// N = 7: 14-fold.  As penroseFind, for any N (up to 7).
bool multiGridFind(vec2 x, float N, out vec2 ab, out int rr, out int ss, out vec2 base, out vec2 nrs)
{
    vec2 pg = x * 2.0 / N;
    ab = vec2(0.5); rr = 0; ss = 1; base = vec2(0.0); nrs = vec2(0.0);
    for (int r = 0; r < 6; ++r) {
        if (float(r) >= N - 1.0) break;
        for (int s = 1; s < 7; ++s) {
            if (s <= r || float(s) >= N) continue;
            vec2 er = gridE(r, N), es = gridE(s, N);
            float gr = gridG(r), gs = gridG(s);
            float det = er.x * es.y - er.y * es.x;
            float nr0 = floor(dot(pg, er) + gr), ns0 = floor(dot(pg, es) + gs);
            for (int dr = -1; dr <= 1; ++dr)
            for (int ds = -1; ds <= 1; ++ds) {
                float nr = nr0 + float(dr), ns = ns0 + float(ds);
                vec2 p = vec2((nr - gr) * es.y - (ns - gs) * er.y, (ns - gs) * er.x - (nr - gr) * es.x) / det;
                vec2 b0 = nr * er + ns * es;
                for (int j = 0; j < 7; ++j) {
                    if (float(j) >= N) break;
                    if (j != r && j != s) b0 += ceil(dot(p, gridE(j, N)) + gridG(j)) * gridE(j, N);
                }
                vec2 d = x - b0;
                float a = (d.x * es.y - d.y * es.x) / det, b = (er.x * d.y - er.y * d.x) / det;
                if (a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0) {
                    ab = vec2(a, b); rr = r; ss = s; base = b0; nrs = vec2(nr, ns);
                    return true;
                }
            }
        }
    }
    return false;
}
vec2 tQuasiMirror(vec2 uv, vec2 c, float N, float cells, vec2 drift)
{
    vec2 ab, base, nrs; int r, s;
    multiGridFind((uv - c) * cells + drift, N, ab, r, s, base, nrs);
    vec2 f = min(ab, 1.0 - ab);
    return c + vec2(min(f.x, f.y), max(f.x, f.y)) * 0.9;
}
// ---- flows (stage D): smooth displacements ----
// Karman street: vortices of alternating spin shed from an obstacle, drifting
// downstream and fading in and out (no vortex ever appears or vanishes at once).
vec2 tKarman(vec2 uv, float strength, float t)
{
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        float ph = fract(t * 0.08 + fk / 6.0);                   // life 0..1, positions wrap while invisible
        vec2 pk = vec2(-0.1 + 1.2 * ph, 0.5 + (mod(fk, 2.0) < 0.5 ? 0.12 : -0.12));
        float life = sin(3.14159265 * ph);
        vec2 d = uv - pk;
        float g = strength * life * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * exp(-dot(d, d) / 0.02);
        uv = pk + rot2(g) * d;
    }
    return uv;
}
// Flow round a cylinder with circulation (potential flow), as a displacement.
vec2 tCylinderFlow(vec2 uv, vec2 c, float strength, float circ)
{
    vec2 z = (uv - c) * 4.0;
    float r2 = max(dot(z, z), 0.36);
    vec2 zi = cdiv(vec2(1.0, 0.0), cmul(z, z));
    vec2 vel = vec2(1.0, 0.0) - zi + circ * vec2(-z.y, z.x) / r2;   // conj(dw/dz)
    return uv + strength * vec2(vel.x, -vel.y) * 0.03 * smoothstep(0.36, 1.0, dot(z, z));
}
// Dipole field lines as a displacement.
vec2 tDipole(vec2 uv, vec2 c, float strength, float t)
{
    vec2 d = (uv - c) * 3.0;
    vec2 m = cexpi(t * 0.3);
    float r2 = max(dot(d, d), 0.05);
    vec2 B = (3.0 * dot(m, d) * d / r2 - m) / (r2 * sqrt(r2));
    return uv + strength * B / (1.0 + length(B)) * 0.04;
}
// Two vortices orbiting each other.
vec2 tVortexPair(vec2 uv, vec2 c, float strength, float t)
{
    for (int k = 0; k < 2; ++k) {
        vec2 pk = c + 0.18 * cexpi(t * 0.5 + 3.14159265 * float(k));
        vec2 d = uv - pk;
        uv = pk + rot2(strength * exp(-dot(d, d) / 0.04)) * d;
    }
    return uv;
}
// Interference of two wave sources: displaced along the wave field's gradient.
vec2 tInterference(vec2 uv, float k, float strength, float t)
{
    vec2 s1 = vec2(0.3, 0.5) + 0.1 * cexpi(t * 0.2), s2 = vec2(0.7, 0.5) - 0.1 * cexpi(t * 0.23);
    vec2 d1 = uv - s1, d2 = uv - s2;
    float r1 = max(length(d1), 1e-3), r2 = max(length(d2), 1e-3);
    vec2 g = cos(r1 * k - t * 3.0) * d1 / r1 + cos(r2 * k - t * 3.0) * d2 / r2;
    return uv + strength * g * 0.01;
}
// Kelvin-Helmholtz: a shear layer rolling up into a row of billows.
vec2 tKelvinHelmholtz(vec2 uv, float strength, float t)
{
    float y = uv.y - 0.5;
    float roll = exp(-y * y / 0.02);
    vec2 cellc = vec2(floor(uv.x * 4.0 + t * 0.2) + 0.5 - t * 0.2, 2.0) / 4.0;   // billow centres drift
    float a = strength * roll * sin(6.2831853 * (uv.x * 4.0 + t * 0.2));
    return uv + vec2(0.04 * strength * tanh(y * 10.0), 0.0) + 0.03 * vec2(-sin(a), cos(a) - 1.0) * roll;
}
// ---- round 6 ----
// Little planet: the photo as an equirectangular panorama on a turning
// sphere, seen stereographically (longitude jumps by one mirror period: seamless).
vec2 tLittlePlanet(vec2 uv, vec2 c, float zoom, float a1, float a2)
{
    vec2 z = (uv - c) * zoom;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return vec2(atan(P.y, P.x) / 3.14159265, asin(clamp(P.z, -1.0, 1.0)) / 1.5707963 * 0.5 + 0.5);
}
// Rotating Mercator: the screen is the Mercator map of a turning sphere that
// carries the photo stereographically -- loxodromes become straight lines.
vec2 tMercator(vec2 uv, vec2 c, float scale, float a1, float a2)
{
    vec2 m = (uv - c) * scale;
    float lon = m.x * 3.14159265, lat = atan(sinh(m.y * 3.14159265));
    vec3 P = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return c + P.xy / max(1.0 - P.z, 0.05) * 0.9;
}
// Weierstrass p on the square lattice (lemniscatic case): p ~ 1/sn^2.
vec2 tWeierstrass(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    vec2 t1, t2, t3, t4;
    thetaAll(z * 0.8472131, t1, t2, t3, t4);
    vec2 q = cdiv(t4, t1) * 0.8473;                        // 1 / sn
    return c + cmul(cmul(q, q), cexpi(t * 0.3)) * 0.12;
}
// Schwarz-Christoffel: the unit disk onto a regular n-gon,
// sc(z) = z 2F1(1/n, 2/n; 1 + 1/n; z^n); outside the disk folded in.
vec2 tPolygonMap(vec2 uv, vec2 c, float n, float t)
{
    vec2 z = cmul((uv - c) * 2.2, cexpi(t * 0.2));
    float r2 = dot(z, z);
    if (r2 > 1.0) z /= r2;
    vec2 zn = vec2(1.0, 0.0);
    for (int k = 0; k < 6; ++k) { if (float(k) >= n) break; zn = cmul(zn, z); }
    float a = 1.0 / n, b = 2.0 / n, cc = 1.0 + 1.0 / n;
    vec2 term = vec2(1.0, 0.0), sum = vec2(1.0, 0.0);
    for (int k = 0; k < 12; ++k) {
        float fk = float(k);
        term = cmul(term, zn) * ((a + fk) * (b + fk) / ((cc + fk) * (fk + 1.0)));
        sum += term;
    }
    return c + cmul(z, sum) * 1.3;
}
// Jacobi theta_3 with a wandering complex nome: quasi-periodic waves.
vec2 tThetaWave(vec2 uv, vec2 c, float k, float t)
{
    vec2 z = (uv - c) * k;
    vec2 q = 0.55 * cexpi(t * 0.3), q2 = cmul(q, q);
    vec2 f = vec2(1.0, 0.0), qsq = vec2(1.0, 0.0), qp = q;
    for (int n = 1; n <= 4; ++n) {
        qsq = cmul(qsq, qp); qp = cmul(qp, q2);           // q^(n^2)
        f += 2.0 * cmul(qsq, ccos(2.0 * float(n) * z));
    }
    return c + f * 0.55;
}
// Chebyshev polynomial T_n (recurrence): the plane folded like cos(n acos z).
vec2 tChebyshev(vec2 uv, vec2 c, float n, float k)
{
    vec2 z = (uv - c) * k, t0 = vec2(1.0, 0.0), t1 = z;
    for (int i = 1; i < 7; ++i) { if (float(i) >= n) break; vec2 t2 = 2.0 * cmul(z, t1) - t0; t0 = t1; t1 = t2; }
    return c + t1 * 0.3;
}
// Henon map, a few steps (a drifting).
vec2 tHenon(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * 2.5;
    float a = 1.2 + 0.2 * sin(t * 0.2);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; p = vec2(1.0 - a * p.x * p.x + p.y, 0.3 * p.x); }
    return c + p * 0.4;
}
// Ikeda map (the laser in a ring cavity), a few steps.
vec2 tIkeda(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 3.0;
    float u = 0.8 + 0.1 * sin(t * 0.2);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        z = vec2(1.0, 0.0) + u * cmul(z, cexpi(0.4 - 6.0 / (1.0 + dot(z, z))));
    }
    return c + z * 0.3;
}
// Chirikov standard map (kicked rotor): islands and chaos.
vec2 tChirikov(vec2 uv, vec2 c, float K, float steps)
{
    vec2 q = (uv - c) * 6.2831853;
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; q.y += K * sin(q.x); q.x += q.y; }
    return c + q / 6.2831853 * 1.2;
}
// Cassini ovals: log-polar of z^2 - a^2 (lemniscate at the critical size).
vec2 tCassini(vec2 uv, vec2 c, float a, float travel)
{
    vec2 z = (uv - c) * 2.0;
    vec2 w = cmul(z, z) - vec2(a * a, 0.0);
    return vec2(0.25 * log(max(dot(w, w), 1e-10)) - travel, atan(w.y, w.x) / 3.14159265);
}
// Klein's tetrahedral / octahedral invariants: rational maps with the symmetry
// of a Platonic solid on a turning sphere; f(1/z) = f(z), so |z| > 1 is folded
// in (no overflow, continuous); the value is read as a sphere point.
vec2 tKleinInv(vec2 uv, vec2 c, float kind, float a1, float a2)
{
    vec2 z = (uv - c) * 2.0;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz; P.xy = rot2(a2) * P.xy;
    z = P.xy / max(1.0 - P.z, 1e-3);
    if (dot(z, z) > 1.0) z = vec2(z.x, -z.y) / dot(z, z);
    vec2 z2 = cmul(z, z), z4 = cmul(z2, z2), N, D;
    if (kind < 0.5) {
        vec2 i2 = vec2(-z2.y, z2.x) * 3.4641016;
        vec2 phi = z4 - i2 + vec2(1.0, 0.0), psi = z4 + i2 + vec2(1.0, 0.0);
        N = cmul(cmul(phi, phi), phi); D = cmul(cmul(psi, psi), psi);
    } else {
        vec2 a = cmul(z4, z4) + 14.0 * z4 + vec2(1.0, 0.0);
        vec2 b = z4 - vec2(1.0, 0.0), b2 = cmul(b, b);
        N = cmul(cmul(a, a), a); D = 108.0 * cmul(z4, cmul(b2, b2));
    }
    float nn = dot(N, N), dd = dot(D, D);
    vec2 ND = vec2(N.x * D.x + N.y * D.y, N.y * D.x - N.x * D.y);
    vec3 Q = vec3(2.0 * ND, nn - dd) / max(nn + dd, 1e-20);
    return vec2(atan(Q.y, Q.x) / 3.14159265, asin(clamp(Q.z, -1.0, 1.0)) / 1.5707963 * 0.5 + 0.5);
}
// Gumowski-Mira map, a few steps.
float gmF(float x, float mu) { return mu * x + 2.0 * (1.0 - mu) * x * x / (1.0 + x * x); }
vec2 tGumowski(vec2 uv, vec2 c, float mu, float steps)
{
    vec2 p = (uv - c) * 12.0;
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= steps) break;
        float x = p.y + 0.008 * (1.0 - 0.05 * p.y * p.y) * p.y + gmF(p.x, mu);
        p = vec2(x, -p.x + gmF(x, mu));
    }
    return c + p * 0.05;
}
// Zaslavsky web map: a kick and a turn by 2 pi / q -- a q-fold stochastic web.
vec2 tZaslavsky(vec2 uv, vec2 c, float q, float K, float steps)
{
    vec2 p = (uv - c) * 18.0;
    float a = 6.2831853 / q;
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= steps) break;
        float u = p.x + K * sin(p.y);
        p = vec2(u * cos(a) + p.y * sin(a), -u * sin(a) + p.y * cos(a));
    }
    return c + p / 18.0;
}
// Spherical Droste: a twisted Droste between two antipodal points of a
// turning sphere -- the poles travel, even through infinity.
vec2 tSphereDroste(vec2 uv, vec2 c, float K, float zoom, float a1, float a2)
{
    vec2 z = (uv - c) * 2.0;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz; P.xy = rot2(a2) * P.xy;
    vec2 w = P.xy / max(1.0 - P.z, 1e-4);
    vec2 L = vec2(log(max(length(w), 1e-6)), atan(w.y, w.x));
    float lk = log(K), b = -lk / 3.14159265;
    vec2 W = vec2(L.x - b * L.y, L.y + b * L.x);
    float tri = abs(fract((W.x / lk - zoom) * 0.5) * 2.0 - 1.0);
    return c + exp(tri * lk - lk) * cexpi(W.y) * 0.9;
}
// Cubic Julia: z^3 + k, k wandering.
vec2 tJulia3(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.2, k = 0.55 * cexpi(t * 0.13 + 1.0);
    for (int i = 0; i < 3; ++i) { if (float(i) >= steps) break; z = cmul(cmul(z, z), z) + k; }
    return c + z * 0.55;
}
// Magnet map (the Ising-model fractal, type I): z <- ((z^2 + k - 1) / (2z + k - 2))^2.
vec2 tMagnet(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.5, k = vec2(1.2, 0.3) + 0.25 * cexpi(t * 0.17);
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= steps) break;
        z = cdiv(cmul(z, z) + k - vec2(1.0, 0.0), 2.0 * z + k - vec2(2.0, 0.0));
        z = cmul(z, z);
    }
    return c + z * 0.6;
}
// Hyperbolic Droste: Escher's spiral Droste read as a point of the Poincare
// disk and folded into a {p,q} tiling -- self-similar and hyperbolic at once.
vec2 tHypDroste(vec2 uv, vec2 c, float K, float zoom, float p, float q)
{
    vec2 w = (tDrosteSpiral(uv, c, K, zoom) - c) / 0.45 * 0.97;
    return c + poincareFold(w, p, q) * 0.9;
}
// ---- symmetries ----
// The modular group PSL(2,Z) as a mirror group ((2,3,inf) triangles): in the
// half-plane, mirrors x = 0, x = 1/2 and the unit circle, repeated.
vec2 tModular(vec2 uv, vec2 c, float scale, float travel)
{
    vec2 w = (uv - c) * scale;
    w.y = abs(w.y) + 0.03;
    w.x += travel;
    for (int i = 0; i < 12; ++i) {
        w.x = abs(fract(w.x + 0.5) - 0.5);
        float r2 = dot(w, w);
        if (r2 < 1.0) w /= r2;
    }
    return c + vec2(w.x, log(w.y) * 0.6) * 0.9;
}
// Schottky mirror group: inversions in four circles (tangent at r = 0.707).
vec2 tSchottky(vec2 uv, vec2 c, float r, float turn)
{
    // four circles (tangent at r = 0.707) and a fifth, large one that mirrors
    // the outside in: the whole plane becomes the group's lace
    vec2 z = rot2(turn) * (uv - c) * 3.0;
    const float R0 = 1.75;
    for (int i = 0; i < 8; ++i) {
        float zz = dot(z, z);
        if (zz > R0 * R0) z *= R0 * R0 / zz;
        for (int k = 0; k < 4; ++k) {
            vec2 cc = cexpi(1.5707963 * float(k)), d = z - cc;
            float dd = dot(d, d);
            if (dd < r * r) z = cc + d * (r * r / dd);
        }
    }
    return c + z * 0.5;
}
// p3m1: the equilateral-triangle mirror group (three mirrors through every
// three-fold centre): hexagonal cell, angle folded into the 60-degree wedge
// whose rays run through the cell's corners.
vec2 tTriMirror(vec2 uv, vec2 c, float cells, float turn)
{
    vec2 q = rot2(turn) * (uv - c) * cells;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float an = abs(mod(atan(h.y, h.x) - 0.5235988, 2.0943951) - 1.0471976);
    return c + length(h) * cexpi(an) / cells * 2.0;
}
// Pappus chain: inversion about a point turns the arbelos into a strip; the
// strip mirror-repeated and inverted back gives the endless chain of circles.
vec2 tPappus(vec2 uv, vec2 c, float width, float travel)
{
    vec2 p = c + vec2(0.35, 0.0), d = uv - p;
    vec2 w = d / max(dot(d, d), 1e-5);
    w.y = width * (abs(mod(w.y / width - 1.0 + travel, 4.0) - 2.0) - 1.0);
    return p + w / max(dot(w, w), 1e-5) * 0.8;
}
// Origami: up to four mirror lines (folds) turning slowly.
vec2 tOrigami(vec2 uv, vec2 c, float n, float t)
{
    for (int k = 0; k < 4; ++k) {
        if (float(k) >= n) break;
        float fk = float(k);
        vec2 nn = cexpi(t * (0.1 + 0.03 * fk) + fk * 1.7);
        vec2 pk = c + 0.18 * cexpi(fk * 2.3 + t * 0.07);
        float s = dot(uv - pk, nn);
        uv -= nn * (s - abs(s));
    }
    return uv;
}
// Steiner: a kaleidoscope seen through a circle inversion -- its mirrors
// become circles through the inversion point.
vec2 tSteiner(vec2 uv, vec2 c, float n, float rot)
{
    vec2 d = (uv - c) * 2.0 + vec2(0.3, 0.0);
    vec2 w = d / max(dot(d, d), 1e-6) - vec2(1.2, 0.0);
    float sec = 6.2831853 / n;
    float an = abs(mod(atan(w.y, w.x) + rot, sec) - 0.5 * sec);
    w = length(w) * cexpi(an) + vec2(1.2, 0.0);
    return c + (w / max(dot(w, w), 1e-6) - vec2(0.3, 0.0)) * 0.5;
}
// Spiral kaleidoscope: the sectors twist with the log-radius.
vec2 tSpiralKaleido(vec2 uv, vec2 c, float sides, float twist, float rot)
{
    vec2 d = uv - c;
    float r = max(length(d), 1e-5), sec = 6.2831853 / sides;
    float an = abs(mod(atan(d.y, d.x) + twist * log(r) + rot, sec) - 0.5 * sec);
    return c + r * cexpi(an);
}
// ---- second maps ----
// Gravitational lens (point mass): the source seen through an Einstein ring.
vec2 tGravLens(vec2 uv, vec2 c, float rE, vec2 pos)
{
    vec2 d = uv - c - pos;
    return uv - rE * rE * d / max(dot(d, d), 1e-5);
}
// Binary lens: two masses orbiting -- caustic folds.
vec2 tBinaryLens(vec2 uv, vec2 c, float rE, float t)
{
    vec2 d1 = uv - c - 0.12 * cexpi(t), d2 = uv - c + 0.12 * cexpi(t);
    return uv - rE * rE * (d1 / max(dot(d1, d1), 1e-5) + 0.6 * d2 / max(dot(d2, d2), 1e-5));
}
// Lorentz boost (hyperbolic rotation): squeezed along the diagonals.
vec2 tBoost(vec2 uv, vec2 c, float phi)
{
    vec2 d = uv - c;
    float ch = cosh(phi), sh = sinh(phi);
    return c + vec2(d.x * ch + d.y * sh, d.x * sh + d.y * ch);
}
// Log vortex: turned by an angle growing with log r (a spiral sink).
vec2 tLogVortex(vec2 uv, vec2 c, float k)
{
    vec2 d = uv - c;
    return c + rot2(k * log(max(length(d), 1e-4))) * d;
}
// Zone lens: the magnification oscillates with r^2 (a smooth Fresnel lens).
vec2 tZoneLens(vec2 uv, vec2 c, float a, float k)
{
    vec2 d = uv - c;
    return c + d * (1.0 + a * sin(k * dot(d, d)));
}
// ---- flows ----
// Gravitational wave: plus and cross polarisation, travelling out.
vec2 tGravWave(vec2 uv, vec2 c, float h, float t)
{
    vec2 d = uv - c;
    float ph = sin(length(d) * 25.0 - t * 3.0) * exp(-length(d) * 1.5);
    return uv + h * ph * (cos(t * 0.3) * vec2(d.x, -d.y) + sin(t * 0.3) * vec2(d.y, d.x));
}
// Double gyre (the textbook time-periodic flow), advected four steps.
vec2 tDoubleGyre(vec2 uv, float A, float t)
{
    vec2 p = mirrorUV(uv) * vec2(2.0, 1.0);
    float s = 0.25 * sin(0.6 * t);
    for (int i = 0; i < 4; ++i) {
        float f = s * p.x * p.x + (1.0 - 2.0 * s) * p.x, dfx = 2.0 * s * p.x + 1.0 - 2.0 * s;
        p += 0.08 * 3.14159265 * A * vec2(-sin(3.14159265 * f) * cos(3.14159265 * p.y), cos(3.14159265 * f) * sin(3.14159265 * p.y) * dfx);
    }
    return p / vec2(2.0, 1.0);
}
// Taylor-Green vortices, amplitude breathing.
vec2 tTaylorGreen(vec2 uv, float A, float t)
{
    vec2 p = uv * 9.424778;
    float a = A * sin(t * 0.4);
    for (int i = 0; i < 4; ++i) p += 0.16 * a * vec2(sin(p.x) * cos(p.y), -cos(p.x) * sin(p.y));
    return p / 9.424778;
}
// Convection cells: displaced along the gradient of a hexagonal wave field.
vec2 tConvection(vec2 uv, float k, float s, float t)
{
    vec2 g = vec2(0.0);
    for (int j = 0; j < 3; ++j) {
        vec2 e = cexpi(2.0943951 * float(j));
        g -= k * e * sin(k * dot(e, uv) + t * 0.3);
    }
    return uv + s * g * 0.002;
}
// Gerstner waves: three trochoidal waves, horizontal displacement.
vec2 tGerstner(vec2 uv, float A, float t)
{
    for (int j = 0; j < 3; ++j) {
        vec2 dir = cexpi(0.7 + 1.9 * float(j));
        uv += A * dir * cos(dot(dir, uv) * (14.0 + 5.0 * float(j)) - t * (1.5 + 0.4 * float(j))) * 0.022;
    }
    return uv;
}
// ---- round 7 (23.10.2026): forty more transforms for the flat chain labs ----
/**  Stage A: coordinate maps ------------------------------------------------------------------------------------ Tinkerbell map: x' = x^2 - y^2 + a x + b y, y' = 2 x y + c x + d y, the strange attractor's loops.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param steps  The number of steps. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tTinkerbell(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * 2.0;
    float a = 0.9 + 0.08 * sin(t * 0.2), b = -0.6013 + 0.05 * cos(t * 0.17);
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= steps) break;
        p = vec2(p.x * p.x - p.y * p.y + a * p.x + b * p.y, 2.0 * p.x * p.y + 2.0 * p.x + 0.5 * p.y);
        p *= 1.0 / (1.0 + 0.12 * dot(p, p));
    }
    return c + p * 0.5;
}
/**  Lozi map: the piecewise linear Henon, |x| for x^2: straight kinks instead of soft loops.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param steps  The number of steps. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLozi(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * 2.5;
    float a = 1.6 + 0.12 * sin(t * 0.2);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; p = vec2(1.0 - a * abs(p.x) + 0.5 * p.y, p.x); }
    return c + p * 0.4;
}
/**  Hopalong (Martin): x' = y - sgn(x) sqrt|b x - c|, y' = a - x.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param a      The first parameter. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tHopalong(vec2 uv, vec2 c, float a, float t)
{
    vec2 p = (uv - c) * 3.0;
    for (int i = 0; i < 3; ++i) p = vec2(p.y - sign(p.x) * sqrt(abs(1.0 * p.x - (0.4 + 0.2 * sin(t * 0.15)))), a - p.x);
    return c + p * 0.3;
}
/**  Gingerbreadman map: x' = 1 - y + |x|, y' = x.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tGingerbread(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * 4.0;
    for (int i = 0; i < 4; ++i) p = vec2(1.0 - p.y + k * abs(p.x), p.x);
    return c + p * (0.16 + 0.02 * sin(t * 0.2));
}
/**  Bogdanov map: the normal form of the Bogdanov-Takens bifurcation, spirals about a fixed point.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tBogdanov(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * 2.5;
    float mu = 0.1 + 0.05 * sin(t * 0.2);
    for (int i = 0; i < 3; ++i) { p.y += 0.0 * p.y + k * p.x * (p.x - 1.0) + mu * p.x * p.y; p.x += p.y; }
    return c + p * 0.45;
}
/**  Lemniscate coordinates: bipolar coordinates of z^2 with the poles +-a^2: figures of eight, the poles in the ears.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param a      The first parameter. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLemniscate(vec2 uv, vec2 c, float a, float t)
{
    vec2 z = (uv - c) * 3.0;
    vec2 w = cmul(z, z);
    float a2 = a * a;
    vec2 q = cdiv(w - vec2(a2, 0.0), w + vec2(a2, 0.0));
    return vec2(0.5 * log(max(dot(q, q), 1e-6)) * 0.9 + 0.05 * t, atan(q.y, q.x) / 3.14159265 * 2.0);
}
/**  Schwarz-Christoffel: the disc onto a regular hexagon, w = z * integral_0^1 (1 - (s z)^6)^(-1/3) ds; outside the circle of radius 0.9 the plane is inverted into it (continuous on the circle).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tScHexagon(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = rot2(0.1 * sin(t * 0.2)) * (uv - c) * scale;
    float r = length(z);
    if (r > 0.9) z *= 0.81 / (r * r);
    vec2 w = vec2(0.0);
    for (int i = 0; i < 8; ++i) {
        float s = (float(i) + 0.5) / 8.0;
        vec2 q = z * s, q2 = cmul(q, q), q3 = cmul(q2, q), q6 = cmul(q3, q3);
        vec2 d = vec2(1.0, 0.0) - q6;
        float m = max(length(d), 1e-3), ph = atan(d.y, d.x);
        w += pow(m, -0.3333333) * vec2(cos(ph / 3.0), -sin(ph / 3.0));
    }
    return c + cmul(z, w / 8.0) * 0.55;
}
/**  Rose fold: the polar mirror at r = R(theta) of a k-petal rose, petals folded into each other.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tRoseFold(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * 3.0;
    float r = length(p), sec = 6.2831853 / k;
    float an = abs(mod(atan(p.y, p.x) + 0.1 * t, sec) - 0.5 * sec);
    float R = 0.35 + 0.65 * abs(cos(0.5 * k * an));
    float rr = R * abs(mod(r / R + 1.0, 2.0) - 1.0);
    return c + rr * vec2(cos(an), sin(an)) * 0.4;
}
/**  Epitrochoid unrolling: the point moves as the pen of a gear rolling in a ring: rho (e^{i th} - d e^{i (m+1) th}).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param m      A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tEpitrochoid(vec2 uv, vec2 c, float m, float t)
{
    vec2 d = uv - c;
    float rho = length(d), th = atan(d.y, d.x) + 0.1 * t;
    float dd = 0.75 + 0.15 * sin(t * 0.2);
    return c + rho * (cexpi(th) - dd / (m + 1.0) * cexpi((m + 1.0) * th)) * 1.1;
}
/**  Modular lambda function: lambda = (theta_2 / theta_3)^4 of the nome q = exp(i pi tau), three cusps 0, 1, infinity.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLambda(vec2 uv, vec2 c, float scale, float t)
{
    vec2 tau = (uv - c) * scale + vec2(0.5 * sin(t * 0.1), 0.0);
    tau.y = abs(tau.y) + 0.2;
    vec2 q = exp(-3.14159265 * tau.y) * cexpi(3.14159265 * tau.x);
    vec2 q2 = cmul(q, q), q4 = cmul(q2, q2), q9 = cmul(q4, cmul(q4, q));
    vec2 th3 = vec2(1.0, 0.0) + 2.0 * (q + q4 + q9);
    vec2 qq = exp(-0.7853982 * tau.y) * cexpi(0.7853982 * tau.x);
    vec2 th2 = 2.0 * cmul(qq, vec2(1.0, 0.0) + q2 + cmul(q4, q2));
    vec2 r = cdiv(th2, th3);
    vec2 l = cmul(cmul(r, r), cmul(r, r));
    return c + l * 0.5 / (1.0 + 0.3 * length(l));
}
/**  Ford circles: the point is inverted in the circle that holds it (p/q, radius 1/(2 q^2)), mirror-periodic along the axis.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param rank   A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFord(vec2 uv, vec2 c, float rank, float t)
{
    vec2 z = vec2(abs(fract((uv.x - c.x + 0.5) * 0.5) * 2.0 - 1.0), abs(fract((uv.y - c.y + 0.5) * 0.5) * 2.0 - 1.0) * 0.8);
    z.x += 0.05 * sin(t * 0.2);
    for (int round = 0; round < 2; ++round) {
        for (int i = 0; i < 9; ++i) {
            float q = i < 2 ? 1.0 : (i < 3 ? 2.0 : (i < 5 ? 3.0 : (i < 7 ? 4.0 : 5.0)));
            float p0 = i == 0 ? 0.0 : (i == 1 ? 1.0 : (i == 2 ? 0.5 : (i == 3 ? 0.3333 : (i == 4 ? 0.6667 : (i == 5 ? 0.25 : (i == 6 ? 0.75 : (i == 7 ? 0.2 : 0.4)))))));
            if (float(i) >= 3.0 + 2.0 * rank) break;
            float R = 0.5 / (q * q);
            vec2 ctr = vec2(p0, R), d = z - ctr;
            float dd = dot(d, d);
            if (dd < R * R) z = ctr + d * (R * R / max(dd, 1e-5));
        }
    }
    return vec2(z.x, z.y / 0.8);
}
/**  Square root with its branch cut: |sqrt(z)| in both coordinates, so the two sheets agree on the cut.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tSqrtSheet(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = rot2(0.2 * t) * (uv - c) * scale;
    float r = length(z), th = atan(z.y, z.x);
    vec2 w = sqrt(r) * vec2(cos(0.5 * th), sin(0.5 * th));
    return c + abs(w) * 0.7;
}
/**  Gamma function's poles: the principal parts of Gamma at 0, -1, -2 ... (residues (-1)^k / k!), funnels in the plane.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param shift  A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tGammaPoles(vec2 uv, vec2 c, float shift, float t)
{
    vec2 z = (uv - c) * 4.0 + vec2(-1.5 + shift + 0.4 * sin(t * 0.1), 0.0);
    vec2 f = vec2(0.0);
    float res = 1.0;
    for (int k = 0; k < 6; ++k) {
        vec2 d = z + vec2(float(k), 0.0);
        f += res * vec2(d.x, -d.y) / max(dot(d, d), 1e-3);
        res *= -1.0 / float(k + 1);
    }
    return c + f * 0.35 / (1.0 + 0.3 * length(f));
}
/**  Spherical harmonic fault: the photo moves by Y * grad Y of a real harmonic of the sphere (nodal lines cut it into fields).
 *
 * @param p      The point. (in)
 * @param m      A parameter of the transform. (in)
 *
 * @return
 *   The value.
 **/
float shY(vec3 p, int m)
{
    if (m == 0) return 3.0 * p.z * p.z - 1.0;
    if (m == 1) return 3.0 * p.x * p.z;
    if (m == 2) return p.x * p.x - p.y * p.y;
    if (m == 3) return p.z * (5.0 * p.z * p.z - 3.0);
    if (m == 4) return p.x * (5.0 * p.z * p.z - 1.0);
    return p.x * p.x * p.x - 3.0 * p.x * p.y * p.y;
}
/**  A transform of the flat chain labs.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param which  Which variant. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tHarmonicFault(vec2 uv, vec2 c, float which, float t)
{
    int m = int(min(which, 5.0));
    vec2 z = (uv - c) * 2.0;
    float e = 0.01;
    vec3 P0 = vec3(2.0 * z, dot(z, z) - 1.0) / (dot(z, z) + 1.0);
    vec2 zx = z + vec2(e, 0.0), zy = z + vec2(0.0, e);
    vec3 Px = vec3(2.0 * zx, dot(zx, zx) - 1.0) / (dot(zx, zx) + 1.0), Py = vec3(2.0 * zy, dot(zy, zy) - 1.0) / (dot(zy, zy) + 1.0);
    float y0 = shY(P0, m);
    vec2 g = vec2(shY(Px, m) - y0, shY(Py, m) - y0) / e;
    return uv + 0.12 * y0 * g * cos(t * 0.4) * 0.2;
}
/**  Stage B: folds and mirrors ---------------------------------------------------------------------------------- Heighway dragon fold: the dragon curve's turn by 45 degrees and scale sqrt 2, the fold turned right or left in turn.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param turn   A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tDragonFold(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0, sg = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = rot2(0.7853982 * sg) * p * 1.4142136; sc *= 1.4142136;
        p.x = abs(p.x) - 0.7;
        sg = -sg;
    }
    return c + p / sc * 1.2;
}
/**  Gosper fold: seven-fold flowsnake, scale sqrt 7 and the angle 19.1 degrees, the fold across the axis.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param turn   A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tGosperFold(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p.y = abs(p.y);
        p = rot2(0.333473) * p * 2.6457513; sc *= 2.6457513;
        p.x -= 1.6;
    }
    return c + p / sc * 1.3;
}
/**  Fibonacci-word mirror: mirror lines at the points of the Fibonacci quasi-lattice (gaps 1.618 and 1 in the order of the word); the picture is the distance to the nearest mirror, so it never repeats.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param ang    A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFibonacciMirror(vec2 uv, vec2 c, float scale, float ang)
{
    vec2 p = rot2(ang) * (uv - c) * scale;
    float x = p.x + 40.0;
    float k0 = floor(x / 1.382);
    float best = 9.0;
    for (int j = -1; j <= 2; ++j) {
        float k = max(k0 + float(j), 0.0);
        float y = k + 0.618034 * floor((k + 1.0) / 1.618034);
        best = min(best, abs(x - y));
    }
    return c + vec2(best * 0.9, p.y * 0.6);
}
/**  Thue-Morse mirror: the slope of a zigzag flips where the Thue-Morse sequence says, never periodic, never random.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param w      A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tThueMorseMirror(vec2 uv, vec2 c, float w, float t)
{
    vec2 p = (uv - c) * w + vec2(0.3 * sin(t * 0.1), 0.0);
    float k = floor(p.x);
    float kk = mod(k, 4096.0);
    int n = int(kk), bits = 0;
    for (int i = 0; i < 12; ++i) bits += (n >> i) & 1;
    float sg = (bits & 1) == 0 ? 1.0 : -1.0;
    float kodd = mod(kk, 2.0);
    int pb = 0, n1 = max(n - 1, 0);
    for (int i = 0; i < 12; ++i) pb += (n1 >> i) & 1;
    float S = kodd > 0.5 ? ((pb & 1) == 0 ? 1.0 : -1.0) : 0.0;
    float x = S + sg * (p.x - k);
    return c + vec2(x * 0.45, p.y * 0.45);
}
/**  Cantor mirror: the distance to the Cantor set along both axes (a devil's carpet of folds).
 *
 * @param x      The value. (in)
 *
 * @return
 *   The value.
 **/
float cantorDist(float x)
{
    x = abs(fract(x * 0.5 + 0.5) * 2.0 - 1.0);
    float sc = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (x < 0.3333333) { x *= 3.0; sc /= 3.0; }
        else if (x > 0.6666667) { x = (x - 0.6666667) * 3.0; sc /= 3.0; }
        else return min(x - 0.3333333, 0.6666667 - x) * sc;
    }
    return 0.0;
}
/**  A transform of the flat chain labs.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCantorMirror(vec2 uv, vec2 c, float scale, float t)
{
    vec2 p = (uv - c) * scale + 0.5;
    return c + vec2(cantorDist(p.x + 0.05 * sin(t * 0.2)), cantorDist(p.y)) * 3.0;
}
/**  Tent-map fold: the triangle wave doubled again and again, binary mirrors at every scale.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tTentFold(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * 1.4 + 0.5 + 0.03 * vec2(sin(t * 0.2), cos(t * 0.17));
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0);
        p = 1.0 - abs(1.0 - 2.0 * p);
        p = vec2(p.x + 0.35 * p.y, p.y + 0.2 * p.x);
    }
    return c + p * 1.2 - 0.3;
}
/**  Cat-map fold: the hyperbolic automorphism [[2,1],[1,1]] of the torus, each round folded by a mirror repeat.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCatFold(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * 1.2 + 0.5;
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= iters) break;
        p = vec2(2.0 * p.x + p.y, p.x + p.y) + 0.05 * sin(t * 0.2);
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0);
    }
    return c + p - 0.5;
}
/**  Kaleidoscopic fold with a turn: abs, a shift, a turn that grows, a scale of 1.6: lace of a triangle's fold.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tKifsTriangle(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= iters) break;
        p = abs(p);
        p -= vec2(0.5, 0.3);
        p = rot2(0.5 + 0.15 * sin(t * 0.25) + 0.12 * float(i)) * p;
        p *= 1.6; sc *= 1.6;
    }
    return c + p / sc * 1.4;
}
/**  Whitney cusp fold: (x, y) -> (x, y^3 + a x y): the plane folds along a cusp and the photo lies over itself.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param a      The first parameter. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tWhitneyCusp(vec2 uv, vec2 c, float a, float t)
{
    vec2 p = (uv - c) * 2.2;
    float aa = a * (1.0 + 0.3 * sin(t * 0.3));
    return c + vec2(p.x, p.y * p.y * p.y * 0.5 + aa * p.x * p.y) * 0.5;
}
/**  Polar tent fold: the tent map in radius and angle at once, petals within petals.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tPolarTent(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = uv - c;
    float r = length(p) * 2.0, a = atan(p.y, p.x) / 3.14159265 * 0.5 + 0.5 + 0.02 * t;
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= iters) break;
        r = 1.0 - abs(1.0 - 2.0 * abs(fract(r * 0.5 + 0.5) * 2.0 - 1.0));
        a = 1.0 - abs(1.0 - 2.0 * abs(fract(a * 0.5 + 0.5) * 2.0 - 1.0));
    }
    float th = a * 6.2831853;
    return c + r * vec2(cos(th), sin(th)) * 0.5;
}
/**  Stage C: lenses --------------------------------------------------------------------------------------------- Cylinder lens: stretched or squeezed in one direction only, the photo drawn into bands.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param ang    A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCylinderLens(vec2 uv, vec2 c, float k, float ang)
{
    vec2 d = rot2(ang) * (uv - c);
    d.x *= 0.35 + k;
    return c + rot2(-ang) * d;
}
/**  Axicon: a cone lens bends every ray by the same angle toward the axis: a ring caustic of radius k.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tAxicon(vec2 uv, vec2 c, float k, float t)
{
    vec2 d = uv - c;
    float r = sqrt(dot(d, d) + 0.002);
    return uv - d / r * k * (0.8 + 0.2 * sin(t * 0.3));
}
/**  Fresnel step lens: concentric zones, each a slice of a lens: the picture slips back at every step (soft ramps).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param zones  The number of zones. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFresnelStep(vec2 uv, vec2 c, float zones, float t)
{
    vec2 d = uv - c;
    float f = fract(length(d) * zones - 0.05 * t);
    float saw = smoothstep(0.0, 0.85, f) * (1.0 - smoothstep(0.85, 1.0, f));
    return c + d * (1.0 - 0.3 * (saw - 0.5));
}
/**  Compound eye: a grid of lenslets, each showing the photo a little turned and flipped (displacement dies at the cell edge).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param cells  The number of cells. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCompoundEye(vec2 uv, vec2 c, float cells, float t)
{
    vec2 q = (uv - c) * cells;
    vec2 f = fract(q + 0.5) - 0.5;
    vec2 e = abs(f) * 2.0;
    float edge = 1.0 - max(e.x, e.y) * max(e.x, e.y);
    float sg = (mod(floor(q.x + 0.5) + floor(q.y + 0.5), 2.0) < 0.5) ? 1.0 : -1.0;
    return uv - 1.6 * sg * f / cells * edge - 0.4 * rot2(0.3 * sin(t * 0.2)) * f / cells * edge;
}
/**  Luneburg lens: a ball of refractive index sqrt(2 - r^2) focuses parallel rays on the far rim.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param R      The radius. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLuneburg(vec2 uv, vec2 c, float R, float t)
{
    vec2 d = (uv - c) / R;
    float r2 = dot(d, d);
    vec2 dir = vec2(cos(0.2 * t), sin(0.2 * t));
    float s = (1.0 - sqrt(max(1.0 - r2, 0.0))) * smoothstep(1.05, 0.85, sqrt(r2));
    return uv + dir * s * R * 1.2;
}
/**  Maxwell fish eye: every point is imaged on another, the photo turned inside out in a disc (blended into the rim).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param R      The radius. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tMaxwell(vec2 uv, vec2 c, float R, float t)
{
    vec2 d = (uv - c) / R;
    float r2 = dot(d, d);
    vec2 inv = -d / max(r2, 0.06) * 0.5 + d * 0.5;
    float w = smoothstep(1.0, 0.8, sqrt(r2));
    return c + mix(d, inv, w) * R;
}
/**  Veselago lens: negative refraction in a slab: inside it the image inverts and focuses twice.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param thick  The thickness. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tVeselago(vec2 uv, vec2 c, float thick, float t)
{
    float y0 = c.y + 0.1 * sin(t * 0.2);
    float s = uv.y - y0;
    float a = abs(s);
    float inside = 1.0 - smoothstep(thick * 0.9, thick, a);
    float s2 = s * (2.0 * a / thick - 1.0);
    return vec2(uv.x, y0 + mix(s, s2, inside));
}
/**  Inferior mirage: the sky mirrored into the ground along a hot horizon, with a shimmer in the seam.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param amp    The amplitude. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tMirage(vec2 uv, vec2 c, float amp, float t)
{
    float h = c.y;
    float d = uv.y - h;
    float shimmer = exp(-d * d / 0.004) * amp * 0.02 * sin(60.0 * uv.x + 3.0 * t + 20.0 * d);
    return vec2(uv.x + shimmer + 0.01 * amp * sin(25.0 * d + t) * exp(-d * d / 0.02), h + abs(d));
}
/**  Stage D: flows and waves ------------------------------------------------------------------------------------ Langmuir cells: counter-rotating roll pairs along the wind, drift lines gather in the convergence zones.
 *
 * @param uv     The point to transform. (in)
 * @param cells  The number of cells. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLangmuir(vec2 uv, float cells, float strength, float t)
{
    float k = 6.2831853 * cells;
    float ph = k * uv.x + 0.3 * t;
    return uv + strength * 0.03 * vec2(sin(ph), 0.0) + strength * 0.05 * vec2(0.0, cos(ph) * sin(0.7 * uv.y * k * 0.3 + t * 0.2));
}
/**  Ekman spiral: the current turns with depth and thins: layers of the photo, each at another angle.
 *
 * @param uv     The point to transform. (in)
 * @param rate   The rate. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tEkman(vec2 uv, float rate, float strength, float t)
{
    float depth = uv.y * 3.0;
    float a = rate * depth + 0.2 * t;
    return uv + strength * 0.05 * exp(-0.5 * depth) * vec2(cos(a), sin(a)) * 3.0;
}
/**  Capillary ring waves: short ripples round many sources, crossing into lattices.
 *
 * @param uv     The point to transform. (in)
 * @param n      The count. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCapillary(vec2 uv, float n, float strength, float t)
{
    vec2 d = vec2(0.0);
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= n) break;
        vec2 s = vec2(hash11(float(i) * 3.1 + 1.0), hash11(float(i) * 5.7 + 2.0));
        vec2 e = uv - s;
        float r = length(e);
        d += e / max(r, 1e-3) * sin(70.0 * r - 3.0 * t + float(i)) / (1.0 + 8.0 * r);
    }
    return uv + strength * 0.04 * d;
}
/**  KdV soliton train: sech^2 humps of different height that pass through each other; the photo rides them.
 *
 * @param uv     The point to transform. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tSolitons(vec2 uv, float strength, float t)
{
    float h = 0.0;
    for (int i = 0; i < 4; ++i) {
        float sp = 0.6 + 0.5 * float(i);
        float x0 = fract(0.05 * t * sp + 0.27 * float(i)) * 2.0 - 0.5;
        float u = (uv.x - x0) * (3.0 + 2.0 * sp);
        float sh = 1.0 / cosh(u);
        h += sp * sh * sh;
    }
    return uv + vec2(0.0, strength * 0.16 * h);
}
/**  Airy wave packet: displacement along a curve that accelerates like a parabola, with side lobes behind it.
 *
 * @param x      The value. (in)
 *
 * @return
 *   The value.
 **/
float airyApprox(float x)
{
    if (x > 1.0) return exp(-0.6667 * x * sqrt(x)) / (3.5449 * sqrt(sqrt(x)));
    if (x < -1.0) { float a = -x; return sin(0.6667 * a * sqrt(a) + 0.7853982) / (1.7725 * sqrt(sqrt(a))); }
    return 0.3550 - 0.2588 * x + 0.0592 * x * x * x;
}
/**  A transform of the flat chain labs.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tAiryPacket(vec2 uv, vec2 c, float strength, float t)
{
    float x = (uv.x - c.x) * 6.0 - 0.4 * t;
    float a = airyApprox(x * 0.8);
    return uv + vec2(0.0, strength * 0.25 * a) + vec2(0.06 * strength * a * a, 0.0);
}
/**  Kida vortex: an elliptical patch of constant vorticity, turning as a whole, its rim wavy.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param ell    A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tKida(vec2 uv, vec2 c, float ell, float t)
{
    vec2 d = rot2(0.1 * t) * (uv - c);
    float ph = atan(d.y, d.x);
    float rho = length(vec2(d.x / ell, d.y * ell)) * 3.0 * (1.0 + 0.12 * sin(3.0 * ph + 0.6 * t));
    float th = 1.8 * (rho < 1.0 ? 1.0 : 1.0 / (rho * rho));
    return c + rot2(-0.1 * t) * (rot2(th * sin(0.4 * t + 1.0)) * d);
}
/**  Lamb-Oseen vortex row: soft vortices of alternating sense in a row (Gamma / 2 pi r^2 (1 - exp(-r^2 / rc^2))).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param gap    A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLambOseenRow(vec2 uv, vec2 c, float gap, float t)
{
    float row = c.y;
    for (int i = -2; i <= 2; ++i) {
        float xi = c.x + (float(i) + fract(0.05 * t)) * gap;
        vec2 d = uv - vec2(xi, row);
        float r2 = dot(d, d);
        float sg = mod(float(i) + floor(0.05 * t), 2.0) < 0.5 ? 1.0 : -1.0;
        uv = vec2(xi, row) + rot2(sg * 1.6 * (1.0 - exp(-r2 / 0.01)) / (1.0 + 40.0 * r2) * (0.5 + 0.5 * sin(t * 0.3 + float(i)))) * d;
    }
    return uv;
}
/**  Faraday standing waves: a vibrating surface's square or hexagonal standing wave pattern.
 *
 * @param uv     The point to transform. (in)
 * @param hex    A parameter of the transform. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFaraday(vec2 uv, float hex, float strength, float t)
{
    vec2 g = vec2(0.0);
    float amp = cos(t * 0.8);
    int n = hex < 0.5 ? 2 : 3;
    for (int j = 0; j < 3; ++j) {
        if (j >= n) break;
        vec2 e = hex < 0.5 ? (j == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : cexpi(1.0471976 * float(j));
        g -= e * sin(25.0 * dot(e, uv));
    }
    return uv + strength * 0.02 * amp * g;
}
// ---- idea round 4 ----
// Farris frieze: a power series in w = exp(i z) -- periodic along the band,
// fading across it; the band folded (mirrored) so friezes stack endlessly.
vec2 tFrieze(vec2 uv, vec2 c, float period, float t)
{
    vec2 z = (uv - c) * vec2(6.2831853 / period, 3.0);
    z.y = abs(fract(z.y / 3.0 * 0.5 + 0.25) * 2.0 - 1.0) * 1.5;          // mirrored band, 0..1.5
    vec2 w = exp(-z.y) * cexpi(z.x);
    vec2 w2 = cmul(w, w), w3 = cmul(w2, w);
    vec2 f = cmul(cexpi(t * 0.5), w) + cmul(cexpi(-t * 0.7 + 1.0), w2) * 0.7 + cmul(cexpi(t * 0.3 + 2.0), w3) * 0.5;
    return c + f * 0.4;
}
// Jacobi sn/cn wallpaper: cn itself (m = 1/2) as a doubly periodic picture,
// its value turned with time (the colours travel round every cell).
vec2 tEllipticWall(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    vec2 N, D;
    cnTheta(z * 0.8472131, N, D);
    vec2 zeta = cdiv(N, D);
    return c + cmul(zeta, cexpi(t * 0.3)) * 0.3;
}
// The hyperbolic plane in the upper half-plane: z = (w - i)/(w + i) to the
// disk; the lower half is the mirror image; a horizontal shift is an exact
// hyperbolic (parabolic) motion -- the tiling crawls along the horizon line.
vec2 tHalfPlane(vec2 uv, vec2 c, float p, float q, float scale, float travel)
{
    vec2 w = (uv - c) * scale;
    w.y = abs(w.y) + 0.04;
    w.x += travel;
    vec2 z = cdiv(w - vec2(0.0, 1.0), w + vec2(0.0, 1.0));
    return c + poincareFold(z, p, q) * 0.9;
}
// Archimedean spiral coordinates: r against the angle -- arms of equal
// spacing; one turn shifts both outputs by exactly one mirror period.
vec2 tArchimedes(vec2 uv, vec2 c, float k, float travel)
{
    vec2 d = uv - c;
    float r = length(d) * k, a = atan(d.y, d.x) / 3.14159265;
    return vec2(r - a - travel, r + a);
}
// Koch fold: the snowflake's mirrors and a scale of 3, repeated.
vec2 tKoch(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    const vec2 n = vec2(-0.5, 0.8660254);
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p.x = abs(p.x);
        p.x -= 0.5;
        p -= 2.0 * min(0.0, dot(p, n)) * n;
        p *= 3.0; sc *= 3.0;
        p.x -= 1.5;
    }
    return c + p / sc * 1.4;
}
// Bend: the picture turned by an angle that grows across it (a bounded bend).
vec2 tBend(vec2 uv, float k)
{
    return 0.5 + rot2(k * (uv.x - 0.5)) * (uv - 0.5);
}
// ---- idea round 3 ----
// Blaschke product: z * prod (z - a)/(1 - conj(a) z) -- the unit disk wrapped
// onto itself several times around zeros that wander; conformal, continuous
// (its poles lie outside the disk and only fold far picture in).
vec2 tBlaschke(vec2 uv, vec2 c, float n, float t)
{
    vec2 z = (uv - c) * 2.2, B = z;
    for (int k = 0; k < 4; ++k) {
        if (float(k) >= n) break;
        float fk = float(k);
        vec2 a = 0.55 * vec2(cos(t * (0.3 + 0.07 * fk) + fk * 2.1), sin(t * (0.23 + 0.05 * fk) + fk * 1.3));
        B = cmul(B, cdiv(z - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z)));
    }
    return c + B * 0.9;                                         // spot check: 0.45 read too small a patch
}
// Parabolic stream: in inverted coordinates a plain translation -- circles all
// touching at one point, the picture streaming through them (a parabolic Moebius flow).
vec2 tParabolic(vec2 uv, vec2 c, float scale, float travel)
{
    vec2 z = (uv - c) * scale;
    vec2 w = vec2(z.x, -z.y) / max(dot(z, z), 1e-5);
    return w * 0.3 + vec2(travel, 0.0);
}
// Elliptic coordinates around two foci: confocal ellipses and hyperbolas.
// nu uses acos without the sign of y (mirror-symmetric, hence continuous).
vec2 tElliptic(vec2 uv, vec2 c, float f, float travel)
{
    vec2 d = uv - c;
    float r1 = length(d + vec2(f, 0.0)), r2 = length(d - vec2(f, 0.0));
    float mu = log(max((r1 + r2) / (2.0 * f), 1.0) + sqrt(max(pow((r1 + r2) / (2.0 * f), 2.0) - 1.0, 0.0)));
    float nu = acos(clamp((r1 - r2) / (2.0 * f), -1.0, 1.0));
    return vec2(mu * 0.6 - travel, nu / 3.14159265 * 2.0);
}
// tan z: the plane in stripes, each a whole sphere of picture between two poles.
vec2 tTanLattice(vec2 uv, vec2 c, float k)
{
    vec2 z = (uv - c) * k;
    float den = cos(2.0 * z.x) + cosh(2.0 * z.y);
    return c + vec2(sin(2.0 * z.x), sinh(2.0 * z.y)) / max(den, 1e-4) * 0.25;
}
// Newton's method for z^3 = w, a few steps: the picture folded along the
// fractal borders of the three basins (a rational map: continuous off its poles).
vec2 tNewton(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.4, w = cexpi(t * 0.3);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        vec2 z2 = cmul(z, z);
        z -= cdiv(cmul(z2, z) - w, 3.0 * z2);
    }
    return c + z * 0.4;
}
// Newton's method for z^n = w (n = 3..5): n basins, fractal borders.
vec2 tNewtonN(vec2 uv, vec2 c, float steps, float n, float t)
{
    vec2 z = (uv - c) * 2.4, w = cexpi(t * 0.3);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        vec2 zn1 = vec2(1.0, 0.0);
        for (int k = 0; k < 4; ++k) { if (float(k) >= n - 1.0) break; zn1 = cmul(zn1, z); }
        z -= cdiv(cmul(zn1, z) - w, n * zn1);
    }
    return c + z * 0.4;
}
// Julia map: z -> z^2 + k a few times, k wandering near the Mandelbrot border.
vec2 tJulia(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.4;
    vec2 k = 0.7885 * cexpi(t * 0.15 + 0.4);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        z = cmul(z, z) + k;
    }
    return c + z * 0.35;
}
// The polyhedral fold (Knighty) on the Riemann sphere: the plane lifted onto the
// turning sphere, folded by the tetrahedral/octahedral/icosahedral mirrors,
// projected back -- a spherical kaleidoscope with 12..120 copies.
vec3 polyFold(vec3 p, float n)
{
    float cospin = cos(3.14159265 / n), scospin = sqrt(max(0.75 - cospin * cospin, 1e-4));
    vec3 nc = vec3(-0.5, -cospin, scospin);
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= n) break;
        p.xy = abs(p.xy);
        p -= 2.0 * min(0.0, dot(p, nc)) * nc;
    }
    return p;
}
vec2 tSphereKaleido(vec2 uv, vec2 c, float n, float a1, float a2)
{
    vec2 z = (uv - c) * 2.5;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz;
    P.xz = rot2(a2) * P.xz;
    P = polyFold(P, n);
    return c + P.xy / max(1.0 - P.z, 1e-3) * 1.2;
}
// Quasicrystal (de Bruijn): n plane waves in n directions -- a pattern with
// n-fold symmetry that never repeats; phases drift, the pattern breathes.
vec2 tQuasi(vec2 uv, vec2 c, float n, float k, float t)
{
    vec2 x = (uv - c) * k, f = vec2(0.0);
    for (int j = 0; j < 7; ++j) {
        if (float(j) >= n) break;
        float a = 3.14159265 * float(j) / n;
        f += cexpi(dot(x, vec2(cos(a), sin(a))) * 6.2831853 + t * (0.5 + 0.13 * float(j)));
    }
    return c + f / n * 0.6;
}
// Sierpinski fold: the three mirrors of a triangle, then scale 2 -- a
// continuous iterated function system (every step a reflection or a scale).
vec2 tSierpinski(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 q = (uv - c) * 2.0;
    vec2 n1 = vec2(-0.8660254, 0.5), n2 = vec2(0.8660254, 0.5);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        q.x = abs(q.x);
        q -= 2.0 * min(0.0, dot(q, n1)) * n1;
        q -= 2.0 * min(0.0, dot(q, n2)) * n2;
        q = rot2(turn) * q;
        q = q * 2.0 - vec2(0.0, 1.0);
    }
    return c + q * 0.12;
}
// Mirrored power: z^alpha with the angle mirrored first (|arg z|), so any
// alpha -- also a drifting one -- stays continuous.
vec2 tPowerMirror(vec2 uv, vec2 c, float alpha)
{
    vec2 d = (uv - c) * 2.0;
    float r = length(d), a = abs(atan(d.y, d.x));
    return c + pow(r, alpha) * vec2(cos(alpha * a), sin(alpha * a)) * 0.45;
}
// Vortex street: four point vortices of alternating spin drifting past; each
// turns the picture near it by a bounded angle (a smooth, divergence-free flow).
vec2 tVortexStreet(vec2 uv, float strength, float t)
{
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec2 pk = vec2(0.5 + 0.45 * sin(t * 0.21 + fk * 1.57), 0.5 + (mod(fk, 2.0) - 0.5) * 0.35 + 0.1 * sin(t * 0.3 + fk));
        vec2 d = uv - pk;
        float g = strength * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * exp(-dot(d, d) / 0.03);
        uv = pk + rot2(g) * d;
    }
    return uv;
}
// Curl flow: displaced along the curl of a noise field -- divergence-free, so
// the picture swirls like a fluid without bunching up.
vec2 tCurl(vec2 uv, float strength, float t)
{
    const float e = 0.01;
    vec2 q = uv * 3.0 + vec2(0.3 * t, -0.2 * t);
    float a = fbm3(q + vec2(0.0, e)), b = fbm3(q - vec2(0.0, e));
    float c1 = fbm3(q + vec2(e, 0.0)), d1 = fbm3(q - vec2(e, 0.0));
    return uv + strength * vec2(a - b, -(c1 - d1)) / (2.0 * e) * 0.02;
}
// Bipolar coordinates around two foci at c -/+ (f, 0): sigma (the angle the
// foci subtend) across, tau (log ratio of the distances) along -- the picture
// streams out of one focus into the other.  sigma/pi jumps by 2 on the segment
// between the foci, so `bands` must be whole.
vec2 tBipolar(vec2 uv, vec2 c, float f, float bands, float travel)
{
    vec2 z = uv - c;
    vec2 a = z + vec2(f, 0.0), b = z - vec2(f, 0.0);
    float sigma = atan(a.y * b.x - a.x * b.y, a.x * b.x + a.y * b.y);
    float tau = 0.5 * log(max(dot(a, a), 1e-8) / max(dot(b, b), 1e-8));
    return vec2(sigma / 3.14159265 * bands, tau * 0.35 - travel);
}
// The rotating Riemann sphere: the plane lifted onto the sphere (inverse
// stereographic projection), the sphere turned about two axes, and projected
// back -- the picture streams out of one pole and into the other.  (An
// elliptic Moebius map, continuous except at the pole's image.)
vec2 tRiemann(vec2 uv, vec2 c, float scale, float a1, float a2)
{
    vec2 z = (uv - c) * scale;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return c + P.xy / max(1.0 - P.z, 1e-3) / scale;
}
// Loxodromic stream: the Moebius map sending the two poles to 0 and infinity,
// then log-polar -- the picture screws out of one pole and into the other
// along spirals.  (log|w| + i arg w, mirror-repeated: arg jumps by 2 pi on the
// segment between the poles, i.e. by a whole number of periods when the angle
// is scaled by 1/pi and `twist` stays whole.)
vec2 tLoxo(vec2 uv, vec2 pa, vec2 pb, float twist, float flow)
{
    vec2 z1 = uv - pa, z2 = uv - pb;
    vec2 w = vec2(z1.x * z2.x + z1.y * z2.y, z1.y * z2.x - z1.x * z2.y) / max(dot(z2, z2), 1e-6);
    float lr = 0.5 * log(max(dot(w, w), 1e-10)), an = atan(w.y, w.x) / 3.14159265;
    return vec2(lr * 0.3 + an * twist - flow, an * 2.0 + lr * 0.15);
}
// Blossom: the radius swells and shrinks with the angle, n whole petals.
vec2 tPetal(vec2 uv, vec2 c, float n, float amp, float turn)
{
    vec2 d = uv - c;
    float a = atan(d.y, d.x);
    return c + d * (1.0 + amp * sin(n * a + turn));
}
// Joukowski map w = z + R^2 / z (the airfoil map): circles become wings.
vec2 tJoukowski(vec2 uv, vec2 c, float R, float scale)
{
    vec2 z = (uv - c) * scale;
    vec2 iz = vec2(z.x, -z.y) / max(dot(z, z), 1e-5);
    return c + (z + R * R * iz) * 0.5;
}

vec2 chain(vec2 p);
// A loop count the compiler cannot see through (it depends on a uniform), so
// the loop is NOT unrolled and its body -- a whole chain -- is inlined once.
int loopN(int n) { return n + int(min(interpolation, 0.0)); }
vec2 gChainM, gChainDx, gChainDy;    // mirrored chain coordinate of this pixel and its derivatives per pixel
// The chain's photo read with a seam-proof footprint (per axis the smaller of
// the two one-sided differences) and the screen-space luma gradient.
vec3 imgChain(vec2 p, float bias, out vec2 grad)
{
    vec2 c0 = chain(p);
    vec2 m0 = mirrorUV(c0);
    // Footprint from the screen derivatives of the MIRRORED coordinate: it is
    // continuous over every seam of the chain, so one evaluation suffices
    // (it used to be five, each an inlined copy of the whole chain).
    vec2 dx = dFdx(m0), dy = dFdy(m0);
    gChainM = m0; gChainDx = dx; gChainDy = dy;
    float lod = clamp(log2(max(max(length(dx), length(dy)) * 1024.0, 1.0)) + bias, 0.0, 9.0);
    vec3 col = imgLod(c0, lod);
    float l = luma(col);
    grad = vec2(dFdx(l), dFdy(l)) * 1.5;                         // luma change per 1.5 px, as before
    return col;
}
"""

CHAIN3D_LIB = r"""
// ---- composable continuous 3D space transforms (for raymarched fields) ----
// Each stage is continuous; stages that scale space multiply gDR so the
// distance estimate stays conservative.  gP keeps the final folded point
// (used to texture the surface with the kaleidoscoped photo).
float gDR = 1.0;
vec3 gP = vec3(0.0);
vec3 fRot(vec3 p, vec3 axis, float a)
{
    axis = normalize(axis);
    float c = cos(a), s = sin(a);
    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}
vec3 fAbs(vec3 p) { return abs(p); }
// Reflect onto the positive side of the plane n.p = d.
vec3 fPlane(vec3 p, vec3 n, float d) { float s = dot(p, n) - d; return p - 2.0 * n * min(s, 0.0); }
// Octahedral mirror symmetry (48-fold): abs plus sorting (swaps are continuous).
vec3 fOcta(vec3 p)
{
    p = abs(p);
    if (p.x < p.y) p.xy = p.yx;
    if (p.x < p.z) p.xz = p.zx;
    if (p.y < p.z) p.yz = p.zy;
    return p;
}
// Tetrahedral mirror symmetry.
vec3 fTetra(vec3 p)
{
    if (p.x + p.y < 0.0) p.xy = -p.yx;
    if (p.x + p.z < 0.0) p.xz = -p.zx;
    if (p.y + p.z < 0.0) p.zy = -p.yz;
    return p;
}
// Mandelbox folds.
vec3 fBox(vec3 p, float l) { return clamp(p, -l, l) * 2.0 - p; }
vec3 fSphere(vec3 p, float rMin, float rFix)
{
    float r2 = dot(p, p);
    float k = r2 < rMin * rMin ? (rFix * rFix) / (rMin * rMin) : (r2 < rFix * rFix ? (rFix * rFix) / r2 : 1.0);
    gDR *= k;
    return p * k;
}
vec3 fScale(vec3 p, float s, vec3 offset) { gDR *= abs(s); return p * s - offset; }
// Mirrored repetition (triangle wave: continuous), period 4c per axis.
vec3 fRepeat(vec3 p, vec3 c) { return c * (abs(mod(p / c - 1.0, 4.0) - 2.0) - 1.0); }
// Mirrored polar repetition around the z axis (n wedges, n whole).
vec3 fPolarZ(vec3 p, float n)
{
    float sec = 6.2831853 / n;
    float a = abs(mod(atan(p.y, p.x), sec) - 0.5 * sec);
    return vec3(length(p.xy) * vec2(cos(a), sin(a)), p.z);
}
// Knighty's polyhedral fold: symmetric under the polyhedral group of type n
// (3 tetrahedral, 4 octahedral, 5 icosahedral) -- abs of x and y and one
// oblique mirror, repeated n times; every fold is a reflection (continuous).
vec3 fPoly(vec3 p, float n)
{
    float cospin = cos(3.14159265 / n), scospin = sqrt(max(0.75 - cospin * cospin, 1e-4));
    vec3 nc = vec3(-0.5, -cospin, scospin);
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= n) break;
        p.xy = abs(p.xy);
        p -= 2.0 * min(0.0, dot(p, nc)) * nc;
    }
    return p;
}
// A lattice folded in FOUR dimensions and sliced by our space: the point is
// lifted to 4D (w from time), turned in the xw and yw planes, mirror-repeated
// in 4D and dropped back to 3D.  Every step is a rotation, a reflection or a
// projection (distances never grow), and as the 4D turn runs the lattice
// morphs continuously through shapes no 3D motion makes.
vec3 f4DLattice(vec3 p, float c, float a1, float a2, float w)
{
    vec4 q = vec4(p, w);
    q.xw = rot2(a1) * q.xw;
    q.yw = rot2(a2) * q.yw;
    q = c * (abs(mod(q / c - 1.0, 4.0) - 2.0) - 1.0);
    return q.xyz;                                            // a projection: distances never grow
}
// Log-spherical Droste in 3D: around a centre the radius is folded in log
// scale (mirrored triangle wave), so the world repeats inward and outward in
// shells at every scale; gDR carries the local scale.
vec3 fLogSphere(vec3 p, vec3 c, float K, float zoom)
{
    vec3 d = p - c;
    float r = max(length(d), 1e-4), lk = log(K);
    float u = log(r) / lk - zoom;
    float tri = abs(fract(u * 0.5) * 2.0 - 1.0);
    float rn = exp(tri * lk) * 0.6;
    gDR *= rn / r;
    return d / r * rn;
}
// Hyperbolic honeycomb in the Poincare ball: the octahedral mirrors plus the
// sphere orthogonal to the unit ball (centre k(1,1,1), R^2 = |c|^2 - 1),
// repeated -- cells shrinking without end toward the ball's rim.
vec3 fHyperBall(vec3 p, float k)
{
    vec3 c = vec3(k);
    float R2 = dot(c, c) - 1.0;
    for (int i = 0; i < 7; ++i) {
        p = abs(p);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        vec3 d = p - c;
        float dd = dot(d, d);
        if (dd < R2) { float f = R2 / dd; p = c + d * f; gDR *= f; }
    }
    return p;
}
// The world wrapped round a great ring (radius R, in the xz plane): the
// distance to the ring, the height and the arc length become the new axes.
// The arc repeat divides 2 pi R into whole periods (no seam where the angle
// wraps); gDR corrects the stretch inside the ring.
vec3 fTorusWrap(vec3 p, float R, float cell)
{
    // The flight axis folded (mirror repeat, period 8R) into the reach of one ring: the camera starts anywhere on
    // z 0..500, and far from a single ring round the origin the wrapped world was stretched into streaks.
    p.z = 2.0 * R * (abs(mod(p.z / (2.0 * R) - 1.0, 4.0) - 2.0) - 1.0);
    float rho = length(p.xz);
    float arc = atan(p.z, p.x) * R;
    float per = 6.2831853 * R / max(floor(6.2831853 * R / (4.0 * cell) + 0.5), 1.0) / 4.0;   // whole periods round the ring
    gDR *= max(R / max(rho, 0.5), 1.0);
    vec3 q = vec3(rho - R, p.y, arc);
    return per * (abs(mod(q / per - 1.0, 4.0) - 2.0) - 1.0) * vec3(1.0, 1.0, 1.0);
}
// Gyroid-warped space: every point shifted along a gyroid-like field (smooth;
// the shift's slope is bounded, gDR takes it).
vec3 fGyroidWarp(vec3 p, float s, float t)
{
    gDR *= 1.0 + 1.3 * s;
    return p + s * sin(p.yzx * 1.3 + vec3(t, 1.7 * t, 2.3 + t));
}
float sdOcta3(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }
// ---- round 5 (3D) ----
// Upper half-space model of hyperbolic space (height = |y|): the lattice
// shrinks without end toward the floor plane, its scale falling as 1/h.
vec3 fHalfSpace(vec3 p, float c)
{
    float h = abs(p.y + 4.0) + 0.35;                          // the floor plane lies well below the flight (near it the metric explodes)
    gDR *= 1.0 / h;
    return vec3(p.x / h, log(h) * 1.6, p.z / h);
}
// Log-cylindrical Droste: the distance to the flight axis folded in log scale.
vec3 fLogCyl(vec3 p, float K)
{
    float rho = max(length(p.xy), 1e-3), lk = log(K);
    float tri = abs(fract(log(rho) / lk * 0.5) * 2.0 - 1.0);
    float rn = exp(tri * lk) * 0.8;
    gDR *= max(rn / rho, 1e-3);
    return vec3(p.xy / rho * rn, p.z * rn / rho);
}
float sdSuperquad(vec3 p, float r, float e)
{
    vec3 a = pow(abs(p) / r, vec3(e));
    return (pow(a.x + a.y + a.z, 1.0 / e) - 1.0) * r * 0.7;
}
float sdNeovius(vec3 p, float th) { vec3 c = cos(p); return (abs(3.0 * (c.x + c.y + c.z) + 4.0 * c.x * c.y * c.z) - th) / 9.0; }
float sdLidinoid(vec3 p, float th)
{
    vec3 s2 = sin(2.0 * p), c = cos(p), s = sin(p), c2 = cos(2.0 * p);
    float f = 0.5 * (s2.x * c.y * s.z + s2.y * c.z * s.x + s2.z * c.x * s.y) - 0.5 * (c2.x * c2.y + c2.y * c2.z + c2.z * c2.x) + 0.15;
    return (abs(f) - th) / 3.0;
}
// ---- round 6 (3D) ----
vec3 fRollZ(vec3 p, float R, float cell)
{
    float rho = length(p.xy), arc = atan(p.y, p.x) * R;
    float per = 6.2831853 * R / max(floor(6.2831853 * R / (4.0 * cell) + 0.5), 1.0) / 4.0;
    gDR *= max(R / max(rho, 0.5), 1.0);
    vec3 q = vec3(rho - R, arc, p.z);
    return per * (abs(mod(q / per - 1.0, 4.0) - 2.0) - 1.0);
}
float sdTetra3(vec3 p, float s) { return (max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) - s) * 0.57735027; }
float sdIcosa3(vec3 p, float s)
{
    p = abs(p);
    const float g = 1.618034, ig = 0.618034;
    float d = dot(p, vec3(1.0));
    d = max(d, dot(p, vec3(0.0, ig, g)));
    d = max(d, dot(p, vec3(ig, g, 0.0)));
    d = max(d, dot(p, vec3(g, 0.0, ig)));
    return (d * 0.57735027 - s);
}
// Twist around z (keep k small: it stretches space).
vec3 fTwistZ(vec3 p, float k) { vec2 q = rot2(k * p.z) * p.xy; return vec3(q, p.z); }
// Sphere inversion (radius R): the outside comes inside, endlessly nested.
vec3 fInvert(vec3 p, float R) { float r2 = max(dot(p, p), 1e-4); gDR *= R * R / r2; return p * R * R / r2; }
// Smooth 3D noise warp (small strength).
vec3 fWarp(vec3 p, float s, float t)
{
    // One octave at a low frequency: three fbm3 calls per evaluation, and the
    // steep slope they forced on the ray march (gDR * 2.25), halved the frame
    // rate (46 fps).  The value noise's slope is at most 1.5 * 0.8 per axis.
    gDR *= 1.0 + 1.3 * s;
    return p + s * (vec3(noise2(p.yz * 0.8 + t), noise2(p.zx * 0.8 + 3.1 - t), noise2(p.xy * 0.8 + 5.7 + t)) - 0.5) * 1.6;
}
// End bodies.
float sdSphere3(vec3 p, float r) { return length(p) - r; }
float sdBox3(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus3(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
float sdGyroid3(vec3 p, float thick) { return (abs(dot(sin(p), cos(p.yzx))) - thick) / 1.8; }

float field3(vec3 p);
vec3 gCam = vec3(0.0);
// Collision-free flight: the camera follows a winding path through the field, and a
// tube around that path is carved out of every body (soft edges, so the cut faces
// read as sculpted walls).  The path depends only on z, so the carve is stateless.
float gPathAmp = 1.0;   // how far the path winds (a scene may shrink it)
float gTube = 0.45;     // tube radius
float gSide = 0.0;      // how far the gaze looks out of a side window (0 ahead .. 1): see gazeDir
float gWorldK = 1.0;     // the world's scale: the field's structures 1/gWorldK as large around the same camera
float gThin = 0.0;       // how far the matter is thinned on the flight path (fading out over 1.4 units)
vec2 camPathXY(float z)
{
    return gPathAmp * vec2(1.1 * sin(z * 0.11) + 0.4 * sin(z * 0.23 + 1.3), 0.8 * sin(z * 0.083 + 0.7) + 0.3 * cos(z * 0.19));
}
float smaxK(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float fieldD(vec3 p)
{
    gDR = 1.0;
    // The field at gWorldK times the position: its structures 1/gWorldK as large while the camera's tube, near
    // carve and flight keep their size -- the camera keeps its distance to more, smaller structures.
    float d = field3(p * gWorldK) / gWorldK;
    float r = length(p.xy - camPathXY(p.z));
    // Thinning: toward the flight path the matter is eroded (its surface moved inward by up to gThin), so bodies
    // near the camera become slender and open the view into the depth instead of being cut into broad, alike faces
    // by the tube (17.10.2026).  Slope at most 1.5 * gThin / 1.4: with gThin 0.25 the distance stays conservative
    // enough under the march's 0.8.  It ends within 1.4: the worlds round the flight axis (helix, polar ring, roll)
    // keep their rings.  Looking out of a side window it fades along the flight like the tube.
    float thin = gThin * (1.0 - smoothstep(0.0, 1.4, r));
    if (gSide > 0.0) thin *= 1.0 - gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z));
    d += thin;
    float tube = max(gTube - r, -1.0);
    // Looking out of a side window the tube is carved only around the camera
    // (it fades out 3..6 along the flight): carved along the whole path it
    // showed from the side as a dark channel winding off.  The fade is gentle
    // (slope below 0.5, tube clamped at -1), so the distance stays conservative.
    if (gSide > 0.0) tube = mix(tube, -1.0, gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z)));
    return max(smaxK(d, 0.8 * tube, 0.15), 0.3 - length(p - gCam));
}
// The camera frame at depth z: on the path, looking at the path ahead.
mat3 camFrame(float z, out vec3 ro)
{
    ro = vec3(camPathXY(z), z);
    vec3 ta = vec3(camPathXY(z + 2.0), z + 2.0);
    vec3 fw = normalize(ta - ro);
    // Bank into the curves: the roll follows the path's sideways curvature at
    // this depth -- a function of position only, like a road, never of loudness.
    vec2 curv = camPathXY(z + 1.5) - 2.0 * camPathXY(z) + camPathXY(z - 1.5);
    float roll = clamp(-curv.x * 1.6, -0.3, 0.3);
    vec3 up = vec3(sin(roll), cos(roll), 0.0);
    vec3 rt = normalize(cross(up, fw));
    return mat3(rt, cross(fw, rt), fw);
}
// The gaze: where the camera looks relative to its flight.  Straight ahead
// shows the vanishing point -- a dark opening the eye keeps flying into -- so
// that is only one of seven; the others look diagonally, the vanishing point
// just outside the picture, so the depth of the flight stays in view:
//   0 ahead, 1 ahead-right (the world slides past with parallax),
//   2 slanted down ahead, 3 ahead-left, 4 slanted up, 5 floating (the
//   flight nearly stops, the gaze sways slowly from side to side),
//   6 ahead-right and up.
// The side windows looked across the flight (77 degrees), the slants 45
// degrees down or up, and gaze 6 was orthographic (a cross-section sliding
// past): each filled the picture with one wall of the world (17.10.2026).
// In the app the camera host (camHost) picks the gazes and integrates the
// flight (camZ, slower in some gazes -- EffectShader::stepChainCam keeps the
// speed table); elsewhere (editor renders) the knob picks the first gaze and
// the scene pans on to the next every ~4 minutes.  Time only, never the music:
// the camera does not follow the audio.
uniform float camHost;   // 1: the app drives the camera (camZ, camGaze)
uniform float camZ;      // the flight position along the path
uniform vec3 camGaze;    // (gaze shown, gaze panned to, pan 0..1)
// (yaw, pitch, carve the tube only near the camera)
vec3 gazeAngles(float k, float time)
{
    float i = mod(k, 7.0);
    // Never along a lattice axis: rays grazing whole rows of bodies take the most march steps.
    if (i > 5.5) return vec3(0.6, 0.32, 1.0);
    if (i > 4.5) return vec3(1.0 * sin(0.017 * time), 0.25 + 0.15 * sin(0.019 * time), 1.0);
    if (i > 3.5) return vec3(-0.3, 0.5, 0.0);
    if (i > 2.5) return vec3(-0.8, 0.06, 1.0);
    if (i > 1.5) return vec3(0.3, -0.5, 0.0);
    if (i > 0.5) return vec3(0.8, -0.06, 1.0);
    return vec3(0.0);
}
vec3 gazeTurn(vec3 v, vec2 a) { v.yz = rot2(a.y) * v.yz; v.xz = rot2(-a.x) * v.xz; return v; }
// The camera's flight position (the app's integrated one, or gT).
float camFlight(float gt) { return camHost > 0.5 ? camZ : gt; }
// The ray direction of pixel p.
vec3 gazeDir(vec2 p, float cam, float time, mat3 cf)
{
    float k0, k1, f;
    if (camHost > 0.5) {
        k0 = camGaze.x; k1 = camGaze.y; f = smoothstep(0.0, 1.0, camGaze.z);
    } else {
        float g = floor(clamp(cam, 0.0, 0.999) * 7.0) + 0.004 * time;
        k0 = floor(g); k1 = k0 + 1.0; f = smoothstep(0.75, 1.0, fract(g));
    }
    vec3 a0 = gazeAngles(k0, time), a1 = gazeAngles(k1, time);
    a1.x += 6.2831853 * floor((a0.x - a1.x) / 6.2831853 + 0.5);   // pan the shorter way round
    vec3 a = mix(a0, a1, f);
    a.xy += vec2(0.12 * sin(0.031 * time), 0.08 * sin(0.023 * time + 1.0));
    gSide = a.z;
    return cf * gazeTurn(normalize(vec3(p, 1.1)), a.xy);
}
vec3 normal3(vec3 p)
{
    const vec2 e = vec2(0.0015, -0.0015);
    return normalize(e.xyy * fieldD(p + e.xyy) + e.yyx * fieldD(p + e.yyx) + e.yxy * fieldD(p + e.yxy) + e.xxx * fieldD(p + e.xxx));
}
// The kaleidoscoped photo projected triplanarly onto the surface.
vec3 photo3(vec3 q, vec3 n, float lod)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return imgK(q.yz * 0.35 + 0.5, lod) * w.x + imgK(q.zx * 0.35 + 0.5, lod) * w.y + imgK(q.xy * 0.35 + 0.5, lod) * w.z;
}
"""


def _stmt_end(src, i):
    """End (exclusive) of the GLSL statement starting at i: a {block}, or up to ';' at depth 0."""
    while src[i] in " \t\r\n":
        i += 1
    depth, j = 0, i
    if src[i] == "{":
        while True:
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
                if depth == 0:
                    return j + 1
            j += 1
    while True:
        c = src[j]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == ";" and depth == 0:
            return j + 1
        j += 1

def _skip(fn, k):
    """Past whitespace and comments."""
    while k < len(fn):
        if fn[k] in " \t\r\n":
            k += 1
        elif fn.startswith("//", k):
            e = fn.find("\n", k)
            k = len(fn) if e < 0 else e + 1
        elif fn.startswith("/*", k):
            e = fn.find("*/", k)
            k = len(fn) if e < 0 else e + 2
        else:
            break
    return k

def _select(fn, var, macro):
    """The if / else-if chains on `var` in function text `fn` as a preprocessor
    selection on `macro` (#if macro == N ... #elif ... #else default #endif):
    a variant with the macro set keeps ONE branch in its source, so the driver
    neither parses nor optimises the others."""
    pat = re.compile(r"(?:else\s+)?if\s*\(\s*%s\s*==\s*(\d+)\s*\)" % var)
    out, pos = [], 0
    while True:
        m = pat.search(fn, pos)
        if not m:
            out.append(fn[pos:])
            return "".join(out)
        out.append(fn[pos:m.start()])
        branches, cur = [], m.start()
        while True:
            m2 = pat.match(fn, cur)
            if not m2:
                break
            e = _stmt_end(fn, m2.end())
            branches.append((int(m2.group(1)), fn[m2.end():e].strip()))
            cur = e
            k = _skip(fn, cur)
            if pat.match(fn, k):
                cur = k
                continue
            break
        default = None
        k = _skip(fn, cur)
        if fn.startswith("else", k) and not pat.match(fn, k):
            e = _stmt_end(fn, k + 4)
            default, cur = fn[k + 4:e].strip(), e
        elif fn.startswith("return", k):
            e = _stmt_end(fn, k)
            rest = fn[e:].strip()
            if rest == "}":                              # the stage dispatch's trailing default
                default, cur = fn[k:e].strip(), e
        sel = []
        for n, (idx, st) in enumerate(branches):
            sel.append("#%s %s == %d\n    %s\n" % ("if" if n == 0 else "elif", macro, idx, st))
        if default is not None:
            sel.append("#else\n    %s\n" % default)
        sel.append("#endif\n")
        out.append("\n" + "".join(sel))
        pos = cur

def spec_variants(body):
    """Chain labs: the dispatch functions twice more, with the classes of the
    specialised variant selected by the preprocessor (see patch_spec2.py and
    the app's EffectShader::stepChainWalk); the generic functions are dropped
    from a variant, so its source holds only the classes on screen."""
    if "int orda(" not in body:                            # not a chain lab
        return body
    def func_span(src, header):
        i = src.index(header)
        j = src.index("\n{", i) + 2
        depth = 1
        while depth:
            c = src[j]
            depth += (c == "{") - (c == "}")
            j += 1
        return i, j
    for st in "ABCD":
        header = "vec2 stage%sk(vec2 uv, int k, float v)" % st
        if header not in body:
            continue
        i, j = func_span(body, header)
        fn = body[i:j]
        copies = ""
        for w in "01":
            c = fn.replace(header, "vec2 stage%sk_%s(vec2 uv, float v)" % (st, w), 1)
            # the branch number directly: the ord if-chain is not folded by the driver
            c, nk = re.subn(r"\n\{\n    k = ord[a-d]\(k\);\n", "\n{\n", c, count=1)
            assert nk == 1, st
            c = _select(c, "k", "SPEC_%s%s" % (st, w))
            copies += "\n" + c.rstrip()[:-1].rstrip() + "\n    return uv;\n}\n"
        body = body[:i] + "#ifndef SPEC_%s0\n%s\n#else%s\n#endif" % (st, fn, copies) + body[j:]
        a = ("    vec2 r = stage%sk(uv, ka, va);\n    if (f > 0.0) r = morphMix(r, stage%sk(uv, kb, vb), f);\n" % (st, st))
        if st == "D" and body.count(a) == 0:
            # the warp breathes with the swell (breathD around the branch, its number a constant here)
            a = "    vec2 r = stageDs(uv, ka, va);\n    if (f > 0.0) r = morphMix(r, stageDs(uv, kb, vb), f);\n"
            assert body.count(a) == 1, st
            body = body.replace(a, "#ifdef SPEC_D0\n    vec2 r = breathD(uv, stageDk_0(uv, va), SPEC_D0);\n"
                                   "    if (f > 0.0) r = morphMix(r, breathD(uv, stageDk_1(uv, vb), SPEC_D1), f);\n#else\n%s#endif\n" % a)
            continue
        assert body.count(a) == 1, st
        body = body.replace(a, "#ifdef SPEC_%s0\n    vec2 r = stage%sk_0(uv, va);\n    if (f > 0.0) r = morphMix(r, stage%sk_1(uv, vb), f);\n#else\n%s#endif\n" % (st, st, st, a))
    header = "float fieldK(vec3 p, float xs, float xc, float xb, int world)"
    if header in body:
        i, j = func_span(body, header)
        fn = body[i:j]
        ov = "    ks = ordsp(world == 0 ? SPEC_SP0 : SPEC_SP1); kc = ordco(world == 0 ? SPEC_CO0 : SPEC_CO1); kb = ordbo(world == 0 ? SPEC_BO0 : SPEC_BO1);"
        assert ov in fn
        copies = ""
        for w in "01":
            c = fn.replace(header, "float fieldK_%s(vec3 p, float xs, float xc, float xb, int world)" % w, 1)
            c = c.replace(ov, "    ks = SPEC_SP%s; kc = SPEC_CO%s; kb = SPEC_BO%s;" % (w, w, w))
            c = re.sub(r"#ifdef SPEC_SP0\n(    ks = SPEC_SP.*?\n)#endif\n", r"\1", c)
            for var, mac in (("ks", "SPEC_SP"), ("kc", "SPEC_CO"), ("kb", "SPEC_BO")):
                c = _select(c, var, mac + w)
            copies += "\n" + c
        body = body[:i] + "#ifndef SPEC_SP0\n%s\n#else%s\n#endif" % (fn, copies) + body[j:]
        for w, a in (("0", "    float d0 = fieldK(p, xs, xc, xb, 0);\n"), ("1", "    float d1 = fieldK(p, ys, yc, yb, 1);\n")):
            assert body.count(a) == 1, a
            body = body.replace(a, "#ifdef SPEC_SP0\n%s#else\n%s#endif\n" % (a.replace("fieldK(", "fieldK_%s(" % w), a))
    return body

sys.path.insert(0, os.path.join(ROOT, "Tools"))
import doc_shaders as _doc   # Doxygen comments on what gen.py writes (Tools/doc_shaders.py)
import cgvr_glsl_names as _cgvr   # names and layout of the CGVR guidelines (Tools/cgvr_glsl_names.py)


def assemble(name):
    """Returns (folder, text) of Scene2D|FX/<name>.frag as generated, Doxygen comments included, before
    Tools/cgvr_format.py lays it out; make_chainpass.py reads the chain labs in this form."""
    src = io.open(os.path.join(SP, "src", name + ".glsl"), encoding="utf-8").read()
    doc = src.split("//@doc", 1)[1].split("//@", 1)[0].rstrip()
    params = re.search(r"^//@params(.*)$", src, re.M).group(1).split()
    audio = re.search(r"^//@audio(.*)$", src, re.M).group(1).split()
    exprs = re.findall(r"^//@expr\s+(\w+)\s*=\s*(.+)$", src, re.M)
    body = src.split("//@body", 1)[1].lstrip("\n")
    out = ["#version 330 core", "out vec4 fragColor;", "/**", " * @file %s.frag" % name]
    out += [l for l in doc.split("\n") if l.strip()]
    out += [" */", "", "uniform vec2  resolution;", "uniform float time;", "uniform sampler2D tex0;",
            "uniform sampler2D tex1;", "uniform float interpolation;", "", "uniform float sceneTime;",
            "uniform float sceneAdvance;"]
    if re.search(r"\blabWalk\s*\(", src):
        audio += [a for a in ("audioSectionId", "audioSectionPrev", "audioSectionAge") if a not in audio]
    if re.search(r"\brhySec\w*\s*\(", src):
        audio += [a for a in ("audioSectionId", "audioSectionPrev", "audioSectionAge") if a not in audio]
    if re.search(r"\brhy(Beat|Bar|Phrase|Bump|Sec\w*)\s*\(", src):
        audio += [a for a in ("audioBeatPhase", "audioBarPhase", "audioPhrasePos", "audioSectionId", "audioSectionPrev", "audioSectionAge") if a not in audio]
    for a in BASE_AUDIO + [a for a in audio if a not in BASE_AUDIO]:
        m = re.match(r"(\w+)\[(\d+)\]", a)
        if a in VEC3_AUDIO:
            out.append("uniform vec3 %s;" % a)                 # the engine sets these per band (glUniform3f)
        else:
            out.append("uniform float %s[%s];" % m.groups() if m else "uniform float %s;" % a)
    out.append("")
    for q in params + ["hueP"]:
        out.append("uniform float %s;" % q)
    for n, f in exprs:
        out.append("// @expr %s = %s" % (n, f.strip()))
    if re.search(r"\bimgB\s*\(", src):
        out += ["uniform sampler2D texPhotoB0;", "uniform sampler2D texPhotoB1;", "uniform float photoBMix;"]
    st = re.search(r"^//@state\s+(\d+)\s+(\d+)\s+([0-9.]+)(\s+32)?\s*$", src, re.M)
    if st:
        out.append("// @state %s %s %s%s" % (st.group(1), st.group(2), st.group(3), " 32" if st.group(4) else ""))
        out += ["uniform sampler2D texState;", "uniform int statePass;", "uniform float stateFrame;",
                "uniform vec2 stateRes;", "uniform float stateFrac;"]
    out.append(LIB)
    if re.search(r"\bimgB\s*\(", src):
        out.append(PHOTOB_LIB)
    if re.search(r"\bfamHue\s*\(", src):
        out.append(FAMILY_LIB)
    if re.search(r"\blabWalk\s*\(", src):
        out.append(LAB_LIB)
    if re.search(r"\bfracTrap\s*\(", src):
        out.append(FRAC_LIB)
    late = []                                              # libraries that call a function the scene defines: after its helpers
    if re.search(r"\blicSmear\s*\(", src):
        late.append(LIC_LIB)
    if re.search(r"\bexpAccum\s*\(", src):
        late.append(EXPO_LIB)
    if re.search(r"\brhy(Beat|Bar|Phrase|Sec\w*)\s*\(", src):
        out.append(RHY_LIB)
    if st:
        out.append(STATE_LIB)
    if re.search(r"vec2\s+chain\s*\(", body):
        out.append(CHAIN_LIB)
        import chain_classes as _ccp
        out.append("const bool chainPhotoOnly = %s;   // only the photos' own textures: no line looks, no colour field "
                   "(chain_classes.PHOTO_ONLY)" % ("true" if _ccp.PHOTO_ONLY else "false"))
    if re.search(r"float\s+field3\s*\(", body):
        out.append(CHAIN3D_LIB)
    # Chain labs: the class names of every stage, for the app's shader-info
    # overlay (key v; EffectShader::chainInfo reads these comment lines).
    if "int orda(" in body:
        import chain_classes as _ccm
        _CC = dict(_ccm.CLASSES)
        _ex = _ccm.TUNNEL_EXCLUDE if "tunnelD(" in body else (_ccm.LAB3D_EXCLUDE if "float field3(" in body else {})
        for _k in ("chainAP", "chainBP", "chainCP", "chainDP"):     # labs with their own subset (labsubset.py)
            _CC[_k] = _ccm.subset_names(_k, _ex)
        if "tunnelD(" in body:
            _CC.pop("orderP", None)                             # the tunnel runs a fixed order
        for k, names in _CC.items():
            out.append("// @chainclasses %s %s" % (k, "|".join(n if n else "none" for n in names)))
        # position -> branch of every stage (the frag's own ord functions, so
        # a lab's class subset is right): the app's specialised variants name
        # branches, because the drivers do not fold the ord if-chains.
        for _k, _f in (("chainAP", "orda"), ("chainBP", "ordb"), ("chainCP", "ordc"), ("chainDP", "ordd"),
                       ("spaceP", "ordsp"), ("coreP", "ordco"), ("bodyP", "ordbo")):
            _m = re.search(r"int %s\(int i\) \{(.*?)\}" % _f, body)
            if _m:
                _b = [int(x) for x in re.findall(r"return (\d+);", _m.group(1))]
                out.append("// @chainord %s %s" % (_k, "|".join(str(x) for x in _b)))
        if not _ex:                                             # the flat labs: at most one stage with an opening
            for _k in ("chainAP", "chainBP", "chainCP", "chainDP"):
                out.append("// @chainopening %s %s" % (_k, "|".join(str(i) for i in _ccm.opening_positions(_k, _CC[_k]))))
        if not _ex:                                             # the flat labs (2D lab, FxChain): the classes that sparkle (supersampled)
            _al = _ccm.sparkling()
            for _st, _k in (("A", "chainAP"), ("B", "chainBP"), ("C", "chainCP"), ("D", "chainDP")):
                _pos = [i for i, n in enumerate(_CC[_k]) if (_st, n or "none") in _al]
                if _pos:
                    out.append("// @chainss %s %s" % (_k, "|".join(str(i) for i in _pos)))
    bodyText = spec_variants(body).rstrip() + "\n"
    if late:
        mm = list(re.finditer(r"^void\s+main\s*\(", bodyText, re.M))[-1]
        bodyText = bodyText[:mm.start()] + "\n".join(late) + "\n" + bodyText[mm.start():]
    out.append(bodyText)
    # //@target fx: an overlay (CombineShader) -- tex0/tex1 are then the finished
    # scene frame instead of the photos; the same library applies.
    folder = "FX" if re.search(r"^//@target\s+fx\b", src, re.M) else "Scene2D"
    return folder, _doc.annotate("\n".join(out), os.path.join(folder, name + ".frag"))


def build(name):
    """Writes Scene2D|FX/<name>.frag with the CGVR guidelines' names and layout (Tools/cgvr_glsl_names.py)."""
    folder, text = assemble(name)
    path = os.path.join(ROOT, folder, name + ".frag")
    io.open(path, "w", encoding="utf-8", newline="\n").write(_cgvr.layout_and_names(text, path))
    print("gebaut:", name)
    # The app runs these two labs' chains as passes (Engine/ChainPass): their
    # pass shaders and final shaders follow every rebuild.
    if name in ("ChainLab2D", "FxChain", "ChainLab3D", "ChainSlice3D"):
        import make_chainpass
        make_chainpass.main()


if __name__ == "__main__":
    for n in sys.argv[1:]:
        build(n)

#version 330 core
out vec4 fragColor;
/**
 * @file ChainLabTunnel.frag
 * @brief CHAIN LAB TUNNEL: the chain laboratory as a tunnel, like the original
 * Tunnel scenes -- every start rolls a new chain of four continuous transforms
 * (the 2D chain lab's classes: global map, symmetry, second map, warp), the
 * photograph flows through it, and the chain is wrapped around the inside of a
 * tube whose axis winds slowly, so the vanishing point wanders.  The chain's
 * brightness becomes real depth: the wall is a relief that stands out into the
 * tube, lit by a light travelling with the camera, with a colour field that
 * follows the chain and wanders with the music.  The camera flies on the axis
 * and the relief never reaches it.  Endless.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight and the flow through the chain (integrated, jump-free)
 *   sceneAdvance    -> the chain morphs on to the next transform (integrated)
 *   audioPhase      -> the kaleidoscopes turn, the colours wander (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the relief crests flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the relief rises, the colours saturate (slow)
 *
 * Knobs: chainAP / chainBP / chainCP / chainDP (the chain, rolled per start),
 * morphP (which stage, if any, morphs on with the music), depthP (relief
 * height), styleP (lit photo / glowing crests), speedP (flight speed),
 * detailP (texture sharpness), paletteP (photo colours / colour field), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;
uniform float audioPhase;
uniform float audioSpread;
uniform float audioKick;
uniform float audioMode;
uniform float audioSwell;

uniform float chainAP;
uniform float chainBP;
uniform float chainCP;
uniform float chainDP;
uniform float morphP;
uniform float depthP;
uniform float styleP;
uniform float speedP;
uniform float detailP;
uniform float paletteP;
uniform float hueP;

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
    return c + z * 0.9;
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
// Joukowski map w = z + R^2 / z (the airfoil map): circles become wings.
vec2 tJoukowski(vec2 uv, vec2 c, float R, float scale)
{
    vec2 z = (uv - c) * scale;
    vec2 iz = vec2(z.x, -z.y) / max(dot(z, z), 1e-5);
    return c + (z + R * R * iz) * 0.5;
}

vec2 chain(vec2 p);
// The chain's photo read with a seam-proof footprint (per axis the smaller of
// the two one-sided differences) and the screen-space luma gradient.
vec3 imgChain(vec2 p, float bias, out vec2 grad)
{
    float h = 1.5 / resolution.y;
    vec2 c0 = chain(p);
    vec2 cx1 = chain(p + vec2(h, 0.0)), cx0 = chain(p - vec2(h, 0.0));
    vec2 cy1 = chain(p + vec2(0.0, h)), cy0 = chain(p - vec2(0.0, h));
    vec2 m0 = mirrorUV(c0);
    float fx = min(length(mirrorUV(cx1) - m0), length(m0 - mirrorUV(cx0)));
    float fy = min(length(mirrorUV(cy1) - m0), length(m0 - mirrorUV(cy0)));
    float lod = clamp(log2(max(max(fx, fy) / 1.5 * 1024.0, 1.0)) + bias, 0.0, 9.0);
    vec3 col = imgLod(c0, lod);
    float lx = luma(imgLod(cx1, lod)) - luma(imgLod(cx0, lod));
    float ly = luma(imgLod(cy1, lod)) - luma(imgLod(cy0, lod));
    grad = vec2(lx, ly) * 0.5;                                  // luma change per 1.5 px
    return col;
}

float gT, gTC, gSpread, gRot, gMw, gH;
vec2 gCw, gCt;
// The stage index and a sub-variant 0..1 from one rolled knob.
float gIdW = 1.0;   // how much of the chain is 'none' or too weak to carry it (product over the stages)
int pickStage(float x, int n) { return int(min(floor(clamp(x, 0.0, 1.0) * float(n)), float(n - 1))); }
float subVar(float x, int n) { return fract(clamp(x, 0.0, 0.9999) * float(n)); }
float evenArms(float v) { return 2.0 * (1.0 + floor(v * 3.99)); }        // 2, 4, 6, 8 (seamless spiral)
float sides(float v) { return 5.0 + floor(v * 4.99); }                     // 5 .. 9 mirrors

// The classes of every stage in order of energy (calm .. energetic): a knob
// value, rolled or walked, picks a position on that scale, so the music's
// energy can choose the region (EffectShader::stepChainWalk).
const int ORD_A[12] = int[12](11, 5, 4, 9, 1, 6, 10, 7, 8, 3, 0, 2);   // 11 = none (identity)
const int ORD_B[6] = int[6](0, 5, 3, 1, 2, 4);
const int ORD_C[8] = int[8](0, 5, 7, 1, 4, 3, 6, 2);
const int ORD_D[6] = int[6](0, 5, 2, 1, 4, 3);
const int ORD_S[5] = int[5](0, 1, 3, 4, 2);   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
    k = ORD_A[k];
    if (k == 11) return uv;                                  // none: the chain starts at stage B
    if (k == 0) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 0.8 + 0.4 * v, gTC * 2.0);
    if (k == 2) return tTunnel(uv, gCt, 0.2 + 0.1 * v, gTC * 3.0);
    if (k == 3) {
        vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gTC), cos(gTC * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gTC * 0.8), cos(gTC));
        return tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);
    }
    if (k == 4) return tDroste(uv, gCt, 2.0 + floor(v * 2.99), gTC * 1.5);
    if (k == 5) return tPolar(uv, gCt, 1.2 + 0.8 * v);
    if (k == 6) return tExp(uv, gCw, 3.0 + 1.5 * v + 1.5 * gSpread);
    if (k == 7) return tSin(uv, gCw, 3.5 + 1.5 * v + 1.5 * gSpread);
    if (k == 8) return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
    if (k == 9) {
        // {p,q} from the sub-variant: (5,4) (4,5) (6,4) (7,3) (8,3) (4,6)
        int j = int(floor(v * 5.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(4.0, 5.0) : j == 2 ? vec2(6.0, 4.0) : j == 3 ? vec2(7.0, 3.0) : j == 4 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
        return tPoincare(uv, vec2(0.5), pq.x, pq.y, 2.2, 0.45 * vec2(sin(gTC * 0.7), sin(gTC * 0.53 + 1.0)));
    }
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
}
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
    k = ORD_B[k];
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gTC), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
// Stage C: a second global map.
vec2 stageCk(vec2 uv, int k, float v)
{
    k = ORD_C[k];
    if (k == 0) return uv;
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gTC * 1.5);
    if (k == 2) return tTunnel(uv, gCt, 0.25, gTC * 2.5);
    if (k == 3) return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
    if (k == 4) return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
    if (k == 5) return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gTC));
    if (k == 6) return tKaleido(uv, vec2(0.5), sides(v), -gRot);
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gTC * 0.4) + 0.1 * v, 2.0);
}
// Stage D: a warp.
vec2 stageDk(vec2 uv, int k, float v)
{
    k = ORD_D[k];
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gTC);
    return tRot(uv, vec2(0.5), 0.5 * sin(gTC * 0.3 + v * 6.28));
}

// Chain walk.  morphP is rolled once per start:
//   below 0.15  the chain stays as rolled;
//   0.15..0.5   one stage (A, B, C or D) walks on;
//   from 0.5    EVERY stage walks, and the style with them -- one lab scene
//               can play for hours without ever repeating.
// A walking stage holds a transform, then cross-fades to another one picked by
// hash, with a fresh sub-variant (mirrors, arms, {p,q} ...), so it roams its
// whole class instead of cycling.  In the all-stages walk the four stages are
// staggered by a quarter, so mostly one fades at a time.  The fade mixes the
// two MIRRORED outputs, each continuous: the picture never jumps.  Driven by
// time and the integrated music (sceneAdvance surges on flux and harmonic
// changes).
bool walkAll() { return clamp(morphP, 0.0, 1.0) >= 0.5; }
bool walks(int stage)
{
    float m = clamp(morphP, 0.0, 1.0);
    if (m < 0.15) return false;
    if (m >= 0.5) return true;
    return int(min(floor((m - 0.15) / 0.35 * 4.0), 3.0)) + 1 == stage;
}
// The transform (k) and sub-variant (v) shown in walk cycle c; cycle 0 is the rolled one.
void walkPick(float c, int k0, float v0, int n, float salt, out int k, out float v)
{
    if (c < 0.5) { k = k0; v = v0; return; }
    float s = salt + 17.0 * (chainAP + 2.0 * chainBP + 3.0 * chainCP + 5.0 * chainDP);   // each start walks its own way
    k = int(min(floor(hash11(c * 7.31 + s) * float(n)), float(n - 1)));
    v = hash11(c * 3.17 + s * 1.7 + 0.5);
}
float walkPos(int stage) { return walkAll() ? 0.5 * gMw + 0.25 * float(stage - 1) : gMw; }
float walkFade(float kf) { return smoothstep(walkAll() ? 0.7 : 0.55, 1.0, fract(kf)); }
vec2 morphMix(vec2 a, vec2 b, float f) { return mix(mirrorUV(a), mirrorUV(b), f); }
vec2 stageA(vec2 uv)
{
    int k0 = pickStage(chainAP, 12); float v0 = subVar(chainAP, 12);
    if (!walks(1)) { gIdW *= (k0 <= 0 ? 1.0 : 0.0); return stageAk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkA.z);
        int j0 = pickStage(walkA.x, 12), j1 = pickStage(walkA.y, 12);
        gIdW *= (j0 <= 0 ? 1.0 - f : 0.0) + (j1 <= 0 ? f : 0.0);
        if (f <= 0.0) return stageAk(uv, j0, subVar(walkA.x, 12));
        return morphMix(stageAk(uv, j0, subVar(walkA.x, 12)), stageAk(uv, j1, subVar(walkA.y, 12)), f);
    }
    float kf = walkPos(1), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 12, 1.3, i0, w0);
    walkPick(c + 1.0, k0, v0, 12, 1.3, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 0 ? 1.0 - f : 0.0) + (i1 <= 0 ? f : 0.0);
    if (f <= 0.0) return stageAk(uv, i0, w0);
    return morphMix(stageAk(uv, i0, w0), stageAk(uv, i1, w1), f);
}
vec2 stageB(vec2 uv)
{
    int k0 = pickStage(chainBP, 6); float v0 = subVar(chainBP, 6);
    if (!walks(2)) { gIdW *= (k0 <= 1 ? 1.0 : 0.0); return stageBk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkB.z);
        int j0 = pickStage(walkB.x, 6), j1 = pickStage(walkB.y, 6);
        gIdW *= (j0 <= 1 ? 1.0 - f : 0.0) + (j1 <= 1 ? f : 0.0);
        if (f <= 0.0) return stageBk(uv, j0, subVar(walkB.x, 6));
        return morphMix(stageBk(uv, j0, subVar(walkB.x, 6)), stageBk(uv, j1, subVar(walkB.y, 6)), f);
    }
    float kf = walkPos(2), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 6, 2.9, i0, w0);
    walkPick(c + 1.0, k0, v0, 6, 2.9, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 1 ? 1.0 - f : 0.0) + (i1 <= 1 ? f : 0.0);
    if (f <= 0.0) return stageBk(uv, i0, w0);
    return morphMix(stageBk(uv, i0, w0), stageBk(uv, i1, w1), f);
}
vec2 stageC(vec2 uv)
{
    int k0 = pickStage(chainCP, 8); float v0 = subVar(chainCP, 8);
    if (!walks(3)) { gIdW *= (k0 <= 1 ? 1.0 : 0.0); return stageCk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkC.z);
        int j0 = pickStage(walkC.x, 8), j1 = pickStage(walkC.y, 8);
        gIdW *= (j0 <= 1 ? 1.0 - f : 0.0) + (j1 <= 1 ? f : 0.0);
        if (f <= 0.0) return stageCk(uv, j0, subVar(walkC.x, 8));
        return morphMix(stageCk(uv, j0, subVar(walkC.x, 8)), stageCk(uv, j1, subVar(walkC.y, 8)), f);
    }
    float kf = walkPos(3), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 8, 4.7, i0, w0);
    walkPick(c + 1.0, k0, v0, 8, 4.7, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 1 ? 1.0 - f : 0.0) + (i1 <= 1 ? f : 0.0);
    if (f <= 0.0) return stageCk(uv, i0, w0);
    return morphMix(stageCk(uv, i0, w0), stageCk(uv, i1, w1), f);
}
vec2 stageD(vec2 uv)
{
    int k0 = pickStage(chainDP, 6); float v0 = subVar(chainDP, 6);
    if (!walks(4)) { gIdW *= (k0 <= 2 ? 1.0 : 0.0); return stageDk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkD.z);
        int j0 = pickStage(walkD.x, 6), j1 = pickStage(walkD.y, 6);
        gIdW *= (j0 <= 2 ? 1.0 - f : 0.0) + (j1 <= 2 ? f : 0.0);
        if (f <= 0.0) return stageDk(uv, j0, subVar(walkD.x, 6));
        return morphMix(stageDk(uv, j0, subVar(walkD.x, 6)), stageDk(uv, j1, subVar(walkD.y, 6)), f);
    }
    float kf = walkPos(4), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 6, 6.1, i0, w0);
    walkPick(c + 1.0, k0, v0, 6, 6.1, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 2 ? 1.0 - f : 0.0) + (i1 <= 2 ? f : 0.0);
    if (f <= 0.0) return stageDk(uv, i0, w0);
    return morphMix(stageDk(uv, i0, w0), stageDk(uv, i1, w1), f);
}

vec2 chain(vec2 uv)
{
    gIdW = 1.0;
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    uv = stageD(uv);
    // Never an empty chain: as the stages together approach 'none' (gIdW), a
    // calm six-fold kaleidoscope fades in -- the bare photo is never shown.
    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    return uv;
}
// The tube's axis winds slowly: the vanishing point wanders.
vec2 axisXY(float z) { return vec2(0.35 * sin(z * 0.11) + 0.15 * sin(z * 0.27 + 1.0), 0.3 * sin(z * 0.087 + 0.6) + 0.12 * cos(z * 0.21)); }
// Wall coordinates: angle around (jumps by a whole mirror period at the atan
// cut, so mirrorUV makes it seamless) and depth along.
vec2 wallUV(vec3 q)
{
    vec2 d = q.xy - axisXY(q.z);
    return mirrorUV(vec2(atan(d.y, d.x) / 3.14159265, q.z * 0.32));   // 2 units around = 6.3 world units: about square
}
// Distance to the wall: radius 1 minus the relief (the chain's smooth brightness).
// The relief height: the chain's brightness, blurred more where the chain
// squeezes the photo (its local stretch J), so the relief never gets finer
// than it can be drawn -- otherwise it turns into sub-pixel spikes.
float wallHeight(vec2 w, vec2 c)
{
    float J = length(mirrorUV(chain(w + vec2(0.01, 0.01))) - mirrorUV(c)) / 0.0141;
    return luma(imgLod(c, 4.0 + clamp(log2(max(J, 1.0)), 0.0, 5.0)));
}
float tunnelD(vec3 q, out vec2 c)
{
    vec2 w = wallUV(q);
    c = chain(w);
    return (1.0 - gH * wallHeight(w, c)) - length(q.xy - axisXY(q.z));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.3 + 0.5 * clamp(speedP, 0.0, 1.0)) * sceneTime + 2.0 * audioAdvance;
    gTC = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    gH = (0.15 + 0.3 * clamp(depthP, 0.0, 1.0)) * (0.8 + 0.3 * swell);   // at most 0.59: the axis stays free
    // Camera on the axis, looking at the axis ahead.
    vec3 ro = vec3(axisXY(gT), gT);
    vec3 ta = vec3(axisXY(gT + 2.5), gT + 2.5);
    vec3 fw = normalize(ta - ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 rd = mat3(rt, cross(fw, rt), fw) * normalize(vec3(p, 1.2));
    float t = 0.05; float d = 1.0; vec2 c = vec2(0.5); bool hit = false;
    for (int i = 0; i < 90; ++i) {
        d = tunnelD(ro + rd * t, c);
        if (d < 0.0015 * t) { hit = true; break; }
        t += d * 0.55;
        if (t > 28.0) break;
    }
    float hueF = hueP * 0.159 + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode;
    vec3 fogC = hsv2rgb(vec3(fract(hueF + 0.5), 0.5, 1.0)) * (0.04 + 0.08 * swell);
    vec3 col = fogC;
    if (hit) {
        vec3 q = ro + rd * t;
        vec2 cc;
        vec2 e = vec2(1.0, -1.0) * max(0.004, 0.003 * t);           // wider with distance: no sub-pixel grain
        vec3 n = normalize(e.xyy * tunnelD(q + e.xyy, cc) + e.yyx * tunnelD(q + e.yyx, cc) + e.yxy * tunnelD(q + e.yxy, cc) + e.xxx * tunnelD(q + e.xxx, cc));
        // Colour footprint from the chain itself (as in imgChain): the chain one
        // pixel away along both wall axes, per axis the smaller one-sided
        // difference, so a mirror seam on one side does not blur the other.
        // Across the tube a pixel covers t/res of wall; along it (grazing view)
        // that divided by the cosine of the viewing angle -- up to ~30x longer.
        float pxW = t * 2.0 / resolution.y * 0.32;
        float pxZ = pxW / max(abs(dot(normalize(vec3(q.xy - axisXY(q.z), 0.0)), rd)), 0.03);
        vec2 w0 = wallUV(q);
        vec2 m0c = mirrorUV(c);
        float fx = min(length(mirrorUV(chain(w0 + vec2(pxW, 0.0))) - m0c), length(m0c - mirrorUV(chain(w0 - vec2(pxW, 0.0)))));
        float fy = min(length(mirrorUV(chain(w0 + vec2(0.0, pxZ))) - m0c), length(m0c - mirrorUV(chain(w0 - vec2(0.0, pxZ)))));
        float lod = clamp(log2(max(max(fx, fy) * 1024.0, 1.0)) + 1.0 - 1.2 * clamp(detailP, 0.0, 1.0), 0.0, 9.0);
        // Where the chain squeezes the photo below a pixel, its relief is only
        // grain: fade the relief normal toward the smooth tube normal there.
        vec3 nTube = -normalize(vec3(q.xy - axisXY(q.z), 0.0));
        n = normalize(mix(nTube, n, clamp(1.0 - (log2(max(max(fx, fy) * 1024.0, 1.0)) - 4.0) / 2.5, 0.0, 1.0)));
        vec3 ph = imgLod(c, lod);
        float m0 = luma(ph);
        float hgt = wallHeight(wallUV(q), c);                          // relief height 0..1 (crest = 1)
        vec2 cm = mirrorUV(c);
        // The hue follows the chain's coordinates -- but not where they change
        // faster than a pixel (that would be colour noise): fade by the footprint.
        float hueW = clamp(1.0 - (log2(max(max(fx, fy) * 1024.0, 1.0)) - 3.0) / 3.0, 0.0, 1.0);
        float h = hueF + hueW * (0.9 * cm.x + 0.6 * cm.y) + 0.25 * m0;
        vec3 field = hsv2rgb(vec3(fract(h), 0.55 + 0.4 * swell, 1.0)) * (0.35 + 1.3 * m0);
        vec3 tex = mix(max((ph - m0) * 1.4 + m0, 0.0), field, 0.2 + 0.75 * clamp(paletteP, 0.0, 1.0));
        vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.12, 0.92, 0.72), mode);
        // A light travelling with the camera plus a slow circling key light.
        vec3 Lh = normalize(ro + vec3(0.0, 0.0, 1.5) - q);
        float la = 0.13 * sceneTime;
        vec3 Lk = normalize(vec3(cos(la), sin(la), 0.4));
        float diff = 0.55 * max(dot(n, Lh), 0.0) + 0.35 * (0.5 + 0.5 * dot(n, Lk));   // wrapped key: no dark half
        float spec = pow(max(dot(reflect(-Lh, n), -rd), 0.0), 24.0);
        float ao = 0.45 + 0.55 * hgt;                              // the valleys of the relief lie in shade
        vec3 surf = tex * lc * (0.5 + 1.25 * diff) * ao + lc * spec * (0.15 + 0.35 * swell);
        // Glowing crests: the relief's ridges light up in the palette colour.
        float crest = smoothstep(0.45, 0.85, hgt);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 glow = neonOf(field + 1e-3, 2.0) * (crest * (0.6 + 1.2 * kick) + fres * 0.5);
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + glow * 0.25 * (0.5 + kick), glow + surf * 0.55, smoothstep(0.35, 0.65, st));
        col = mix(fogC, sc, exp(-t * (0.07 + 0.03 * swell)));
    }
    finish(col);
}

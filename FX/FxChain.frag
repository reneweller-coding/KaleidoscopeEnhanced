#version 330 core
out vec4 fragColor;
/**
 * @file FxChain.frag
 * @brief FX CHAIN: the chain laboratory as an overlay -- the finished frame of
 * whatever scene is playing flows through a rolled chain of four continuous
 * transforms (the 2D chain lab's classes: global map, symmetry, second map,
 * warp), so every scene becomes the input of a new chain.  The frame has no
 * mip chain of its own; the engine builds one while this FX is on screen
 * (EffectShader::usesSceneLod), which keeps the squeezed parts from shimmering.
 * Rendered as the frame itself, a lit relief or glowing edges (the preset keeps
 * styleP low), optionally tinted by a colour field that follows the chain.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   sceneAdvance    -> the chain morphs on to the next transform (integrated)
 *   audioPhase      -> the kaleidoscopes turn, the colour field wanders (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioSwell      -> the relief light (slow)
 *
 * Knobs: chainAP / chainBP / chainCP / chainDP (the chain, rolled per start),
 * morphP (which stage, if any, morphs on with the music), styleP (frame /
 * relief / edges / contours / flow), speedP (flow speed), detailP (sharpness),
 * paletteP (the frame's own colours / colour field), hueP.
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
uniform float orderP;
uniform float morphP;
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
// Farris wallpaper functions ("Creating Symmetry", 2015): sums of plane waves
// averaged over a symmetry group are smooth complex functions with exactly
// that symmetry; their value at a point picks the photo's pixel.  Three waves
// whose amplitudes and phases drift with time: the wallpaper keeps changing
// while keeping its symmetry.  kind 0: p4 (square), 1: p3 (hexagonal),
// 2: p6, 3: p4m (square with mirrors), 4: pg, 5: pgg (glide reflections --
// impossible as a fold, natural as a wave function), 6: p3m1, 7: p31m, 8: p4g, 9: cmm.
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
// cn(u; m = 1/2) is doubly periodic on a square lattice (its periods 4K and
// 2K + 2iK, with K = K' = 1.8540747) and maps each square onto the Riemann
// sphere: Peirce's quincuncial projection, inverted.  For m = 1/2 the theta
// nome is q = exp(-pi), so three terms of each series are exact to float
// precision.  cn = (th4(0)/th2(0)) * th2(v) / th4(v), v = pi u / (2K).
vec2 csin(vec2 a) { return vec2(sin(a.x) * cosh(a.y), cos(a.x) * sinh(a.y)); }
vec2 ccos(vec2 a) { return vec2(cos(a.x) * cosh(a.y), -sin(a.x) * sinh(a.y)); }
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
// Five families of parallel lines (directions e_j = 72 deg apart, offsets
// gam_j with sum 0).  Every crossing of a line of family r (value n_r) with
// one of family s (n_s) is a rhombus with edges e_r, e_s; its corner is
// sum_j K_j e_j with K_j = ceil(p . e_j + gam_j) at the crossing p, and K_r,
// K_s = n_r, n_s.  The tiling is about 5/2 times the pentagrid, so the
// crossings near x * 0.4 are searched (3 x 3 per pair of families).  Returns
// the rhombus coordinates a, b in [0, 1] (x = base + a e_r + b e_s).
vec2 pentE(int j) { float a = 1.2566371 * float(j); return vec2(cos(a), sin(a)); }
float pentG(int j, vec4 g) { return j == 0 ? g.x : j == 1 ? g.y : j == 2 ? g.z : j == 3 ? g.w : -(g.x + g.y + g.z + g.w); }
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
// N = 4: Ammann-Beenker (8-fold), N = 5: Penrose (10-fold), N = 6: 12-fold,
// N = 7: 14-fold.  As penroseFind, for any N (up to 7).
vec2 gridE(int j, float N) { float a = 3.14159265 * float(j) / N; return vec2(cos(a), sin(a)); }
float gridG(int j) { return fract(0.1234 + 0.6180339 * float(j)) - 0.5; }
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
// The chain's photo read with a seam-proof footprint (per axis the smaller of
// the two one-sided differences) and the screen-space luma gradient.
// A loop count the compiler cannot see through (it depends on a uniform), so
// the loop is NOT unrolled and its body -- a whole chain -- is inlined once.
int loopN(int n) { return n + int(min(interpolation, 0.0)); }
vec2 gChainM, gChainDx, gChainDy;    // mirrored chain coordinate of this pixel and its derivatives per pixel
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

// @chainclasses spaceP mirrored lattice|octahedral lattice|icosahedral lattice|hexagonal lattice|rolled world|4D-rotated lattice|log-spherical Droste|twisted 3D Droste|log-cylindrical Droste|turning lattice|bent cells|torus-wrapped world|hyperbolic half-space|twisted lattice|gyroid-warped lattice|noise-warped lattice|helix|double helix|inverted lattice|polar ring tunnel
// @chainclasses coreP no fold core|plane folds|polyhedral kaleidoscope|sphere-inversion box fold|spherical KIFS|Apollonian sphere packing|Mandalay box|hyperbolic honeycomb|Kleinian fold|pseudo-Kleinian|amazing surface|Mandelbulb|kaliset|tetrahedral KIFS|mixed Sierpinski|Sierpinski octahedron|icosahedral KIFS|dodecahedral KIFS|octahedral KIFS|twisted octahedral KIFS|Menger sponge|cross-Menger
// @chainclasses bodyP balls|pills|superquadrics|octahedra|rhombic dodecahedra|icosahedra|hollow spheres|tori|chain links|linked rings|gyroid membrane|Schwarz P surface|Schwarz D surface|Neovius surface|Lidinoid|blocks|twisted pillars|rod lattice|stellated octahedra|Steinmetz solids|crosses|gears
// @chainclasses chainAP none|polar unwrap|elliptic coordinates|parabolic coordinates|Cassini ovals|Farris wallpaper|Farris frieze|sunflower spirals|quasicrystal|Droste zoom|Escher spiral Droste|little planet|rotating Mercator|bipolar Droste|hyperbolic Droste|hyperbolic Poincare tiling|hyperbolic band|hyperbolic half-plane|sphere kaleidoscope|Klein invariants|log-polar spiral|Archimedean spiral|hyperbolic spiral|rotating Riemann sphere|breathing sphere|Peirce quincuncial sphere|magnet map|Jacobi cn wallpaper|theta wave|Jacobi sn/dn wallpaper|Weierstrass p|parabolic stream|hyperbolic Moebius flow|Chebyshev fold|complex exponential|cardioid coordinates|Blaschke product|wandering poles|bipolar stream|complex sine|tan lattice|zeta partial sum|circle inversion|Moebius stream|loxodromic stream|Newton map|Julia map|Zaslavsky web|Gumowski-Mira|Chirikov map|Henon map|Ikeda map|Mandelbrot map|burning ship|Phoenix Julia|cubic Julia|kaleidoscope|tunnel
// @chainclasses chainBP none|mirror line|origami folds|p4m lattice|p3m1 triangle mirror|kaleidoscope|spiral kaleidoscope|curved kaleidoscope|Steiner kaleidoscope|Penrose mirror|Ammann-Beenker mirror|12-fold quasicrystal mirror|modular group mirror|p6m lattice|Sierpinski fold|Koch fold|Levy C fold|Pappus chain|Pythagoras-tree fold|Vicsek fold|iterated fold|Apollonian inversion fold|Schottky mirror
// @chainclasses chainCP none|lens|zone lens|fisheye|Lorentz boost|blossom|Farris rosette|mirrored power|Cayley transform|gravitational lens|binary lens|Joukowski map|spiral|log vortex|complex square|inversion|kaleidoscope|tunnel
// @chainclasses chainDP none|turning|bend|shear wave|Gerstner waves|wave interference|convection cells|curl flow|cylinder flow|dipole field|Taylor-Green vortices|twirl|vortex pair|double gyre|vortex street|Karman street|gravitational wave|Kelvin-Helmholtz rolls|domain warp|ripple
// @chainclasses styleP photo|relief|contour lines|flow|glowing edges
// @chainclasses orderP A → B → C → D|A → B → D → C|A → C → B → D|A → C → D → B|A → D → B → C|A → D → C → B|B → A → C → D|B → A → D → C|B → C → A → D|B → C → D → A|B → D → A → C|B → D → C → A|C → A → B → D|C → A → D → B|C → B → A → D|C → B → D → A|C → D → A → B|C → D → B → A|D → A → B → C|D → A → C → B|D → B → A → C|D → B → C → A|D → C → A → B|D → C → B → A
// @chainord chainAP 11|5|20|39|52|14|26|41|25|4|16|43|44|33|56|9|15|28|24|53|1|29|34|12|42|17|46|27|47|30|45|19|31|48|6|40|18|32|10|7|21|35|8|3|13|22|23|55|54|51|49|50|36|37|38|57|0|2
// @chainord chainBP 0|5|20|3|18|1|22|10|21|8|14|15|16|2|7|9|11|19|12|13|4|6|17
// @chainord chainCP 0|5|17|12|15|8|9|10|11|13|14|7|1|16|4|3|6|2
// @chainord chainDP 0|5|8|2|19|13|18|7|10|11|17|1|12|16|6|9|15|14|4|3
// @chainopening chainAP 9|10|13|14|20|22|31|32|38|44|57
// @chainopening chainBP 
// @chainopening chainCP 12|17
// @chainopening chainDP 
float gT, gSpread, gRot, gMw;
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
int orda(int i) { if (i == 0) return 11; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 39; if (i == 4) return 52; if (i == 5) return 14; if (i == 6) return 26; if (i == 7) return 41; if (i == 8) return 25; if (i == 9) return 4; if (i == 10) return 16; if (i == 11) return 43; if (i == 12) return 44; if (i == 13) return 33; if (i == 14) return 56; if (i == 15) return 9; if (i == 16) return 15; if (i == 17) return 28; if (i == 18) return 24; if (i == 19) return 53; if (i == 20) return 1; if (i == 21) return 29; if (i == 22) return 34; if (i == 23) return 12; if (i == 24) return 42; if (i == 25) return 17; if (i == 26) return 46; if (i == 27) return 27; if (i == 28) return 47; if (i == 29) return 30; if (i == 30) return 45; if (i == 31) return 19; if (i == 32) return 31; if (i == 33) return 48; if (i == 34) return 6; if (i == 35) return 40; if (i == 36) return 18; if (i == 37) return 32; if (i == 38) return 10; if (i == 39) return 7; if (i == 40) return 21; if (i == 41) return 35; if (i == 42) return 8; if (i == 43) return 3; if (i == 44) return 13; if (i == 45) return 22; if (i == 46) return 23; if (i == 47) return 55; if (i == 48) return 54; if (i == 49) return 51; if (i == 50) return 49; if (i == 51) return 50; if (i == 52) return 36; if (i == 53) return 37; if (i == 54) return 38; if (i == 55) return 57; if (i == 56) return 0; return 2; }   // energy order, 58 classes
int ordb(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 3; if (i == 4) return 18; if (i == 5) return 1; if (i == 6) return 22; if (i == 7) return 10; if (i == 8) return 21; if (i == 9) return 8; if (i == 10) return 14; if (i == 11) return 15; if (i == 12) return 16; if (i == 13) return 2; if (i == 14) return 7; if (i == 15) return 9; if (i == 16) return 11; if (i == 17) return 19; if (i == 18) return 12; if (i == 19) return 13; if (i == 20) return 4; if (i == 21) return 6; return 17; }   // energy order, 23 classes
int ordc(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 17; if (i == 3) return 12; if (i == 4) return 15; if (i == 5) return 8; if (i == 6) return 9; if (i == 7) return 10; if (i == 8) return 11; if (i == 9) return 13; if (i == 10) return 14; if (i == 11) return 7; if (i == 12) return 1; if (i == 13) return 16; if (i == 14) return 4; if (i == 15) return 3; if (i == 16) return 6; return 2; }   // energy order, 18 classes
int ordd(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 8; if (i == 3) return 2; if (i == 4) return 19; if (i == 5) return 13; if (i == 6) return 18; if (i == 7) return 7; if (i == 8) return 10; if (i == 9) return 11; if (i == 10) return 17; if (i == 11) return 1; if (i == 12) return 12; if (i == 13) return 16; if (i == 14) return 6; if (i == 15) return 9; if (i == 16) return 15; if (i == 17) return 14; if (i == 18) return 4; return 3; }   // energy order, 20 classes
int ords(int i) { if (i == 0) return 0; if (i == 1) return 1; if (i == 2) return 3; if (i == 3) return 4; return 2; }   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
#ifndef SPEC_A0
vec2 stageAk(vec2 uv, int k, float v)
{
    k = orda(k);
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gT * 0.3), gT * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gT * 0.3) + 0.8, gT * 0.4 + gRot);
    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gT);
    if (k == 46) return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gT);
    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gT);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gT * 0.2));
    if (k == 49) return tHenon(uv, gCw, 3.0, gT);
    if (k == 50) return tIkeda(uv, gCw, 3.0, gT);
    if (k == 51) return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gT * 0.2), 4.0);
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gT * 0.25), gT * 1.2);
    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gT * 0.3), gT * 0.3 + gRot);
    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gT * 0.15) + 0.2 * v, 3.0);
    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gT * 0.2), 4.0);
    if (k == 56) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gT * 0.5, pq.x, pq.y); }
    if (k == 57) return tJulia3(uv, gCw, 2.0, gT);
    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gT);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gT * 0.8);
    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gT);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gT * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gT * 2.0);
    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gT * 2.0);
    if (k == 36) return tMandel(uv, gCw, 4.0, gT);
    if (k == 37) return tShip(uv, gCw, 4.0, gT);
    if (k == 38) return tPhoenix(uv, gCw, 3.0, gT);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gT * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gT);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gT * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gT);
    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gT * 1.5);
    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gT);
    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gT * 0.8); }
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gT * 2.0);
    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gT);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gT * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gT * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 22) return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gT);
    if (k == 23) return tJulia(uv, gCw, 3.0, gT);
    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gT * 0.3), gT * 0.4 + gRot);
    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gT * 1.5);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gT * 0.37) + v * 2.0, gT * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gT * 1.5);
    if (k == 15) {
        int j = int(floor(v * 3.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);
        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gT * 1.2);
    }
    if (k == 16) return tDrosteSpiral(uv, gCt, 2.5 + 3.5 * v, gT * 0.6);
    if (k == 13) {
        vec2 pa = gCw + 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3)), pb = gCw - 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3));
        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gT * 2.0);
    }
    if (k == 11) return uv;                                  // none: the chain starts at stage B
    if (k == 12) return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gT * 0.4) + v * 3.0, gT * 0.8 + gRot);
    if (k == 0) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 0.8 + 0.4 * v, gT * 2.0);
    if (k == 2) return tTunnel(uv, gCt, 0.2 + 0.1 * v, gT * 3.0);
    if (k == 3) {
        vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gT * 0.8), cos(gT));
        return tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);
    }
    if (k == 4) return tDroste(uv, gCt, 2.0 + floor(v * 2.99), gT * 1.5);
    if (k == 5) return tPolar(uv, gCt, 1.2 + 0.8 * v);
    if (k == 6) return tExp(uv, gCw, 3.0 + 1.5 * v + 1.5 * gSpread);
    if (k == 7) return tSin(uv, gCw, 3.5 + 1.5 * v + 1.5 * gSpread);
    if (k == 8) return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
    if (k == 9) {
        // {p,q} from the sub-variant: (5,4) (4,5) (6,4) (7,3) (8,3) (4,6)
        int j = int(floor(v * 5.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(4.0, 5.0) : j == 2 ? vec2(6.0, 4.0) : j == 3 ? vec2(7.0, 3.0) : j == 4 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
        return tPoincare(uv, vec2(0.5), pq.x, pq.y, 2.2, 0.45 * vec2(sin(gT * 0.7), sin(gT * 0.53 + 1.0)));
    }
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gT * 2.0);
}
#else
vec2 stageAk_0(vec2 uv, float v)
{
    
#if SPEC_A0 == 43
    return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gT * 0.3), gT * 0.4 + gRot);
#elif SPEC_A0 == 44
    return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gT * 0.3) + 0.8, gT * 0.4 + gRot);
#elif SPEC_A0 == 45
    return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gT);
#elif SPEC_A0 == 46
    return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gT);
#elif SPEC_A0 == 47
    return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gT);
#elif SPEC_A0 == 48
    return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gT * 0.2));
#elif SPEC_A0 == 49
    return tHenon(uv, gCw, 3.0, gT);
#elif SPEC_A0 == 50
    return tIkeda(uv, gCw, 3.0, gT);
#elif SPEC_A0 == 51
    return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gT * 0.2), 4.0);
#elif SPEC_A0 == 52
    return tCassini(uv, gCt, 0.6 + 0.4 * sin(gT * 0.25), gT * 1.2);
#elif SPEC_A0 == 53
    return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gT * 0.3), gT * 0.3 + gRot);
#elif SPEC_A0 == 54
    return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gT * 0.15) + 0.2 * v, 3.0);
#elif SPEC_A0 == 55
    return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gT * 0.2), 4.0);
#elif SPEC_A0 == 56
    { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gT * 0.5, pq.x, pq.y); }
#elif SPEC_A0 == 57
    return tJulia3(uv, gCw, 2.0, gT);
#elif SPEC_A0 == 30
    return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gT);
#elif SPEC_A0 == 31
    return tHypFlow(uv, gCw, v * 3.0, gT * 0.8);
#elif SPEC_A0 == 32
    return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gT);
#elif SPEC_A0 == 33
    return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gT * 0.5);
#elif SPEC_A0 == 34
    return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gT * 2.0);
#elif SPEC_A0 == 35
    return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gT * 2.0);
#elif SPEC_A0 == 36
    return tMandel(uv, gCw, 4.0, gT);
#elif SPEC_A0 == 37
    return tShip(uv, gCw, 4.0, gT);
#elif SPEC_A0 == 38
    return tPhoenix(uv, gCw, 3.0, gT);
#elif SPEC_A0 == 39
    return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gT * 1.5);
#elif SPEC_A0 == 40
    return tCardioid(uv, gCw, 2.5 + v, gT);
#elif SPEC_A0 == 41
    return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gT * 0.6);
#elif SPEC_A0 == 42
    return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gT);
#elif SPEC_A0 == 26
    return tFrieze(uv, gCw, 0.35 + 0.3 * v, gT * 1.5);
#elif SPEC_A0 == 27
    return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gT);
#elif SPEC_A0 == 28
    { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gT * 0.8); }
#elif SPEC_A0 == 29
    return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gT * 2.0);
#elif SPEC_A0 == 18
    return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gT);
#elif SPEC_A0 == 19
    return tParabolic(uv, gCw, 0.8 + 0.6 * v, gT * 0.8);
#elif SPEC_A0 == 20
    return tElliptic(uv, gCt, 0.15 + 0.1 * v, gT * 1.5);
#elif SPEC_A0 == 21
    return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
#elif SPEC_A0 == 22
    return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gT);
#elif SPEC_A0 == 23
    return tJulia(uv, gCw, 3.0, gT);
#elif SPEC_A0 == 24
    return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gT * 0.3), gT * 0.4 + gRot);
#elif SPEC_A0 == 25
    return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gT * 1.5);
#elif SPEC_A0 == 17
    return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gT * 0.37) + v * 2.0, gT * 0.5 + gRot);
#elif SPEC_A0 == 14
    return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gT * 1.5);
#elif SPEC_A0 == 15
    {
        int j = int(floor(v * 3.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);
        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gT * 1.2);
    }
#elif SPEC_A0 == 16
    return tDrosteSpiral(uv, gCt, 2.5 + 3.5 * v, gT * 0.6);
#elif SPEC_A0 == 13
    {
        vec2 pa = gCw + 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3)), pb = gCw - 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3));
        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gT * 2.0);
    }
#elif SPEC_A0 == 11
    return uv;
#elif SPEC_A0 == 12
    return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gT * 0.4) + v * 3.0, gT * 0.8 + gRot);
#elif SPEC_A0 == 0
    return tKaleido(uv, gCw, sides(v), gRot);
#elif SPEC_A0 == 1
    return tSpiral(uv, vec2(0.5), evenArms(v), 0.8 + 0.4 * v, gT * 2.0);
#elif SPEC_A0 == 2
    return tTunnel(uv, gCt, 0.2 + 0.1 * v, gT * 3.0);
#elif SPEC_A0 == 3
    {
        vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gT * 0.8), cos(gT));
        return tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);
    }
#elif SPEC_A0 == 4
    return tDroste(uv, gCt, 2.0 + floor(v * 2.99), gT * 1.5);
#elif SPEC_A0 == 5
    return tPolar(uv, gCt, 1.2 + 0.8 * v);
#elif SPEC_A0 == 6
    return tExp(uv, gCw, 3.0 + 1.5 * v + 1.5 * gSpread);
#elif SPEC_A0 == 7
    return tSin(uv, gCw, 3.5 + 1.5 * v + 1.5 * gSpread);
#elif SPEC_A0 == 8
    return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
#elif SPEC_A0 == 9
    {
        // {p,q} from the sub-variant: (5,4) (4,5) (6,4) (7,3) (8,3) (4,6)
        int j = int(floor(v * 5.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(4.0, 5.0) : j == 2 ? vec2(6.0, 4.0) : j == 3 ? vec2(7.0, 3.0) : j == 4 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
        return tPoincare(uv, vec2(0.5), pq.x, pq.y, 2.2, 0.45 * vec2(sin(gT * 0.7), sin(gT * 0.53 + 1.0)));
    }
#else
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gT * 2.0);
#endif
    return uv;
}

vec2 stageAk_1(vec2 uv, float v)
{
    
#if SPEC_A1 == 43
    return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gT * 0.3), gT * 0.4 + gRot);
#elif SPEC_A1 == 44
    return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gT * 0.3) + 0.8, gT * 0.4 + gRot);
#elif SPEC_A1 == 45
    return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gT);
#elif SPEC_A1 == 46
    return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gT);
#elif SPEC_A1 == 47
    return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gT);
#elif SPEC_A1 == 48
    return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gT * 0.2));
#elif SPEC_A1 == 49
    return tHenon(uv, gCw, 3.0, gT);
#elif SPEC_A1 == 50
    return tIkeda(uv, gCw, 3.0, gT);
#elif SPEC_A1 == 51
    return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gT * 0.2), 4.0);
#elif SPEC_A1 == 52
    return tCassini(uv, gCt, 0.6 + 0.4 * sin(gT * 0.25), gT * 1.2);
#elif SPEC_A1 == 53
    return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gT * 0.3), gT * 0.3 + gRot);
#elif SPEC_A1 == 54
    return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gT * 0.15) + 0.2 * v, 3.0);
#elif SPEC_A1 == 55
    return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gT * 0.2), 4.0);
#elif SPEC_A1 == 56
    { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gT * 0.5, pq.x, pq.y); }
#elif SPEC_A1 == 57
    return tJulia3(uv, gCw, 2.0, gT);
#elif SPEC_A1 == 30
    return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gT);
#elif SPEC_A1 == 31
    return tHypFlow(uv, gCw, v * 3.0, gT * 0.8);
#elif SPEC_A1 == 32
    return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gT);
#elif SPEC_A1 == 33
    return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gT * 0.5);
#elif SPEC_A1 == 34
    return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gT * 2.0);
#elif SPEC_A1 == 35
    return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gT * 2.0);
#elif SPEC_A1 == 36
    return tMandel(uv, gCw, 4.0, gT);
#elif SPEC_A1 == 37
    return tShip(uv, gCw, 4.0, gT);
#elif SPEC_A1 == 38
    return tPhoenix(uv, gCw, 3.0, gT);
#elif SPEC_A1 == 39
    return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gT * 1.5);
#elif SPEC_A1 == 40
    return tCardioid(uv, gCw, 2.5 + v, gT);
#elif SPEC_A1 == 41
    return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gT * 0.6);
#elif SPEC_A1 == 42
    return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gT);
#elif SPEC_A1 == 26
    return tFrieze(uv, gCw, 0.35 + 0.3 * v, gT * 1.5);
#elif SPEC_A1 == 27
    return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gT);
#elif SPEC_A1 == 28
    { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gT * 0.8); }
#elif SPEC_A1 == 29
    return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gT * 2.0);
#elif SPEC_A1 == 18
    return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gT);
#elif SPEC_A1 == 19
    return tParabolic(uv, gCw, 0.8 + 0.6 * v, gT * 0.8);
#elif SPEC_A1 == 20
    return tElliptic(uv, gCt, 0.15 + 0.1 * v, gT * 1.5);
#elif SPEC_A1 == 21
    return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
#elif SPEC_A1 == 22
    return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gT);
#elif SPEC_A1 == 23
    return tJulia(uv, gCw, 3.0, gT);
#elif SPEC_A1 == 24
    return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gT * 0.3), gT * 0.4 + gRot);
#elif SPEC_A1 == 25
    return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gT * 1.5);
#elif SPEC_A1 == 17
    return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gT * 0.37) + v * 2.0, gT * 0.5 + gRot);
#elif SPEC_A1 == 14
    return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gT * 1.5);
#elif SPEC_A1 == 15
    {
        int j = int(floor(v * 3.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);
        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gT * 1.2);
    }
#elif SPEC_A1 == 16
    return tDrosteSpiral(uv, gCt, 2.5 + 3.5 * v, gT * 0.6);
#elif SPEC_A1 == 13
    {
        vec2 pa = gCw + 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3)), pb = gCw - 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3));
        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gT * 2.0);
    }
#elif SPEC_A1 == 11
    return uv;
#elif SPEC_A1 == 12
    return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gT * 0.4) + v * 3.0, gT * 0.8 + gRot);
#elif SPEC_A1 == 0
    return tKaleido(uv, gCw, sides(v), gRot);
#elif SPEC_A1 == 1
    return tSpiral(uv, vec2(0.5), evenArms(v), 0.8 + 0.4 * v, gT * 2.0);
#elif SPEC_A1 == 2
    return tTunnel(uv, gCt, 0.2 + 0.1 * v, gT * 3.0);
#elif SPEC_A1 == 3
    {
        vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gT * 0.8), cos(gT));
        return tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);
    }
#elif SPEC_A1 == 4
    return tDroste(uv, gCt, 2.0 + floor(v * 2.99), gT * 1.5);
#elif SPEC_A1 == 5
    return tPolar(uv, gCt, 1.2 + 0.8 * v);
#elif SPEC_A1 == 6
    return tExp(uv, gCw, 3.0 + 1.5 * v + 1.5 * gSpread);
#elif SPEC_A1 == 7
    return tSin(uv, gCw, 3.5 + 1.5 * v + 1.5 * gSpread);
#elif SPEC_A1 == 8
    return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
#elif SPEC_A1 == 9
    {
        // {p,q} from the sub-variant: (5,4) (4,5) (6,4) (7,3) (8,3) (4,6)
        int j = int(floor(v * 5.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(4.0, 5.0) : j == 2 ? vec2(6.0, 4.0) : j == 3 ? vec2(7.0, 3.0) : j == 4 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
        return tPoincare(uv, vec2(0.5), pq.x, pq.y, 2.2, 0.45 * vec2(sin(gT * 0.7), sin(gT * 0.53 + 1.0)));
    }
#else
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gT * 2.0);
#endif
    return uv;
}

#endif
// Stage B: a symmetry.
#ifndef SPEC_B0
vec2 stageBk(vec2 uv, int k, float v)
{
    k = ordb(k);
    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gT * 0.5);
    if (k == 17) return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gT * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gT);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gT * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gT * 0.3), cos(gT * 0.23)));
    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.3));
    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.4));
    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
    if (k == 14) return tQuasiMirror(uv, gCw, 4.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
    if (k == 15) return tQuasiMirror(uv, gCw, 6.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
    if (k == 8) return tPenrose(uv, gCw, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3), vec4(0.13, 0.27, -0.21, 0.36));
    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gT * 0.4));
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gT * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gT), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
#else
vec2 stageBk_0(vec2 uv, float v)
{
    
#if SPEC_B0 == 16
    return tModular(uv, gCw, 2.0 + 1.5 * v, gT * 0.5);
#elif SPEC_B0 == 17
    return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
#elif SPEC_B0 == 18
    return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
#elif SPEC_B0 == 19
    return tPappus(uv, gCw, 0.25 + 0.2 * v, gT * 0.5);
#elif SPEC_B0 == 20
    return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gT);
#elif SPEC_B0 == 21
    return tSteiner(uv, gCw, sides(v), gRot);
#elif SPEC_B0 == 22
    return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gT * 0.2), gRot);
#elif SPEC_B0 == 10
    return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gT * 0.3), cos(gT * 0.23)));
#elif SPEC_B0 == 11
    return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.3));
#elif SPEC_B0 == 12
    return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.4));
#elif SPEC_B0 == 13
    return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
#elif SPEC_B0 == 14
    return tQuasiMirror(uv, gCw, 4.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
#elif SPEC_B0 == 15
    return tQuasiMirror(uv, gCw, 6.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
#elif SPEC_B0 == 9
    return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
#elif SPEC_B0 == 8
    return tPenrose(uv, gCw, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3), vec4(0.13, 0.27, -0.21, 0.36));
#elif SPEC_B0 == 7
    return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gT * 0.4));
#elif SPEC_B0 == 6
    return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gT * 0.3), 3.0);
#elif SPEC_B0 == 0
    return uv;
#elif SPEC_B0 == 1
    return tKaleido(uv, gCw, sides(v), gRot);
#elif SPEC_B0 == 2
    return tHex(uv, 2.0 + 1.5 * v);
#elif SPEC_B0 == 3
    return tP4m(uv, 2.0 + 1.5 * v);
#elif SPEC_B0 == 4
    return tFold(uv, 0.4 + 0.3 * sin(gT), 1.2 + 0.1 * v, 3.0);
#else
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
#endif
    return uv;
}

vec2 stageBk_1(vec2 uv, float v)
{
    
#if SPEC_B1 == 16
    return tModular(uv, gCw, 2.0 + 1.5 * v, gT * 0.5);
#elif SPEC_B1 == 17
    return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
#elif SPEC_B1 == 18
    return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
#elif SPEC_B1 == 19
    return tPappus(uv, gCw, 0.25 + 0.2 * v, gT * 0.5);
#elif SPEC_B1 == 20
    return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gT);
#elif SPEC_B1 == 21
    return tSteiner(uv, gCw, sides(v), gRot);
#elif SPEC_B1 == 22
    return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gT * 0.2), gRot);
#elif SPEC_B1 == 10
    return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gT * 0.3), cos(gT * 0.23)));
#elif SPEC_B1 == 11
    return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.3));
#elif SPEC_B1 == 12
    return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.4));
#elif SPEC_B1 == 13
    return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
#elif SPEC_B1 == 14
    return tQuasiMirror(uv, gCw, 4.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
#elif SPEC_B1 == 15
    return tQuasiMirror(uv, gCw, 6.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
#elif SPEC_B1 == 9
    return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
#elif SPEC_B1 == 8
    return tPenrose(uv, gCw, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3), vec4(0.13, 0.27, -0.21, 0.36));
#elif SPEC_B1 == 7
    return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gT * 0.4));
#elif SPEC_B1 == 6
    return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gT * 0.3), 3.0);
#elif SPEC_B1 == 0
    return uv;
#elif SPEC_B1 == 1
    return tKaleido(uv, gCw, sides(v), gRot);
#elif SPEC_B1 == 2
    return tHex(uv, 2.0 + 1.5 * v);
#elif SPEC_B1 == 3
    return tP4m(uv, 2.0 + 1.5 * v);
#elif SPEC_B1 == 4
    return tFold(uv, 0.4 + 0.3 * sin(gT), 1.2 + 0.1 * v, 3.0);
#else
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
#endif
    return uv;
}

#endif
// Stage C: a second global map.
#ifndef SPEC_C0
vec2 stageCk(vec2 uv, int k, float v)
{
    k = ordc(k);
    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gT * 0.4), cos(gT * 0.31)));
    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gT * 0.5);
    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gT * 0.3 + v * 6.28));
    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gT * 0.2));
    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);
    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gT * 0.3));
    if (k == 10) return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gT * 0.3))   /* 0.5: the square-root fold */;
    if (k == 9) return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gT * 1.5);
    if (k == 8) return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gT * 2.0);
    if (k == 0) return uv;
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gT * 1.5);
    if (k == 2) return tTunnel(uv, gCt, 0.25, gT * 2.5);
    if (k == 3) return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
    if (k == 4) return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
    if (k == 5) return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gT));
    if (k == 6) return tKaleido(uv, vec2(0.5), sides(v), -gRot);
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gT * 0.4) + 0.1 * v, 2.0);
}
#else
vec2 stageCk_0(vec2 uv, float v)
{
    
#if SPEC_C0 == 13
    return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gT * 0.4), cos(gT * 0.31)));
#elif SPEC_C0 == 14
    return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gT * 0.5);
#elif SPEC_C0 == 15
    return tBoost(uv, gCw, 0.6 * sin(gT * 0.3 + v * 6.28));
#elif SPEC_C0 == 16
    return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gT * 0.2));
#elif SPEC_C0 == 17
    return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
#elif SPEC_C0 == 11
    return tCayley(uv, gCw, 2.0 + 2.0 * v);
#elif SPEC_C0 == 12
    return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gT * 0.3));
#elif SPEC_C0 == 10
    return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gT * 0.3))   /* 0.5: the square-root fold */;
#elif SPEC_C0 == 9
    return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gT * 1.5);
#elif SPEC_C0 == 8
    return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gT * 2.0);
#elif SPEC_C0 == 0
    return uv;
#elif SPEC_C0 == 1
    return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gT * 1.5);
#elif SPEC_C0 == 2
    return tTunnel(uv, gCt, 0.25, gT * 2.5);
#elif SPEC_C0 == 3
    return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
#elif SPEC_C0 == 4
    return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
#elif SPEC_C0 == 5
    return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gT));
#elif SPEC_C0 == 6
    return tKaleido(uv, vec2(0.5), sides(v), -gRot);
#else
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gT * 0.4) + 0.1 * v, 2.0);
#endif
    return uv;
}

vec2 stageCk_1(vec2 uv, float v)
{
    
#if SPEC_C1 == 13
    return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gT * 0.4), cos(gT * 0.31)));
#elif SPEC_C1 == 14
    return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gT * 0.5);
#elif SPEC_C1 == 15
    return tBoost(uv, gCw, 0.6 * sin(gT * 0.3 + v * 6.28));
#elif SPEC_C1 == 16
    return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gT * 0.2));
#elif SPEC_C1 == 17
    return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
#elif SPEC_C1 == 11
    return tCayley(uv, gCw, 2.0 + 2.0 * v);
#elif SPEC_C1 == 12
    return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gT * 0.3));
#elif SPEC_C1 == 10
    return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gT * 0.3))   /* 0.5: the square-root fold */;
#elif SPEC_C1 == 9
    return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gT * 1.5);
#elif SPEC_C1 == 8
    return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gT * 2.0);
#elif SPEC_C1 == 0
    return uv;
#elif SPEC_C1 == 1
    return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gT * 1.5);
#elif SPEC_C1 == 2
    return tTunnel(uv, gCt, 0.25, gT * 2.5);
#elif SPEC_C1 == 3
    return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
#elif SPEC_C1 == 4
    return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
#elif SPEC_C1 == 5
    return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gT));
#elif SPEC_C1 == 6
    return tKaleido(uv, vec2(0.5), sides(v), -gRot);
#else
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gT * 0.4) + 0.1 * v, 2.0);
#endif
    return uv;
}

#endif
// Stage D: a warp.
#ifndef SPEC_D0
vec2 stageDk(vec2 uv, int k, float v)
{
    k = ordd(k);
    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gT * 2.0);
    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gT * 2.0);
    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gT * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gT * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gT * 3.0);
    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gT * 2.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gT * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gT);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gT);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gT * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gT);
    if (k == 8) return tBend(uv, 1.8 * sin(gT * 0.4 + v * 6.28));
    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gT * 2.0);
    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gT);
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gT * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gT * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gT * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gT);
    return tRot(uv, vec2(0.5), 0.5 * sin(gT * 0.3 + v * 6.28));
}
#else
vec2 stageDk_0(vec2 uv, float v)
{
    
#if SPEC_D0 == 15
    return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gT * 2.0);
#elif SPEC_D0 == 16
    return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gT * 2.0);
#elif SPEC_D0 == 17
    return tTaylorGreen(uv, 1.0 + gSpread, gT * 2.0);
#elif SPEC_D0 == 18
    return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gT * 2.0);
#elif SPEC_D0 == 19
    return tGerstner(uv, 1.0 + gSpread, gT * 3.0);
#elif SPEC_D0 == 9
    return tKarman(uv, 2.0 + 2.0 * gSpread, gT * 2.0);
#elif SPEC_D0 == 10
    return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gT * 0.3));
#elif SPEC_D0 == 11
    return tDipole(uv, gCw, 1.0 + gSpread, gT);
#elif SPEC_D0 == 12
    return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gT);
#elif SPEC_D0 == 13
    return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gT * 2.0);
#elif SPEC_D0 == 14
    return tKelvinHelmholtz(uv, 1.0 + gSpread, gT);
#elif SPEC_D0 == 8
    return tBend(uv, 1.8 * sin(gT * 0.4 + v * 6.28));
#elif SPEC_D0 == 6
    return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gT * 2.0);
#elif SPEC_D0 == 7
    return tCurl(uv, 0.4 + 0.8 * gSpread, gT);
#elif SPEC_D0 == 0
    return uv;
#elif SPEC_D0 == 1
    return tTwirl(uv, gCw, 2.5 * sin(gT * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
#elif SPEC_D0 == 2
    return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gT * 4.0);
#elif SPEC_D0 == 3
    return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gT * 8.0);
#elif SPEC_D0 == 4
    return tWarp(uv, 0.05 + 0.15 * gSpread, gT);
#else
    return tRot(uv, vec2(0.5), 0.5 * sin(gT * 0.3 + v * 6.28));
#endif
    return uv;
}

vec2 stageDk_1(vec2 uv, float v)
{
    
#if SPEC_D1 == 15
    return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gT * 2.0);
#elif SPEC_D1 == 16
    return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gT * 2.0);
#elif SPEC_D1 == 17
    return tTaylorGreen(uv, 1.0 + gSpread, gT * 2.0);
#elif SPEC_D1 == 18
    return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gT * 2.0);
#elif SPEC_D1 == 19
    return tGerstner(uv, 1.0 + gSpread, gT * 3.0);
#elif SPEC_D1 == 9
    return tKarman(uv, 2.0 + 2.0 * gSpread, gT * 2.0);
#elif SPEC_D1 == 10
    return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gT * 0.3));
#elif SPEC_D1 == 11
    return tDipole(uv, gCw, 1.0 + gSpread, gT);
#elif SPEC_D1 == 12
    return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gT);
#elif SPEC_D1 == 13
    return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gT * 2.0);
#elif SPEC_D1 == 14
    return tKelvinHelmholtz(uv, 1.0 + gSpread, gT);
#elif SPEC_D1 == 8
    return tBend(uv, 1.8 * sin(gT * 0.4 + v * 6.28));
#elif SPEC_D1 == 6
    return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gT * 2.0);
#elif SPEC_D1 == 7
    return tCurl(uv, 0.4 + 0.8 * gSpread, gT);
#elif SPEC_D1 == 0
    return uv;
#elif SPEC_D1 == 1
    return tTwirl(uv, gCw, 2.5 * sin(gT * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
#elif SPEC_D1 == 2
    return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gT * 4.0);
#elif SPEC_D1 == 3
    return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gT * 8.0);
#elif SPEC_D1 == 4
    return tWarp(uv, 0.05 + 0.15 * gSpread, gT);
#else
    return tRot(uv, vec2(0.5), 0.5 * sin(gT * 0.3 + v * 6.28));
#endif
    return uv;
}

#endif

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
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainAP, 58); float v0 = subVar(chainAP, 58);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(1)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkA.z);
            ka = pickStage(walkA.x, 58); va = subVar(walkA.x, 58);
            kb = pickStage(walkA.y, 58); vb = subVar(walkA.y, 58);
        } else {
            float kf = walkPos(1), c = floor(kf);
            walkPick(c, k0, v0, 58, 1.3, ka, va);
            walkPick(c + 1.0, k0, v0, 58, 1.3, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 0 ? 1.0 - f : 0.0) + (kb <= 0 ? f : 0.0);
#ifdef SPEC_A0
    vec2 r = stageAk_0(uv, va);
    if (f > 0.0) r = morphMix(r, stageAk_1(uv, vb), f);
#else
    vec2 r = stageAk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageAk(uv, kb, vb), f);
#endif
    return r;
}
vec2 stageB(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainBP, 23); float v0 = subVar(chainBP, 23);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(2)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkB.z);
            ka = pickStage(walkB.x, 23); va = subVar(walkB.x, 23);
            kb = pickStage(walkB.y, 23); vb = subVar(walkB.y, 23);
        } else {
            float kf = walkPos(2), c = floor(kf);
            walkPick(c, k0, v0, 23, 2.9, ka, va);
            walkPick(c + 1.0, k0, v0, 23, 2.9, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);
#ifdef SPEC_B0
    vec2 r = stageBk_0(uv, va);
    if (f > 0.0) r = morphMix(r, stageBk_1(uv, vb), f);
#else
    vec2 r = stageBk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageBk(uv, kb, vb), f);
#endif
    return r;
}
vec2 stageC(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainCP, 18); float v0 = subVar(chainCP, 18);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(3)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkC.z);
            ka = pickStage(walkC.x, 18); va = subVar(walkC.x, 18);
            kb = pickStage(walkC.y, 18); vb = subVar(walkC.y, 18);
        } else {
            float kf = walkPos(3), c = floor(kf);
            walkPick(c, k0, v0, 18, 4.7, ka, va);
            walkPick(c + 1.0, k0, v0, 18, 4.7, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 1 ? 1.0 - f : 0.0) + (kb <= 1 ? f : 0.0);
#ifdef SPEC_C0
    vec2 r = stageCk_0(uv, va);
    if (f > 0.0) r = morphMix(r, stageCk_1(uv, vb), f);
#else
    vec2 r = stageCk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageCk(uv, kb, vb), f);
#endif
    return r;
}
vec2 stageD(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainDP, 20); float v0 = subVar(chainDP, 20);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(4)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkD.z);
            ka = pickStage(walkD.x, 20); va = subVar(walkD.x, 20);
            kb = pickStage(walkD.y, 20); vb = subVar(walkD.y, 20);
        } else {
            float kf = walkPos(4), c = floor(kf);
            walkPick(c, k0, v0, 20, 6.1, ka, va);
            walkPick(c + 1.0, k0, v0, 20, 6.1, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);
#ifdef SPEC_D0
    vec2 r = stageDk_0(uv, va);
    if (f > 0.0) r = morphMix(r, stageDk_1(uv, vb), f);
#else
    vec2 r = stageDk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageDk(uv, kb, vb), f);
#endif
    return r;
}
// Stage order: the four stages are not commutative (a spiral seen through a
// kaleidoscope is not a kaleidoscope wound into a spiral).  orderP picks one of
// the 24 orders (0 = A, B, C, D); the app may walk it too: then two whole
// chains of different order are cross-faded (walkO: shown, target, fade).
int permCode(int i) { if (i == 0) return 228; if (i == 1) return 180; if (i == 2) return 216; if (i == 3) return 120; if (i == 4) return 156; if (i == 5) return 108; if (i == 6) return 225; if (i == 7) return 177; if (i == 8) return 201; if (i == 9) return 57; if (i == 10) return 141; if (i == 11) return 45; if (i == 12) return 210; if (i == 13) return 114; if (i == 14) return 198; if (i == 15) return 54; if (i == 16) return 78; if (i == 17) return 30; if (i == 18) return 147; if (i == 19) return 99; if (i == 20) return 135; if (i == 21) return 39; if (i == 22) return 75; return 27; }   // base-4 digits: the stage at each position
uniform vec3 walkO;
vec2 applyStage(int k, vec2 uv) { return k == 0 ? stageA(uv) : k == 1 ? stageB(uv) : k == 2 ? stageC(uv) : stageD(uv); }
vec2 runOrder(vec2 uv, int code)
{
    for (int pos = 0; pos < 4; ++pos) {
        uv = applyStage((code >> (2 * pos)) & 3, uv);
        if (pos < 3) uv = mirrorUV(uv);
    }
    return uv;
}
vec2 runChain(vec2 uv)
{
    int o0 = pickStage(orderP, 24), o1 = o0;
    float f = 0.0;
    if (walkHost > 0.5 && walkAll()) { o0 = pickStage(walkO.x, 24); o1 = pickStage(walkO.y, 24); f = smoothstep(0.0, 1.0, walkO.z); }
    gIdW = 1.0;
    vec2 a = runOrder(uv, permCode(o0));
    if (f > 0.0 && o1 != o0) {
        float gi = gIdW;
        gIdW = 1.0;
        vec2 b = runOrder(uv, permCode(o1));
        gIdW = mix(gi, gIdW, f);
        a = morphMix(a, b, f);
    }
    // Never an empty chain: as the stages together approach 'none' -- or only
    // weak classes that leave the photo nearly bare (gIdW) -- a calm six-fold
    // mirror lattice fades in (a lattice, not a kaleidoscope: no centre) -- the bare photo is never shown.
    if (gIdW > 0.0) a = morphMix(a, tHex(tRot(mirrorUV(a), gCw, 0.5 * gRot), 2.5), gIdW);   // a flat six-fold lattice: no centre
    return a;
}
// The time tilt (tiltP): the chain's own time t0 + a x + b y across the
// picture -- a cut through its space-time volume (x, y, t), so every place
// shows another moment of the chain.  Its direction turns slowly (clock only),
// its strength follows the slow swell.  0 below tiltP 0.15.  The uniform lives
// here (not in the labs' knob lists) so every lab built on these stages compiles.
uniform float tiltP;
float chainTiltZ(vec2 q)
{
    float k = smoothstep(0.15, 1.0, tiltP) * 0.6 * (0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0));
    float a = 0.011 * sceneTime;
    return k * dot(vec2(cos(a), sin(a)), q);
}
vec2 chain(vec2 p)
{
    float tz = chainTiltZ(p);
    float t0 = gT, r0 = gRot;
    gT += tz; gRot += 0.5 * tz;
    vec2 c = runChain(p * 0.5 + 0.5);
    gT = t0; gRot = r0;
    return c;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;          // morph position (integrated, never jumps)
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    vec2 grad;
    vec3 ph = imgChain(p, 1.0 - 1.2 * clamp(detailP, 0.0, 1.0), grad);
    float m = luma(ph);
    // Colour field: follows the chain's own (mirrored, hence seamless) coordinates
    // and wanders with the music; the photo's luma keeps the detail.
    vec2 cm = gChainM;                                          // the one chain evaluation (imgChain)
    float h = hueP * 0.159 + 0.9 * cm.x + 0.6 * cm.y + 0.25 * m + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode;
    vec3 field = hsv2rgb(vec3(fract(h), 0.6 + 0.35 * swell, 1.0)) * (0.35 + 1.3 * m);
    vec3 photo = max((ph - m) * 1.4 + m, 0.0);
    photo = mix(photo, field, 0.7 * clamp(paletteP, 0.0, 1.0));   // the scene keeps its colours unless paletteP asks
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp(0.5 + dot(grad, vec2(cos(la), sin(la))) * 5.0, 0.0, 1.0);
    vec3 reliefC = photo * (0.3 + 1.2 * relief) + vec3(1.0) * pow(relief, 6.0) * (0.1 + 0.3 * swell + 0.35 * kick);   // the kick catches the highlights
    // Glowing edges: gradient magnitude as neon.
    vec3 gc = mix(glowColour(ph, p, hueP * 0.159), neonOf(field + 1e-3, 2.0), clamp(paletteP, 0.0, 1.0));
    float edge = smoothstep(0.01, 0.14, length(grad));        // lab audit: 0.02..0.25 left smooth chains nearly black
    vec3 neon = gc * edge * (1.6 + 1.6 * kick) + photo * 0.22;
    // Isolines of the chain's luma: glowing contour lines.
    float xi = m * 12.0 - gT * 6.0;                          // the contour lines flow uphill (integrated, jump-free)
    float pxi = fwidth(xi) + 1e-4;
    float iso = smoothstep(pxi * 1.5, 0.0, abs(fract(xi) - 0.5) - 0.5 + pxi * 1.5);
    vec3 isoC = gc * iso * (1.3 + kick) + photo * 0.12;
    // The look: the rolled one (a pure look -- blends between neighbouring looks
    // are muddy); in the all-stages walk the look walks too, slowly, each look
    // computed on its own and cross-faded.  s0/s1/sf depend on knobs and time
    // only, so every pixel takes the same branches.
    int s0, s1; float sf = 0.0, dummy;
    s0 = pickStage(styleP, 5); s1 = s0;
    if (walkHost > 0.5 && walkAll()) {
        s0 = pickStage(walkS.x, 5); s1 = pickStage(walkS.y, 5);
        sf = smoothstep(0.0, 1.0, walkS.z);
    } else if (walkAll()) {
        float kf = 0.2 * gMw + 0.6, c = floor(kf);
        walkPick(c, s0, 0.0, 5, 23.0, s0, dummy);
        walkPick(c + 1.0, pickStage(styleP, 5), 0.0, 5, 23.0, s1, dummy);
        sf = smoothstep(0.7, 1.0, fract(kf));
    }
    // Flow: noise living in the chain's own space, smeared along the chain's
    // contour direction (line integral convolution) with a travelling phase --
    // silky stream lines that follow the chain.  Only paid for while shown.
    vec3 flowC = photo * 0.25;
    if (ords(s0) == 4 || (ords(s1) == 4 && sf > 0.0)) {
        vec2 fd = vec2(-grad.y, grad.x);
        float gl = length(fd);
        fd /= max(gl, 1e-5);
        float hpx = 3.0 / resolution.y;
        float ph = gT * 25.0;
        float acc = 0.0, wsum = 0.0;
        for (int k = -6; k <= 6; ++k) {
            float fk = float(k);
            float nz = noise2((gChainM + (gChainDx * fd.x + gChainDy * fd.y) * fk * 3.0) * 70.0);   // the chain linearised along the flow
            float w = 1.0 + 0.8 * sin(fk * 0.7 - ph);
            acc += nz * w; wsum += w;
        }
        float lic = smoothstep(0.38, 0.72, acc / wsum) * smoothstep(0.004, 0.04, gl);
        flowC = gc * lic * (1.3 + kick) + photo * 0.25;
    }
    vec3 looks[5] = vec3[5](photo, reliefC, neon, isoC, flowC);
    s0 = ords(s0); s1 = ords(s1);                            // position on the calm..energetic scale -> look
    vec3 col = mix(looks[s0], looks[s1], sf);
    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);
    col += gc * edge * kick * 0.55 * ((s0 <= 1 ? 1.0 - sf : 0.0) + (s1 <= 1 ? sf : 0.0));   // kick glints on photo/relief (light only)
    finish(col);
}

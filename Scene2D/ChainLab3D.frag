#version 330 core
out vec4 fragColor;
/**
 * @file ChainLab3D.frag
 * @brief CHAIN LAB 3D: the 3D chain laboratory -- every start rolls a new
 * raymarched world from three classes of continuous space transforms: a space
 * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,
 * turning lattice, helix, hexagonal lattice, a lattice turned in 4D), a fold core (none, tetrahedral KIFS, octahedral KIFS, a
 * sphere-inversion box fold, plane folds, Menger sponge,
 * Kleinian fold, icosahedral KIFS, polyhedral kaleidoscope) and an end body (block, ball, torus, gyroid
 * membrane, cross, Schwarz P and D minimal surfaces).  The surfaces are coloured by a rolled 2D chain of the
 * 2D chain lab (global map, symmetry, second map, warp) projected
 * triplanarly, with a colour field that follows the chain and wanders with the
 * music.  The camera flies a winding path through a soft tube carved out of
 * every body, so it never collides.  Endless.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight and the flow through the colour chain (integrated, jump-free)
 *   audioPhase      -> the folds turn, the colours wander (integrated)
 *   audioSpread     -> the bodies thicken, the colour chain distorts more
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the fog glow, the colour saturation and the width of the flight tube (slow)
 *
 * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), solidP (the colour
 * chain projected on three planes, or as a solid texture with the depth as its
 * time axis), reliefP (the surfaces bulge with the colour chain's brightness),
 * chainAP..chainDP
 * (the 2D colour chain, rolled per start), morphP (which colour stage morphs on
 * with the music), styleP (lit surface / glowing rims),
 * speedP (flight speed), detailP (texture sharpness), paletteP (photo colours /
 * colour field), hueP.
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

uniform float spaceP;
uniform float coreP;
uniform float bodyP;
uniform float solidP;
uniform float reliefP;
uniform float chainAP;
uniform float chainBP;
uniform float chainCP;
uniform float chainDP;
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
// 2: p6, 3: p4m (square with mirrors).
vec2 cexpi(float a) { return vec2(cos(a), sin(a)); }
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 farrisWave(vec2 X, int kind, float n, float m)
{
    const float TAU = 6.2831853;
    if (kind == 1 || kind == 2) {                               // hexagonal lattice coordinates
        vec2 Y = vec2(X.x + X.y * 0.5773503, X.y * 1.1547005);
        vec2 w = cexpi(TAU * (n * Y.x + m * Y.y)) + cexpi(TAU * (m * Y.x - (n + m) * Y.y)) + cexpi(TAU * (-(n + m) * Y.x + n * Y.y));
        if (kind == 2) w += cexpi(-TAU * (n * Y.x + m * Y.y)) + cexpi(-TAU * (m * Y.x - (n + m) * Y.y)) + cexpi(-TAU * (-(n + m) * Y.x + n * Y.y));
        return w / (kind == 2 ? 6.0 : 3.0);
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
// Twist around z (keep k small: it stretches space).
vec3 fTwistZ(vec3 p, float k) { vec2 q = rot2(k * p.z) * p.xy; return vec3(q, p.z); }
// Sphere inversion (radius R): the outside comes inside, endlessly nested.
vec3 fInvert(vec3 p, float R) { float r2 = max(dot(p, p), 1e-4); gDR *= R * R / r2; return p * R * R / r2; }
// Smooth 3D noise warp (small strength).
vec3 fWarp(vec3 p, float s, float t)
{
    return p + s * vec3(fbm3(p.yz + t), fbm3(p.zx + 3.1 - t), fbm3(p.xy + 5.7 + t)) - s * 0.5;
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
vec2 camPathXY(float z)
{
    return gPathAmp * vec2(1.1 * sin(z * 0.11) + 0.4 * sin(z * 0.23 + 1.3), 0.8 * sin(z * 0.083 + 0.7) + 0.3 * cos(z * 0.19));
}
float smaxK(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float fieldD(vec3 p)
{
    gDR = 1.0;
    float d = field3(p);
    float tube = gTube - length(p.xy - camPathXY(p.z));
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

float gT, gTC, gSpread, gRot, gMw;
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
int orda(int i) { if (i == 0) return 11; if (i == 1) return 5; if (i == 2) return 14; if (i == 3) return 4; if (i == 4) return 16; if (i == 5) return 9; if (i == 6) return 15; if (i == 7) return 1; if (i == 8) return 12; if (i == 9) return 17; if (i == 10) return 6; if (i == 11) return 10; if (i == 12) return 7; if (i == 13) return 8; if (i == 14) return 3; if (i == 15) return 13; if (i == 16) return 0; return 2; }   // 11 none, 17 Peirce quincunx
int ordb(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 3; if (i == 3) return 1; if (i == 4) return 2; if (i == 5) return 4; return 6; }   // none, mirror line, p4m, kaleidoscope, p6m, fold, Apollonian
int ordc(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 8; if (i == 3) return 9; if (i == 4) return 7; if (i == 5) return 1; if (i == 6) return 4; if (i == 7) return 3; if (i == 8) return 6; return 2; }   // none, lens, blossom, rosette, Joukowski, spiral, square, inversion, kaleidoscope, tunnel
int ordd(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 2; if (i == 3) return 1; if (i == 4) return 4; return 3; }
int ords(int i) { if (i == 0) return 0; if (i == 1) return 1; if (i == 2) return 3; if (i == 3) return 4; return 2; }   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
    k = orda(k);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gTC * 0.37) + v * 2.0, gTC * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 3.99)), 1.5 + gSpread, gTC * 1.5);
    if (k == 15) {
        int j = int(floor(v * 3.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);
        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gTC * 1.2);
    }
    if (k == 16) return tDrosteSpiral(uv, gCt, 2.5 + 3.5 * v, gTC * 0.6);
    if (k == 13) {
        vec2 pa = gCw + 0.25 * vec2(cos(gTC * 0.3), sin(gTC * 0.3)), pb = gCw - 0.25 * vec2(cos(gTC * 0.3), sin(gTC * 0.3));
        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gTC * 2.0);
    }
    if (k == 11) return uv;                                  // none: the chain starts at stage B
    if (k == 12) return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gTC * 0.4) + v * 3.0, gTC * 0.8 + gRot);
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
    k = ordb(k);
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gTC * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
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
    k = ordc(k);
    if (k == 9) return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gTC * 1.5);
    if (k == 8) return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gTC * 2.0);
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
    k = ordd(k);
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
    int k0 = pickStage(chainAP, 18); float v0 = subVar(chainAP, 18);
    if (!walks(1)) { gIdW *= (k0 <= 0 ? 1.0 : 0.0); return stageAk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkA.z);
        int j0 = pickStage(walkA.x, 18), j1 = pickStage(walkA.y, 18);
        gIdW *= (j0 <= 0 ? 1.0 - f : 0.0) + (j1 <= 0 ? f : 0.0);
        if (f <= 0.0) return stageAk(uv, j0, subVar(walkA.x, 18));
        return morphMix(stageAk(uv, j0, subVar(walkA.x, 18)), stageAk(uv, j1, subVar(walkA.y, 18)), f);
    }
    float kf = walkPos(1), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 18, 1.3, i0, w0);
    walkPick(c + 1.0, k0, v0, 18, 1.3, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 0 ? 1.0 - f : 0.0) + (i1 <= 0 ? f : 0.0);
    if (f <= 0.0) return stageAk(uv, i0, w0);
    return morphMix(stageAk(uv, i0, w0), stageAk(uv, i1, w1), f);
}
vec2 stageB(vec2 uv)
{
    int k0 = pickStage(chainBP, 7); float v0 = subVar(chainBP, 7);
    if (!walks(2)) { gIdW *= (k0 <= 1 ? 1.0 : 0.0); return stageBk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkB.z);
        int j0 = pickStage(walkB.x, 7), j1 = pickStage(walkB.y, 7);
        gIdW *= (j0 <= 1 ? 1.0 - f : 0.0) + (j1 <= 1 ? f : 0.0);
        if (f <= 0.0) return stageBk(uv, j0, subVar(walkB.x, 7));
        return morphMix(stageBk(uv, j0, subVar(walkB.x, 7)), stageBk(uv, j1, subVar(walkB.y, 7)), f);
    }
    float kf = walkPos(2), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 7, 2.9, i0, w0);
    walkPick(c + 1.0, k0, v0, 7, 2.9, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 1 ? 1.0 - f : 0.0) + (i1 <= 1 ? f : 0.0);
    if (f <= 0.0) return stageBk(uv, i0, w0);
    return morphMix(stageBk(uv, i0, w0), stageBk(uv, i1, w1), f);
}
vec2 stageC(vec2 uv)
{
    int k0 = pickStage(chainCP, 10); float v0 = subVar(chainCP, 10);
    if (!walks(3)) { gIdW *= (k0 <= 1 ? 1.0 : 0.0); return stageCk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkC.z);
        int j0 = pickStage(walkC.x, 10), j1 = pickStage(walkC.y, 10);
        gIdW *= (j0 <= 1 ? 1.0 - f : 0.0) + (j1 <= 1 ? f : 0.0);
        if (f <= 0.0) return stageCk(uv, j0, subVar(walkC.x, 10));
        return morphMix(stageCk(uv, j0, subVar(walkC.x, 10)), stageCk(uv, j1, subVar(walkC.y, 10)), f);
    }
    float kf = walkPos(3), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 10, 4.7, i0, w0);
    walkPick(c + 1.0, k0, v0, 10, 4.7, i1, w1);
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

vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
// Six-fold mirror lattice across the tube (p6m in xy): nearest hexagon
// centre, then the angle folded into a 30-degree wedge -- mirror symmetric,
// so the pieces meet without seams.
vec3 fHexXY(vec3 p, float cell)
{
    vec2 q = p.xy / cell;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float an = abs(mod(atan(h.y, h.x), 1.0471976) - 0.5235988);
    return vec3(length(h) * vec2(cos(an), sin(an)) * cell, p.z);
}
// The structure classes in order of energy (calm .. energetic), as the chain's
// (if-chains, not const arrays: NVIDIA returned entry 0 for three arrays
// indexed in one function -- the body never changed):
// the music's energy picks the region of the world too.
int ordsp(int i) { if (i == 0) return 0; if (i == 1) return 3; if (i == 2) return 6; if (i == 3) return 7; if (i == 4) return 4; if (i == 5) return 2; if (i == 6) return 5; return 1; }   // lattice, octahedral lattice, hexagons, 4D-rotated lattice, turning, twisted, helix, polar ring tunnel
int ordco(int i) { if (i == 0) return 0; if (i == 1) return 4; if (i == 2) return 8; if (i == 3) return 3; if (i == 4) return 6; if (i == 5) return 1; if (i == 6) return 7; if (i == 7) return 2; return 5; }   // none, plane folds, polyhedral kaleidoscope, sphere-inversion box, Kleinian, tetra KIFS, icosa KIFS, octa KIFS, Menger
int ordbo(int i) { if (i == 0) return 1; if (i == 1) return 2; if (i == 2) return 3; if (i == 3) return 5; if (i == 4) return 6; if (i == 5) return 0; return 4; }   // balls, tori, gyroid, Schwarz P, Schwarz D, blocks, crosses
// The app walks the structure too (EffectShader::stepChainWalk): (shown, target, fade).
uniform vec3 walkSpace, walkCore, walkBody;

// One world: a space, a fold core and a body, each a knob value on its energy scale.
float fieldK(vec3 p, float xs, float xc, float xb)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 8)); float vs = subVar(xs, 8);
    int kc = ordco(pickStage(xc, 9)); float vc = subVar(xc, 9);
    int kb = ordbo(pickStage(xb, 7)); float vb = subVar(xb, 7);
    vec3 q;
    if (ks == 0) q = fRepeat(p, vec3(1.2 + 0.4 * vs));
    else if (ks == 1) { q = fPolarZ(p, 6.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.2; q = zRepeat(q, 0.8); }
    else if (ks == 2) q = fRepeat(fTwistZ(p, 0.25 * sin(gT * 0.05)), vec3(1.4));
    else if (ks == 3) q = fOcta(fRepeat(p, vec3(1.5)));
    else if (ks == 4) q = fRepeat(fRot(p, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot)), vec3(1.2, 1.2, 1.8));
    else if (ks == 5) {                                     // helix: a ring of blocks wound along the flight (a spiral staircase)
        q = fPolarZ(fTwistZ(p, 0.3 + 0.2 * vs), 5.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.0; q = zRepeat(q, 0.7);
    }
    else if (ks == 6) q = zRepeat(fHexXY(p, 2.2 + 0.6 * vs), 1.2);
    else q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice        // hexagonal lattice: a honeycomb of pillars
    float bs = 1.0;                                         // body size in the core's space
    if (kc == 1) {
        for (int i = 0; i < 3; ++i) { q = fTetra(q); q = fRot(q, vec3(1.0, 1.0, 0.0), gRot * 0.5 + 0.3 * vc); q = fScale(q, 1.7, vec3(0.45)); }
        bs = 1.4;
    } else if (kc == 2) {
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.0, 1.0, 1.0), gRot * 0.5 + 0.4 * vc); q = fScale(q, 1.6, vec3(0.6, 0.3, 0.2)); }
        bs = 1.4;
    } else if (kc == 3) {
        q = fSphere(q, 0.45 + 0.1 * vc, 1.0); q = fBox(q, 0.6); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.5);
        bs = 1.0;
    } else if (kc == 4) {
        q = fAbs(q); q = fRot(q, vec3(0.0, 0.0, 1.0), 0.4 * sin(gRot) + vc); q = fAbs(q) - vec3(0.25 + 0.1 * vc); q = fRot(q, vec3(1.0, 0.0, 0.0), 0.3 * sin(gT * 0.07));
        bs = 0.8;
    } else if (kc == 5) {
        // Menger sponge: the octahedral fold (abs + sort), scale 3 about the
        // corner, the classic z shift; a slowly swaying axis between rounds.
        for (int i = 0; i < 3; ++i) {
            q = fOcta(q);
            q = fRot(q, vec3(1.0, 1.0, 1.0), 0.12 * sin(gRot) + 0.15 * vc);
            q = fScale(q, 3.0, vec3(2.0));
            if (q.z < -1.0) q.z += 2.0;
        }
        bs = 2.6;
    } else if (kc == 6) {
        // Kleinian (pseudo-Kleinian) fold: box folds and sphere inversions,
        // endlessly nested grottoes; max() keeps the inversion continuous.
        q = fScale(q, 1.8, vec3(0.0));                      // the cells are small: grow them into the folds' reach
        for (int i = 0; i < 4; ++i) {
            q = 2.0 * clamp(q, -vec3(0.8, 0.8, 1.0), vec3(0.8, 0.8, 1.0)) - q;
            float k = max((1.05 + 0.3 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.7;
    }
    else if (kc == 7) {
        // icosahedral KIFS (Knighty): the icosahedral fold, a turn, scale 2
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.4 + 0.3 * vc); q = fScale(q, 1.9, vec3(0.55, 0.3, 0.9)); }
        bs = 1.2;
    } else if (kc == 8) {
        // polyhedral kaleidoscope: one polyhedral fold (tetra / octa / icosa by the
        // sub-variant) around each lattice cell, the body pushed off the axis
        q = fPoly(q, 3.0 + floor(vc * 2.99)); q.z -= 0.35;
        bs = 0.7;
    }
    gP = q;
    float th = 1.0 + 0.3 * gSpread;
    float d;
    if (kb == 0) d = sdBox3(q, vec3(0.35 + 0.1 * vb, 0.3, 0.35) * bs * th);
    else if (kb == 1) d = sdSphere3(q, 0.45 * bs * th);
    else if (kb == 2) d = sdTorus3(q.xzy, 0.5 * bs, 0.12 * bs * th);   // the ring lies in xy: z is the smallest axis after a sort
    else if (kb == 3) d = sdGyroid3(q * (3.0 / bs), 0.25 + 0.2 * gSpread) * bs / 3.0;
    else if (kb == 5) { vec3 w = q * (3.0 / bs); d = (abs(cos(w.x) + cos(w.y) + cos(w.z)) - 0.35 - 0.3 * gSpread) / 2.2 * bs / 3.0; }   // Schwarz P
    else if (kb == 6) { vec3 w = q * (3.0 / bs); vec3 sn = sin(w), cs = cos(w);                     // Schwarz D
        d = (abs(sn.x * sn.y * sn.z + sn.x * cs.y * cs.z + cs.x * sn.y * cs.z + cs.x * cs.y * sn.z) - 0.25 - 0.2 * gSpread) / 2.2 * bs / 3.0; }
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
// The world, walking: while the app fades one structure stage, the two worlds'
// distance fields are mixed -- continuous, the architecture melts into the next.
float field3(vec3 p)
{
    float xs = spaceP, xc = coreP, xb = bodyP, ys = xs, yc = xc, yb = xb, f = 0.0;
    if (walkHost > 0.5 && walkAll()) {
        xs = walkSpace.x; xc = walkCore.x; xb = walkBody.x;
        ys = walkSpace.y; yc = walkCore.y; yb = walkBody.y;
        f = smoothstep(0.0, 1.0, max(walkSpace.z, max(walkCore.z, walkBody.z)));   // one structure stage fades at a time
    }
    float d0 = fieldK(p, xs, xc, xb);
    if (f <= 0.0) return d0;
    vec3 p0 = gP;
    float d1 = fieldK(p, ys, yc, yb);
    gP = mix(p0, gP, f);
    return mix(d0, d1, f);
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
// One plane: the photo through the chain, plus a colour field that follows
// the chain's own coordinates (mirrorUV keeps it seamless at the atan cuts).
vec3 chainPlane(vec2 uv, float lod, float pal)
{
    vec2 c = chain(uv);
    vec3 ph = imgLod(c, lod);
    vec2 m = mirrorUV(c);
    // The colours wander on their own (integrated music phase, jump-free), the
    // mode shifts the palette, the swell saturates it, the kick lights it.
    float h = hueP * 0.159 + 0.9 * m.x + 0.6 * m.y + 0.25 * luma(ph) + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * clamp(audioMode, 0.0, 1.0);
    float sat = 0.55 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec3 fc = hsv2rgb(vec3(fract(h), sat, 1.0)) * (0.35 + 1.3 * luma(ph)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
    return mix(ph, fc, pal);
}
vec3 photoChain3(vec3 q, vec3 n, float lod, float pal)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainPlane(q.yz * 0.35 + 0.5, lod, pal) * w.x + chainPlane(q.zx * 0.35 + 0.5, lod, pal) * w.y + chainPlane(q.xy * 0.35 + 0.5, lod, pal) * w.z;
}


// The solid chain texture: time as the third axis.  A 2D chain whose
// parameters run with time IS a volume (x, y, t).  One time axis alone is not
// isotropic (a face along it cuts the volume in a line and smears it), so each
// of the three planes reads the chain with the coordinate ALONG ITS NORMAL as
// its time, and the normal picks the plane that faces the surface: no streaks,
// and every depth shows its own phase of the chain, like a carved block --
// while the real time keeps the whole block changing.
vec3 chainSlice(vec2 uv, float depth, float lod, float pal)
{
    float tc = gTC, tr = gRot;
    gTC += 0.3 * depth;
    gRot += 0.15 * depth;
    vec3 c = chainPlane(uv, lod, pal);
    gTC = tc; gRot = tr;
    return c;
}
vec3 solidChain3(vec3 q, vec3 n, float lod, float pal)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainSlice(q.yz * 0.35 + 0.5, q.x, lod, pal) * w.x + chainSlice(q.zx * 0.35 + 0.5, q.y, lod, pal) * w.y
         + chainSlice(q.xy * 0.35 + 0.5, q.z, lod, pal) * w.z;
}
vec3 colour3(vec3 q, vec3 n, float lod, float pal)
{
    return solidP >= 0.5 ? solidChain3(q, n, lod, pal) : photoChain3(q, n, lod, pal);
}


// Relief: the brightness of the colour chain as height -- the normal is tilted
// by its slope, measured in the world along two tangents (each sample folds its
// point like the surface), so the light follows the bumps.
float reliefH(vec3 qw, vec3 n, float lod)
{
    fieldD(qw);
    vec3 w = abs(n), fq = gP;
    vec2 uv = (w.x > w.y && w.x > w.z) ? fq.yz : (w.y > w.z ? fq.zx : fq.xy);
    return luma(chainPlane(uv * 0.35 + 0.5, lod, 0.0));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.15 + 0.25 * clamp(speedP, 0.0, 1.0)) * sceneTime + 1.5 * audioAdvance;
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gTC = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;          // colour-chain morph position (integrated)
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    vec3 ro;
    mat3 cf = camFrame(gT, ro);
    gCam = ro;
    gTube = 0.4 + 0.15 * swell;                             // the carved tube breathes with the slow swell
    vec3 rd = cf * normalize(vec3(p, 1.1));
    float t = 0.05; float d = 1.0; bool hit = false;
    for (int i = 0; i < 100; ++i) {
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0008 * t) { hit = true; break; }
        t += d * 0.8;
        if (t > 30.0) break;
    }
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    // The fog takes the palette's hue (wandering with the music) rather than the photo's cast.
    vec3 fogPal = hsv2rgb(vec3(fract(hueP * 0.159 + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode + 0.5), 0.55, 1.0));
    vec3 fogC = mix(glowColour(imgK(vec2(0.5) + 0.2 * p, 5.0), p, hueP * 0.159), fogPal, 0.8 * clamp(paletteP, 0.0, 1.0)) * (0.05 + 0.1 * swell);
    vec3 col = fogC;
    if (hit) {
        vec3 q = ro + rd * t;
        vec3 n = normal3(q);
        fieldD(q);                                              // sets gP for this point
        vec3 fp = gP;
        float lod = clamp(log2(t * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);
        vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one
        if (reliefP > 0.3) {                                    // a knob: every pixel takes the same branch
            vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
            float e = 0.006 * max(t, 1.0), hl = lod + 1.5;
            float h0 = reliefH(q, n, hl);
            vec3 g = t1 * (reliefH(q + t1 * e, n, hl) - h0) + t2 * (reliefH(q + t2 * e, n, hl) - h0);
            n = normalize(n - g / e * 0.05 * smoothstep(0.3, 1.0, reliefP));
        }
        vec3 tex = colour3(fp, nGeo, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));
        float tm = luma(tex);
        tex = max((tex - tm) * 1.5 + tm, 0.0) * 1.5;           // livelier colour, brighter
        vec3 L = normalize(vec3(0.5, 0.7, -0.4));
        float diff = max(dot(n, L), 0.0);
        float ao = 0.0;
        for (int k = 1; k <= 4; ++k) { float h = 0.04 * float(k); ao += (h - fieldD(q + n * h)) / h; }
        ao = clamp(1.0 - 0.2 * ao, 0.2, 1.0);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 surf = tex * lc * (0.35 + 0.9 * diff) * ao;
        vec3 rimC = glowColour(tex, fp.xy, hueP * 0.159);
        vec3 rim = rimC * fres * (0.7 + 1.5 * kick) + surf * 0.4;       // lab audit: the glow style was half as bright
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + rimC * fres * (0.15 + 0.6 * kick), rim * 1.3 + rimC * 0.12 * ao, smoothstep(0.5, 1.0, st));
        col = mix(fogC, sc, exp(-t * (0.06 + 0.04 * swell)));
    }
    finish(col);
}

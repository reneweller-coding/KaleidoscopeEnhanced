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
 * colour field), camP (the first gaze: ahead, out of a side window, slanted down or up,
 * floating, an orthographic side view -- the scene pans on every few minutes), hueP.
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
uniform float orderP;
uniform float morphP;
uniform float styleP;
uniform float speedP;
uniform float detailP;
uniform float paletteP;
uniform float camP;
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
float gOrtho = 0.0;      // orthographic share of the gaze (6)
vec3 gAxis = vec3(0.0, 0.0, 1.0);   // the view axis (world): the ortho slab is cut across it
vec2 camPathXY(float z)
{
    return gPathAmp * vec2(1.1 * sin(z * 0.11) + 0.4 * sin(z * 0.23 + 1.3), 0.8 * sin(z * 0.083 + 0.7) + 0.3 * cos(z * 0.19));
}
float smaxK(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float fieldD(vec3 p)
{
    gDR = 1.0;
    float d = field3(p);
    float tube = max(gTube - length(p.xy - camPathXY(p.z)), -1.0);
    // Looking out of a side window the tube is carved only around the camera
    // (it fades out 3..6 along the flight): carved along the whole path it
    // showed from the side as a dark channel winding off.  The fade is gentle
    // (slope below 0.5, tube clamped at -1), so the distance stays conservative.
    if (gSide > 0.0) tube = mix(tube, -1.0, gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z)));
    // The orthographic gaze starts its rays on a plane through the camera: a
    // slab across the view axis is carved free, its far face is the
    // cross-section the view shows.
    if (gOrtho > 0.0) tube = max(tube, mix(-1.0, 0.35 - abs(dot(p - gCam, gAxis)), gOrtho));
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
// that is only one of seven:
//   0 ahead, 1 out of the right window (the world slides past with parallax),
//   2 slanted down ahead, 3 out of the left window, 4 slanted up,
//   5 floating (the flight nearly stops, the gaze turns slowly all round),
//   6 an orthographic side view (parallel rays, no vanishing point at all:
//     a cross-section through the world slides past, the depth behind it).
// In the app the camera host (camHost) picks the gazes and integrates the
// flight (camZ, slower in some gazes -- EffectShader::stepChainCam keeps the
// speed table); elsewhere (editor renders) the knob picks the first gaze and
// the scene pans on to the next every ~4 minutes.  Time only, never the music:
// the camera does not follow the audio.
uniform float camHost;   // 1: the app drives the camera (camZ, camGaze)
uniform float camZ;      // the flight position along the path
uniform vec3 camGaze;    // (gaze shown, gaze panned to, pan 0..1)
// (yaw, pitch, ortho, carve the tube only near the camera)
vec4 gazeAngles(float k, float time)
{
    float i = mod(k, 7.0);
    // Never along a lattice axis: parallel rays grazing whole rows of bodies
    // took the most march steps (39 fps orthographic straight across, 117 tilted).
    if (i > 5.5) return vec4(1.2, 0.3, 1.0, 1.0);
    if (i > 4.5) return vec4(0.035 * time, 0.35 + 0.2 * sin(0.019 * time), 0.0, 1.0);
    if (i > 3.5) return vec4(-0.3, 0.75, 0.0, 0.0);
    if (i > 2.5) return vec4(-1.35, 0.08, 0.0, 1.0);
    if (i > 1.5) return vec4(0.35, -0.8, 0.0, 0.0);
    if (i > 0.5) return vec4(1.35, -0.08, 0.0, 1.0);
    return vec4(0.0);
}
vec3 gazeTurn(vec3 v, vec2 a) { v.yz = rot2(a.y) * v.yz; v.xz = rot2(-a.x) * v.xz; return v; }
// The camera's flight position (the app's integrated one, or gT).
float camFlight(float gt) { return camHost > 0.5 ? camZ : gt; }
// The ray of pixel p: its direction, and its origin moved off the camera for
// the orthographic share (rays start on a plane through the camera).
vec3 gazeDir(vec2 p, float cam, float time, mat3 cf, inout vec3 ro)
{
    float k0, k1, f;
    if (camHost > 0.5) {
        k0 = camGaze.x; k1 = camGaze.y; f = smoothstep(0.0, 1.0, camGaze.z);
    } else {
        float g = floor(clamp(cam, 0.0, 0.999) * 7.0) + 0.004 * time;
        k0 = floor(g); k1 = k0 + 1.0; f = smoothstep(0.75, 1.0, fract(g));
    }
    vec4 a0 = gazeAngles(k0, time), a1 = gazeAngles(k1, time);
    a1.x += 6.2831853 * floor((a0.x - a1.x) / 6.2831853 + 0.5);   // pan the shorter way round
    vec4 a = mix(a0, a1, f);
    a.xy += (1.0 - a.z) * vec2(0.12 * sin(0.031 * time), 0.08 * sin(0.023 * time + 1.0));
    gSide = a.w;
    gOrtho = a.z;
    vec3 ax = gazeTurn(vec3(0.0, 0.0, 1.0), a.xy);
    gAxis = cf * ax;
    ro += cf * gazeTurn(vec3(p, 0.0), a.xy) * (2.2 * gOrtho);
    return cf * normalize(mix(gazeTurn(normalize(vec3(p, 1.1)), a.xy), ax, gOrtho));
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

// @chainclasses spaceP mirrored lattice|octahedral lattice|icosahedral lattice|hexagonal lattice|rolled world|4D-rotated lattice|log-spherical Droste|twisted 3D Droste|log-cylindrical Droste|turning lattice|bent cells|torus-wrapped world|hyperbolic half-space|twisted lattice|gyroid-warped lattice|noise-warped lattice|helix|double helix|inverted lattice|polar ring tunnel
// @chainclasses coreP no fold core|plane folds|polyhedral kaleidoscope|sphere-inversion box fold|spherical KIFS|Apollonian sphere packing|Mandalay box|hyperbolic honeycomb|Kleinian fold|pseudo-Kleinian|amazing surface|Mandelbulb|kaliset|tetrahedral KIFS|mixed Sierpinski|Sierpinski octahedron|icosahedral KIFS|dodecahedral KIFS|octahedral KIFS|twisted octahedral KIFS|Menger sponge|cross-Menger
// @chainclasses bodyP balls|pills|superquadrics|octahedra|rhombic dodecahedra|icosahedra|hollow spheres|tori|chain links|linked rings|gyroid membrane|Schwarz P surface|Schwarz D surface|Neovius surface|Lidinoid|blocks|twisted pillars|rod lattice|stellated octahedra|Steinmetz solids|crosses|gears
// @chainclasses chainAP none|polar unwrap|elliptic coordinates|parabolic coordinates|Cassini ovals|Farris wallpaper|Farris frieze|sunflower spirals|quasicrystal|Droste zoom|Escher spiral Droste|little planet|rotating Mercator|bipolar Droste|hyperbolic Droste|hyperbolic Poincare tiling|hyperbolic band|hyperbolic half-plane|sphere kaleidoscope|Klein invariants|log-polar spiral|Archimedean spiral|hyperbolic spiral|rotating Riemann sphere|breathing sphere|Peirce quincuncial sphere|magnet map|Jacobi cn wallpaper|theta wave|Jacobi sn/dn wallpaper|Weierstrass p|parabolic stream|hyperbolic Moebius flow|Chebyshev fold|complex exponential|cardioid coordinates|Blaschke product|wandering poles|bipolar stream|complex sine|tan lattice|zeta partial sum|circle inversion|Moebius stream|loxodromic stream|Newton map|Julia map|Zaslavsky web|Gumowski-Mira|Chirikov map|Henon map|Ikeda map|Mandelbrot map|burning ship|Phoenix Julia|cubic Julia|kaleidoscope|tunnel
// @chainclasses chainBP none|mirror line|origami folds|p4m lattice|p3m1 triangle mirror|kaleidoscope|spiral kaleidoscope|curved kaleidoscope|Steiner kaleidoscope|modular group mirror|p6m lattice|Sierpinski fold|Koch fold|Levy C fold|Pappus chain|Pythagoras-tree fold|Vicsek fold|iterated fold|Apollonian inversion fold|Schottky mirror
// @chainclasses chainCP none|lens|zone lens|fisheye|Lorentz boost|blossom|Farris rosette|mirrored power|Cayley transform|gravitational lens|binary lens|Joukowski map|spiral|log vortex|complex square|inversion|kaleidoscope|tunnel
// @chainclasses chainDP none|turning|bend|shear wave|Gerstner waves|wave interference|convection cells|curl flow|cylinder flow|dipole field|Taylor-Green vortices|twirl|vortex pair|double gyre|vortex street|Karman street|gravitational wave|Kelvin-Helmholtz rolls|domain warp|ripple
// @chainclasses styleP photo|relief|contour lines|flow|glowing edges
// @chainclasses orderP A → B → C → D|A → B → D → C|A → C → B → D|A → C → D → B|A → D → B → C|A → D → C → B|B → A → C → D|B → A → D → C|B → C → A → D|B → C → D → A|B → D → A → C|B → D → C → A|C → A → B → D|C → A → D → B|C → B → A → D|C → B → D → A|C → D → A → B|C → D → B → A|D → A → B → C|D → A → C → B|D → B → A → C|D → B → C → A|D → C → A → B|D → C → B → A
// @chainord chainAP 11|5|20|39|52|14|26|41|25|4|16|43|44|33|56|9|15|28|24|53|1|29|34|12|42|17|46|27|47|30|45|19|31|48|6|40|18|32|10|7|21|35|8|3|13|22|23|55|54|51|49|50|36|37|38|57|0|2
// @chainord chainBP 0|5|20|3|18|1|22|10|21|16|2|7|9|11|19|12|13|4|6|17
// @chainord chainCP 0|5|17|12|15|8|9|10|11|13|14|7|1|16|4|3|6|2
// @chainord chainDP 0|5|8|2|19|13|18|7|10|11|17|1|12|16|6|9|15|14|4|3
// @chainord spaceP 0|3|15|6|19|7|9|17|14|4|16|10|12|2|11|18|5|13|8|1
// @chainord coreP 0|4|8|3|20|15|18|9|6|11|10|16|12|1|19|14|7|13|2|21|5|17
// @chainord bodyP 1|21|9|7|17|18|10|2|11|19|3|5|6|12|13|0|16|8|14|15|4|20
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
int orda(int i) { if (i == 0) return 11; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 39; if (i == 4) return 52; if (i == 5) return 14; if (i == 6) return 26; if (i == 7) return 41; if (i == 8) return 25; if (i == 9) return 4; if (i == 10) return 16; if (i == 11) return 43; if (i == 12) return 44; if (i == 13) return 33; if (i == 14) return 56; if (i == 15) return 9; if (i == 16) return 15; if (i == 17) return 28; if (i == 18) return 24; if (i == 19) return 53; if (i == 20) return 1; if (i == 21) return 29; if (i == 22) return 34; if (i == 23) return 12; if (i == 24) return 42; if (i == 25) return 17; if (i == 26) return 46; if (i == 27) return 27; if (i == 28) return 47; if (i == 29) return 30; if (i == 30) return 45; if (i == 31) return 19; if (i == 32) return 31; if (i == 33) return 48; if (i == 34) return 6; if (i == 35) return 40; if (i == 36) return 18; if (i == 37) return 32; if (i == 38) return 10; if (i == 39) return 7; if (i == 40) return 21; if (i == 41) return 35; if (i == 42) return 8; if (i == 43) return 3; if (i == 44) return 13; if (i == 45) return 22; if (i == 46) return 23; if (i == 47) return 55; if (i == 48) return 54; if (i == 49) return 51; if (i == 50) return 49; if (i == 51) return 50; if (i == 52) return 36; if (i == 53) return 37; if (i == 54) return 38; if (i == 55) return 57; if (i == 56) return 0; return 2; }   // energy order, 58 classes
int ordb(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 3; if (i == 4) return 18; if (i == 5) return 1; if (i == 6) return 22; if (i == 7) return 10; if (i == 8) return 21; if (i == 9) return 16; if (i == 10) return 2; if (i == 11) return 7; if (i == 12) return 9; if (i == 13) return 11; if (i == 14) return 19; if (i == 15) return 12; if (i == 16) return 13; if (i == 17) return 4; if (i == 18) return 6; return 17; }   // 3D lab subset, 20 classes
int ordc(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 17; if (i == 3) return 12; if (i == 4) return 15; if (i == 5) return 8; if (i == 6) return 9; if (i == 7) return 10; if (i == 8) return 11; if (i == 9) return 13; if (i == 10) return 14; if (i == 11) return 7; if (i == 12) return 1; if (i == 13) return 16; if (i == 14) return 4; if (i == 15) return 3; if (i == 16) return 6; return 2; }   // energy order, 18 classes
int ordd(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 8; if (i == 3) return 2; if (i == 4) return 19; if (i == 5) return 13; if (i == 6) return 18; if (i == 7) return 7; if (i == 8) return 10; if (i == 9) return 11; if (i == 10) return 17; if (i == 11) return 1; if (i == 12) return 12; if (i == 13) return 16; if (i == 14) return 6; if (i == 15) return 9; if (i == 16) return 15; if (i == 17) return 14; if (i == 18) return 4; return 3; }   // energy order, 20 classes
int ords(int i) { if (i == 0) return 0; if (i == 1) return 1; if (i == 2) return 3; if (i == 3) return 4; return 2; }   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
    k = orda(k);
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gTC * 0.3) + 0.8, gTC * 0.4 + gRot);
    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 46) return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gTC);
    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gTC);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gTC * 0.2));
    if (k == 49) return tHenon(uv, gCw, 3.0, gTC);
    if (k == 50) return tIkeda(uv, gCw, 3.0, gTC);
    if (k == 51) return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gTC * 0.2), 4.0);
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gTC * 0.25), gTC * 1.2);
    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gTC * 0.3), gTC * 0.3 + gRot);
    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gTC * 0.15) + 0.2 * v, 3.0);
    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gTC * 0.2), 4.0);
    if (k == 56) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gTC * 0.5, pq.x, pq.y); }
    if (k == 57) return tJulia3(uv, gCw, 2.0, gTC);
    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gTC);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gTC * 0.8);
    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gTC * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gTC * 2.0);
    if (k == 36) return tMandel(uv, gCw, 4.0, gTC);
    if (k == 37) return tShip(uv, gCw, 4.0, gTC);
    if (k == 38) return tPhoenix(uv, gCw, 3.0, gTC);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gTC * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gTC);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gTC * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gTC);
    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gTC * 1.5);
    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gTC * 0.8); }
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gTC * 2.0);
    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gTC * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gTC * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 22) return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gTC);
    if (k == 23) return tJulia(uv, gCw, 3.0, gTC);
    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gTC * 1.5);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gTC * 0.37) + v * 2.0, gTC * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gTC * 1.5);
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
#ifdef SPEC_A0
vec2 stageAk_0(vec2 uv, float v)
{
    int k = SPEC_A0;
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gTC * 0.3) + 0.8, gTC * 0.4 + gRot);
    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 46) return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gTC);
    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gTC);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gTC * 0.2));
    if (k == 49) return tHenon(uv, gCw, 3.0, gTC);
    if (k == 50) return tIkeda(uv, gCw, 3.0, gTC);
    if (k == 51) return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gTC * 0.2), 4.0);
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gTC * 0.25), gTC * 1.2);
    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gTC * 0.3), gTC * 0.3 + gRot);
    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gTC * 0.15) + 0.2 * v, 3.0);
    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gTC * 0.2), 4.0);
    if (k == 56) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gTC * 0.5, pq.x, pq.y); }
    if (k == 57) return tJulia3(uv, gCw, 2.0, gTC);
    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gTC);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gTC * 0.8);
    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gTC * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gTC * 2.0);
    if (k == 36) return tMandel(uv, gCw, 4.0, gTC);
    if (k == 37) return tShip(uv, gCw, 4.0, gTC);
    if (k == 38) return tPhoenix(uv, gCw, 3.0, gTC);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gTC * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gTC);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gTC * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gTC);
    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gTC * 1.5);
    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gTC * 0.8); }
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gTC * 2.0);
    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gTC * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gTC * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 22) return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gTC);
    if (k == 23) return tJulia(uv, gCw, 3.0, gTC);
    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gTC * 1.5);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gTC * 0.37) + v * 2.0, gTC * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gTC * 1.5);
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
vec2 stageAk_1(vec2 uv, float v)
{
    int k = SPEC_A1;
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gTC * 0.3) + 0.8, gTC * 0.4 + gRot);
    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 46) return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gTC);
    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gTC);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gTC * 0.2));
    if (k == 49) return tHenon(uv, gCw, 3.0, gTC);
    if (k == 50) return tIkeda(uv, gCw, 3.0, gTC);
    if (k == 51) return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gTC * 0.2), 4.0);
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gTC * 0.25), gTC * 1.2);
    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gTC * 0.3), gTC * 0.3 + gRot);
    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gTC * 0.15) + 0.2 * v, 3.0);
    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gTC * 0.2), 4.0);
    if (k == 56) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gTC * 0.5, pq.x, pq.y); }
    if (k == 57) return tJulia3(uv, gCw, 2.0, gTC);
    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gTC);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gTC * 0.8);
    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gTC * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gTC * 2.0);
    if (k == 36) return tMandel(uv, gCw, 4.0, gTC);
    if (k == 37) return tShip(uv, gCw, 4.0, gTC);
    if (k == 38) return tPhoenix(uv, gCw, 3.0, gTC);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gTC * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gTC);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gTC * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gTC);
    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gTC * 1.5);
    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gTC * 0.8); }
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gTC * 2.0);
    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gTC * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gTC * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 22) return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gTC);
    if (k == 23) return tJulia(uv, gCw, 3.0, gTC);
    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gTC * 1.5);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gTC * 0.37) + v * 2.0, gTC * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gTC * 1.5);
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
#endif
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
    k = ordb(k);
    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gTC * 0.5);
    if (k == 17) return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gTC * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gTC * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gTC * 0.3), cos(gTC * 0.23)));
    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.3));
    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.4));
    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.4));
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gTC * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gTC), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
#ifdef SPEC_B0
vec2 stageBk_0(vec2 uv, float v)
{
    int k = SPEC_B0;
    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gTC * 0.5);
    if (k == 17) return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gTC * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gTC * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gTC * 0.3), cos(gTC * 0.23)));
    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.3));
    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.4));
    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.4));
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gTC * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gTC), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
vec2 stageBk_1(vec2 uv, float v)
{
    int k = SPEC_B1;
    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gTC * 0.5);
    if (k == 17) return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gTC * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gTC * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gTC * 0.3), cos(gTC * 0.23)));
    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.3));
    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.4));
    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.4));
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gTC * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gTC), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
#endif
// Stage C: a second global map.
vec2 stageCk(vec2 uv, int k, float v)
{
    k = ordc(k);
    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gTC * 0.4), cos(gTC * 0.31)));
    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gTC * 0.5);
    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gTC * 0.3 + v * 6.28));
    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gTC * 0.2));
    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);
    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gTC * 0.3));
    if (k == 10) return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gTC * 0.3))   /* 0.5: the square-root fold */;
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
#ifdef SPEC_C0
vec2 stageCk_0(vec2 uv, float v)
{
    int k = SPEC_C0;
    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gTC * 0.4), cos(gTC * 0.31)));
    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gTC * 0.5);
    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gTC * 0.3 + v * 6.28));
    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gTC * 0.2));
    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);
    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gTC * 0.3));
    if (k == 10) return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gTC * 0.3))   /* 0.5: the square-root fold */;
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
vec2 stageCk_1(vec2 uv, float v)
{
    int k = SPEC_C1;
    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gTC * 0.4), cos(gTC * 0.31)));
    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gTC * 0.5);
    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gTC * 0.3 + v * 6.28));
    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gTC * 0.2));
    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);
    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gTC * 0.3));
    if (k == 10) return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gTC * 0.3))   /* 0.5: the square-root fold */;
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
#endif
// Stage D: a warp.
vec2 stageDk(vec2 uv, int k, float v)
{
    k = ordd(k);
    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gTC * 2.0);
    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gTC * 2.0);
    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gTC * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gTC * 3.0);
    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gTC * 2.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gTC * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gTC);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gTC);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gTC);
    if (k == 8) return tBend(uv, 1.8 * sin(gTC * 0.4 + v * 6.28));
    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gTC * 2.0);
    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gTC);
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gTC);
    return tRot(uv, vec2(0.5), 0.5 * sin(gTC * 0.3 + v * 6.28));
}
#ifdef SPEC_D0
vec2 stageDk_0(vec2 uv, float v)
{
    int k = SPEC_D0;
    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gTC * 2.0);
    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gTC * 2.0);
    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gTC * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gTC * 3.0);
    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gTC * 2.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gTC * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gTC);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gTC);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gTC);
    if (k == 8) return tBend(uv, 1.8 * sin(gTC * 0.4 + v * 6.28));
    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gTC * 2.0);
    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gTC);
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gTC);
    return tRot(uv, vec2(0.5), 0.5 * sin(gTC * 0.3 + v * 6.28));
}
vec2 stageDk_1(vec2 uv, float v)
{
    int k = SPEC_D1;
    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gTC * 2.0);
    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gTC * 2.0);
    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gTC * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gTC * 3.0);
    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gTC * 2.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gTC * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gTC);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gTC);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gTC);
    if (k == 8) return tBend(uv, 1.8 * sin(gTC * 0.4 + v * 6.28));
    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gTC * 2.0);
    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gTC);
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gTC);
    return tRot(uv, vec2(0.5), 0.5 * sin(gTC * 0.3 + v * 6.28));
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
    int k0 = pickStage(chainBP, 20); float v0 = subVar(chainBP, 20);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(2)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkB.z);
            ka = pickStage(walkB.x, 20); va = subVar(walkB.x, 20);
            kb = pickStage(walkB.y, 20); vb = subVar(walkB.y, 20);
        } else {
            float kf = walkPos(2), c = floor(kf);
            walkPick(c, k0, v0, 20, 2.9, ka, va);
            walkPick(c + 1.0, k0, v0, 20, 2.9, kb, vb);
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
int ordsp(int i) { if (i == 0) return 0; if (i == 1) return 3; if (i == 2) return 15; if (i == 3) return 6; if (i == 4) return 19; if (i == 5) return 7; if (i == 6) return 9; if (i == 7) return 17; if (i == 8) return 14; if (i == 9) return 4; if (i == 10) return 16; if (i == 11) return 10; if (i == 12) return 12; if (i == 13) return 2; if (i == 14) return 11; if (i == 15) return 18; if (i == 16) return 5; if (i == 17) return 13; if (i == 18) return 8; return 1; }   // energy order, 20 classes
int ordco(int i) { if (i == 0) return 0; if (i == 1) return 4; if (i == 2) return 8; if (i == 3) return 3; if (i == 4) return 20; if (i == 5) return 15; if (i == 6) return 18; if (i == 7) return 9; if (i == 8) return 6; if (i == 9) return 11; if (i == 10) return 10; if (i == 11) return 16; if (i == 12) return 12; if (i == 13) return 1; if (i == 14) return 19; if (i == 15) return 14; if (i == 16) return 7; if (i == 17) return 13; if (i == 18) return 2; if (i == 19) return 21; if (i == 20) return 5; return 17; }   // energy order, 22 classes
int ordbo(int i) { if (i == 0) return 1; if (i == 1) return 21; if (i == 2) return 9; if (i == 3) return 7; if (i == 4) return 17; if (i == 5) return 18; if (i == 6) return 10; if (i == 7) return 2; if (i == 8) return 11; if (i == 9) return 19; if (i == 10) return 3; if (i == 11) return 5; if (i == 12) return 6; if (i == 13) return 12; if (i == 14) return 13; if (i == 15) return 0; if (i == 16) return 16; if (i == 17) return 8; if (i == 18) return 14; if (i == 19) return 15; if (i == 20) return 4; return 20; }   // energy order, 22 classes
// The app walks the structure too (EffectShader::stepChainWalk): (shown, target, fade).
uniform vec3 walkSpace, walkCore, walkBody;

// One world: a space, a fold core and a body, each a knob value on its energy scale.
float fieldK(vec3 p, float xs, float xc, float xb, int world)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 20)); float vs = subVar(xs, 20);
    int kc = ordco(pickStage(xc, 22)); float vc = subVar(xc, 22);
    int kb = ordbo(pickStage(xb, 22)); float vb = subVar(xb, 22);
#ifdef SPEC_SP0
    // the app's specialised variant: world 0 / 1 are constants (each call site folds to its branches)
    ks = ordsp(world == 0 ? SPEC_SP0 : SPEC_SP1); kc = ordco(world == 0 ? SPEC_CO0 : SPEC_CO1); kb = ordbo(world == 0 ? SPEC_BO0 : SPEC_BO1);
#endif
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
    else if (ks == 8) {                                     // inverted lattice: lattice, inversion per cell, lattice again
        q = fRepeat(p, vec3(1.7 + 0.3 * vs)); q = fInvert(q + vec3(0.3, 0.2, 0.0), 1.4);   // in every cell a sphere inversion
        q = fRepeat(fScale(q, 1.6, vec3(0.0)), vec3(1.3));                                   // ... of a lattice: a bubble world per cell
    }
    else if (ks == 9) q = fRepeat(fScale(fLogSphere(p, gCam + vec3(0.0, 0.0, 6.0), 2.5 + vs, gT * 0.05), 2.5, vec3(0.0)), vec3(1.4));   // 3D Droste shells
    else if (ks == 12) q = fRepeat(fHalfSpace(p, 1.0), vec3(1.3));                  // hyperbolic half-space
    else if (ks == 13) { q = fPolarZ(fTwistZ(p, 0.6 + 0.3 * vs), 2.0); q.x -= 1.4; q = zRepeat(q, 0.6); }   // double helix
    else if (ks == 14) q = fRepeat(fLogCyl(p, 2.5 + vs), vec3(1.2));                  // log-cylindrical Droste
    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice
    else if (ks == 16) { q = fRepeat(p, vec3(1.5)); float kb2 = 0.35 + 0.25 * vs; q.xy = rot2(kb2 * q.x) * q.xy; gDR *= 1.0 + 1.5 * kb2; }   // bent cells
    else if (ks == 17) { vec3 cc = gCam + vec3(0.0, 0.0, 6.0); float lr = log(max(length(p - cc), 1e-3));
        q = fLogSphere(p, cc, 2.5 + vs, gT * 0.05); q.xy = rot2(0.9 * lr) * q.xy; gDR *= 1.9; q = fRepeat(fScale(q, 2.5, vec3(0.0)), vec3(1.4)); }   // twisted 3D Droste
    else if (ks == 18) { float ws = 0.3 + 0.2 * vs; q = fRepeat(fWarp(p, ws, gT * 0.05), vec3(1.4)); }   // noise-warped lattice
    else if (ks == 19) q = fRollZ(p, 3.2 + vs, 1.2);                                   // the world rolled round the flight axis
    else if (ks == 10) q = fTorusWrap(p, 7.0 + 3.0 * vs, 1.3);                       // the world wrapped round a great ring
    else if (ks == 11) q = fRepeat(fGyroidWarp(p, 0.25 + 0.15 * vs, gT * 0.05), vec3(1.4));   // gyroid-warped lattice
    else if (ks == 7) q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice        // hexagonal lattice: a honeycomb of pillars
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
    else if (kc == 9) {
        // hyperbolic honeycomb: the cell mapped into the Poincare ball, folded
        q = fHyperBall(q * 0.8, 0.85 + 0.1 * vc) / 0.8;
        bs = 0.45;
    }
    else if (kc == 10) {
        // 'amazing surface' (Kali): box folds in xy only, sphere fold, turn, scale --
        // layered, sheet-like fractal terraces
        for (int i = 0; i < 3; ++i) {
            q.xy = clamp(q.xy, -1.0, 1.0) * 2.0 - q.xy;
            float r2 = max(dot(q, q), 1e-4);
            float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
            q *= k; gDR *= k;
            q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 + 0.4 * vc + 0.2 * sin(gRot));
            q = fScale(q, 1.25, vec3(0.0));
        }
        bs = 3.0;   /* spot check: 4 rounds x 1.5 turned to noise; bodies must be large after the folds */
    }
    else if (kc == 11) {                                    // pseudo-Kleinian (Knighty's constants)
        const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
        for (int i = 0; i < 5; ++i) {
            q = 2.0 * clamp(q, -CS, CS) - q;
            float k = max((1.0 + 0.15 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.6;
    } else if (kc == 12) {                                  // kaliset: abs(p)/|p|^2 - c
        for (int i = 0; i < 4; ++i) {
            float r2 = max(dot(q, q), 0.08);
            q = abs(q) / r2 - vec3(0.5 + 0.3 * vc, 0.4, 0.6); gDR /= r2;
        }
        bs = 0.9;
    } else if (kc == 13) {                                  // dodecahedral KIFS
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(0.0, 0.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(0.0, 0.53, 0.85)); }
        bs = 1.2;
    } else if (kc == 14) {                                  // Sierpinski octahedron
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(1.0, 0.0, 0.0)); }
        bs = 1.8;
    } else if (kc == 15) {                                  // Apollonian sphere packing
        for (int i = 0; i < 3; ++i) {
            q = abs(fract(q * 0.25 + 0.25) * 4.0 - 2.0) - 1.0;   // mirrored repeat (continuous)
            float k = (1.1 + 0.2 * vc) / max(dot(q, q), 1e-3);
            q *= k; gDR *= k;
        }
        bs = 1.6;
    }
    else if (kc == 16) {                                    // Mandelbulb (power 8): its own distance estimate
        vec3 z = q * 1.3, c0 = z; float dr = 1.0, r = length(z);
        for (int i = 0; i < 3; ++i) {
            r = length(z); if (r > 2.0) break;
            float th0 = acos(clamp(z.z / max(r, 1e-4), -1.0, 1.0)) * 8.0 + gRot * 0.3, ph0 = atan(z.y, z.x) * 8.0;
            dr = pow(r, 7.0) * 8.0 * dr + 1.0;
            z = pow(r, 8.0) * vec3(sin(th0) * cos(ph0), sin(th0) * sin(ph0), cos(th0)) + c0;
        }
        r = length(z);
        gP = c0;
        return 0.5 * log(max(r, 1e-4)) * r / dr / 1.3 / gDR * 0.8;
    } else if (kc == 17) {                                  // cross-Menger: Menger folds, scale 2.4 about the arm
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fScale(q, 2.4, vec3(1.4, 1.4, 0.0)); if (q.z < -0.7) q.z += 1.4; }
        bs = 2.2;
    } else if (kc == 18) {                                  // Mandalay box: octahedral fold, box fold, sphere fold
        for (int i = 0; i < 2; ++i) { q = fOcta(q); q = fBox(q, 0.8); q = fSphere(q, 0.4, 1.0); q = fScale(q, 1.6, vec3(0.4, 0.2, 0.1) * (1.0 + vc)); }
        bs = 2.4;   /* spot check: 3 rounds turned to dust */
    } else if (kc == 19) {                                  // mixed Sierpinski: tetra and octa folds alternating
        for (int i = 0; i < 4; ++i) { if (i == 1 || i == 3) q = fOcta(q); else q = fTetra(q); q = fScale(q, 1.8, vec3(0.8 + 0.3 * vc)); }
        bs = 1.6;
    } else if (kc == 20) {                                  // spherical KIFS: abs, sphere fold, turn, scale 2
        for (int i = 0; i < 3; ++i) { q = abs(q); q = fSphere(q, 0.4, 0.9); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.3 * vc); q = fScale(q, 2.0, vec3(0.9)); }
        bs = 1.3;
    } else if (kc == 21) {                                  // twisted octahedral KIFS: the turn grows per round
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.2, 1.0, 0.5), gRot * 0.4 + 0.35 * float(i + 1) + vc); q = fScale(q, 1.6, vec3(0.45, 0.22, 0.08)); }
        bs = 2.6;   /* spot check: the bodies had been pushed out of the cells */
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
    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);
    else if (kb == 9) d = sdSuperquad(q, 0.5 * bs * th, 2.5 + 6.0 * vb);                     // superquadric
    else if (kb == 10) d = max(abs(length(q) - 0.5 * bs * th) - 0.05 * bs, -sdOcta3(q, 0.75 * bs));   // hollow sphere
    else if (kb == 11) { vec3 w = q; w.x -= clamp(w.x, -0.25 * bs, 0.25 * bs); d = sdTorus3(w.xzy, 0.3 * bs, 0.07 * bs * th); }   // chain link
    else if (kb == 12) d = sdNeovius(q * (3.0 / bs), 0.4 + 0.8 * gSpread) * bs / 3.0;          // Neovius surface
    else if (kb == 13) d = sdLidinoid(q * (3.0 / bs), 0.05 + 0.05 * gSpread) * bs / 3.0;       // Lidinoid                                  // octahedron
    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice
    else if (kb == 14) d = min(sdTetra3(q, 0.4 * bs * th), sdTetra3(-q, 0.4 * bs * th));   // stellated octahedron
    else if (kb == 15) d = max(max(length(q.xy), length(q.yz)), length(q.zx)) - 0.4 * bs * th;   // Steinmetz tricylinder
    else if (kb == 16) { vec3 w = q; w.xz = rot2(q.y * 2.5) * w.xz; d = sdBox3(w, vec3(0.16, 0.6, 0.16) * bs * th) * 0.6; }   // twisted pillar
    else if (kb == 17) d = (max(max(abs(q.x) + abs(q.y), abs(q.y) + abs(q.z)), abs(q.z) + abs(q.x)) - 0.6 * bs * th) * 0.7071;   // rhombic dodecahedron
    else if (kb == 18) d = sdIcosa3(q, 0.45 * bs * th);                                  // icosahedron
    else if (kb == 19) { float R = 0.38 * bs, r0 = 0.07 * bs * th; vec3 a = q + vec3(0.2 * bs, 0.0, 0.0), b = q - vec3(0.2 * bs, 0.0, 0.0);
        d = min(length(vec2(length(a.xy) - R, a.z)) - r0, length(vec2(length(b.xz) - R, b.y)) - r0); }   // linked rings
    else if (kb == 20) { float rho = length(q.xy), Rr = 0.45 * bs + 0.06 * bs * smoothstep(-0.3, 0.3, sin(12.0 * atan(q.y, q.x)));
        d = max(max(rho - Rr, 0.2 * bs - rho), abs(q.z) - 0.08 * bs * th) * 0.7; }   // gear
    else if (kb == 21) { vec3 w = q; w.x -= clamp(w.x, -0.3 * bs, 0.3 * bs); d = length(w) - 0.15 * bs * th; }   // pill
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
#ifdef SPEC_SP0
float fieldK_0(vec3 p, float xs, float xc, float xb, int world)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 20)); float vs = subVar(xs, 20);
    int kc = ordco(pickStage(xc, 22)); float vc = subVar(xc, 22);
    int kb = ordbo(pickStage(xb, 22)); float vb = subVar(xb, 22);
#ifdef SPEC_SP0
    // the app's specialised variant: world 0 / 1 are constants (each call site folds to its branches)
    ks = SPEC_SP0; kc = SPEC_CO0; kb = SPEC_BO0;
#endif
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
    else if (ks == 8) {                                     // inverted lattice: lattice, inversion per cell, lattice again
        q = fRepeat(p, vec3(1.7 + 0.3 * vs)); q = fInvert(q + vec3(0.3, 0.2, 0.0), 1.4);   // in every cell a sphere inversion
        q = fRepeat(fScale(q, 1.6, vec3(0.0)), vec3(1.3));                                   // ... of a lattice: a bubble world per cell
    }
    else if (ks == 9) q = fRepeat(fScale(fLogSphere(p, gCam + vec3(0.0, 0.0, 6.0), 2.5 + vs, gT * 0.05), 2.5, vec3(0.0)), vec3(1.4));   // 3D Droste shells
    else if (ks == 12) q = fRepeat(fHalfSpace(p, 1.0), vec3(1.3));                  // hyperbolic half-space
    else if (ks == 13) { q = fPolarZ(fTwistZ(p, 0.6 + 0.3 * vs), 2.0); q.x -= 1.4; q = zRepeat(q, 0.6); }   // double helix
    else if (ks == 14) q = fRepeat(fLogCyl(p, 2.5 + vs), vec3(1.2));                  // log-cylindrical Droste
    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice
    else if (ks == 16) { q = fRepeat(p, vec3(1.5)); float kb2 = 0.35 + 0.25 * vs; q.xy = rot2(kb2 * q.x) * q.xy; gDR *= 1.0 + 1.5 * kb2; }   // bent cells
    else if (ks == 17) { vec3 cc = gCam + vec3(0.0, 0.0, 6.0); float lr = log(max(length(p - cc), 1e-3));
        q = fLogSphere(p, cc, 2.5 + vs, gT * 0.05); q.xy = rot2(0.9 * lr) * q.xy; gDR *= 1.9; q = fRepeat(fScale(q, 2.5, vec3(0.0)), vec3(1.4)); }   // twisted 3D Droste
    else if (ks == 18) { float ws = 0.3 + 0.2 * vs; q = fRepeat(fWarp(p, ws, gT * 0.05), vec3(1.4)); }   // noise-warped lattice
    else if (ks == 19) q = fRollZ(p, 3.2 + vs, 1.2);                                   // the world rolled round the flight axis
    else if (ks == 10) q = fTorusWrap(p, 7.0 + 3.0 * vs, 1.3);                       // the world wrapped round a great ring
    else if (ks == 11) q = fRepeat(fGyroidWarp(p, 0.25 + 0.15 * vs, gT * 0.05), vec3(1.4));   // gyroid-warped lattice
    else if (ks == 7) q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice        // hexagonal lattice: a honeycomb of pillars
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
    else if (kc == 9) {
        // hyperbolic honeycomb: the cell mapped into the Poincare ball, folded
        q = fHyperBall(q * 0.8, 0.85 + 0.1 * vc) / 0.8;
        bs = 0.45;
    }
    else if (kc == 10) {
        // 'amazing surface' (Kali): box folds in xy only, sphere fold, turn, scale --
        // layered, sheet-like fractal terraces
        for (int i = 0; i < 3; ++i) {
            q.xy = clamp(q.xy, -1.0, 1.0) * 2.0 - q.xy;
            float r2 = max(dot(q, q), 1e-4);
            float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
            q *= k; gDR *= k;
            q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 + 0.4 * vc + 0.2 * sin(gRot));
            q = fScale(q, 1.25, vec3(0.0));
        }
        bs = 3.0;   /* spot check: 4 rounds x 1.5 turned to noise; bodies must be large after the folds */
    }
    else if (kc == 11) {                                    // pseudo-Kleinian (Knighty's constants)
        const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
        for (int i = 0; i < 5; ++i) {
            q = 2.0 * clamp(q, -CS, CS) - q;
            float k = max((1.0 + 0.15 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.6;
    } else if (kc == 12) {                                  // kaliset: abs(p)/|p|^2 - c
        for (int i = 0; i < 4; ++i) {
            float r2 = max(dot(q, q), 0.08);
            q = abs(q) / r2 - vec3(0.5 + 0.3 * vc, 0.4, 0.6); gDR /= r2;
        }
        bs = 0.9;
    } else if (kc == 13) {                                  // dodecahedral KIFS
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(0.0, 0.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(0.0, 0.53, 0.85)); }
        bs = 1.2;
    } else if (kc == 14) {                                  // Sierpinski octahedron
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(1.0, 0.0, 0.0)); }
        bs = 1.8;
    } else if (kc == 15) {                                  // Apollonian sphere packing
        for (int i = 0; i < 3; ++i) {
            q = abs(fract(q * 0.25 + 0.25) * 4.0 - 2.0) - 1.0;   // mirrored repeat (continuous)
            float k = (1.1 + 0.2 * vc) / max(dot(q, q), 1e-3);
            q *= k; gDR *= k;
        }
        bs = 1.6;
    }
    else if (kc == 16) {                                    // Mandelbulb (power 8): its own distance estimate
        vec3 z = q * 1.3, c0 = z; float dr = 1.0, r = length(z);
        for (int i = 0; i < 3; ++i) {
            r = length(z); if (r > 2.0) break;
            float th0 = acos(clamp(z.z / max(r, 1e-4), -1.0, 1.0)) * 8.0 + gRot * 0.3, ph0 = atan(z.y, z.x) * 8.0;
            dr = pow(r, 7.0) * 8.0 * dr + 1.0;
            z = pow(r, 8.0) * vec3(sin(th0) * cos(ph0), sin(th0) * sin(ph0), cos(th0)) + c0;
        }
        r = length(z);
        gP = c0;
        return 0.5 * log(max(r, 1e-4)) * r / dr / 1.3 / gDR * 0.8;
    } else if (kc == 17) {                                  // cross-Menger: Menger folds, scale 2.4 about the arm
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fScale(q, 2.4, vec3(1.4, 1.4, 0.0)); if (q.z < -0.7) q.z += 1.4; }
        bs = 2.2;
    } else if (kc == 18) {                                  // Mandalay box: octahedral fold, box fold, sphere fold
        for (int i = 0; i < 2; ++i) { q = fOcta(q); q = fBox(q, 0.8); q = fSphere(q, 0.4, 1.0); q = fScale(q, 1.6, vec3(0.4, 0.2, 0.1) * (1.0 + vc)); }
        bs = 2.4;   /* spot check: 3 rounds turned to dust */
    } else if (kc == 19) {                                  // mixed Sierpinski: tetra and octa folds alternating
        for (int i = 0; i < 4; ++i) { if (i == 1 || i == 3) q = fOcta(q); else q = fTetra(q); q = fScale(q, 1.8, vec3(0.8 + 0.3 * vc)); }
        bs = 1.6;
    } else if (kc == 20) {                                  // spherical KIFS: abs, sphere fold, turn, scale 2
        for (int i = 0; i < 3; ++i) { q = abs(q); q = fSphere(q, 0.4, 0.9); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.3 * vc); q = fScale(q, 2.0, vec3(0.9)); }
        bs = 1.3;
    } else if (kc == 21) {                                  // twisted octahedral KIFS: the turn grows per round
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.2, 1.0, 0.5), gRot * 0.4 + 0.35 * float(i + 1) + vc); q = fScale(q, 1.6, vec3(0.45, 0.22, 0.08)); }
        bs = 2.6;   /* spot check: the bodies had been pushed out of the cells */
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
    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);
    else if (kb == 9) d = sdSuperquad(q, 0.5 * bs * th, 2.5 + 6.0 * vb);                     // superquadric
    else if (kb == 10) d = max(abs(length(q) - 0.5 * bs * th) - 0.05 * bs, -sdOcta3(q, 0.75 * bs));   // hollow sphere
    else if (kb == 11) { vec3 w = q; w.x -= clamp(w.x, -0.25 * bs, 0.25 * bs); d = sdTorus3(w.xzy, 0.3 * bs, 0.07 * bs * th); }   // chain link
    else if (kb == 12) d = sdNeovius(q * (3.0 / bs), 0.4 + 0.8 * gSpread) * bs / 3.0;          // Neovius surface
    else if (kb == 13) d = sdLidinoid(q * (3.0 / bs), 0.05 + 0.05 * gSpread) * bs / 3.0;       // Lidinoid                                  // octahedron
    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice
    else if (kb == 14) d = min(sdTetra3(q, 0.4 * bs * th), sdTetra3(-q, 0.4 * bs * th));   // stellated octahedron
    else if (kb == 15) d = max(max(length(q.xy), length(q.yz)), length(q.zx)) - 0.4 * bs * th;   // Steinmetz tricylinder
    else if (kb == 16) { vec3 w = q; w.xz = rot2(q.y * 2.5) * w.xz; d = sdBox3(w, vec3(0.16, 0.6, 0.16) * bs * th) * 0.6; }   // twisted pillar
    else if (kb == 17) d = (max(max(abs(q.x) + abs(q.y), abs(q.y) + abs(q.z)), abs(q.z) + abs(q.x)) - 0.6 * bs * th) * 0.7071;   // rhombic dodecahedron
    else if (kb == 18) d = sdIcosa3(q, 0.45 * bs * th);                                  // icosahedron
    else if (kb == 19) { float R = 0.38 * bs, r0 = 0.07 * bs * th; vec3 a = q + vec3(0.2 * bs, 0.0, 0.0), b = q - vec3(0.2 * bs, 0.0, 0.0);
        d = min(length(vec2(length(a.xy) - R, a.z)) - r0, length(vec2(length(b.xz) - R, b.y)) - r0); }   // linked rings
    else if (kb == 20) { float rho = length(q.xy), Rr = 0.45 * bs + 0.06 * bs * smoothstep(-0.3, 0.3, sin(12.0 * atan(q.y, q.x)));
        d = max(max(rho - Rr, 0.2 * bs - rho), abs(q.z) - 0.08 * bs * th) * 0.7; }   // gear
    else if (kb == 21) { vec3 w = q; w.x -= clamp(w.x, -0.3 * bs, 0.3 * bs); d = length(w) - 0.15 * bs * th; }   // pill
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
float fieldK_1(vec3 p, float xs, float xc, float xb, int world)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 20)); float vs = subVar(xs, 20);
    int kc = ordco(pickStage(xc, 22)); float vc = subVar(xc, 22);
    int kb = ordbo(pickStage(xb, 22)); float vb = subVar(xb, 22);
#ifdef SPEC_SP0
    // the app's specialised variant: world 0 / 1 are constants (each call site folds to its branches)
    ks = SPEC_SP1; kc = SPEC_CO1; kb = SPEC_BO1;
#endif
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
    else if (ks == 8) {                                     // inverted lattice: lattice, inversion per cell, lattice again
        q = fRepeat(p, vec3(1.7 + 0.3 * vs)); q = fInvert(q + vec3(0.3, 0.2, 0.0), 1.4);   // in every cell a sphere inversion
        q = fRepeat(fScale(q, 1.6, vec3(0.0)), vec3(1.3));                                   // ... of a lattice: a bubble world per cell
    }
    else if (ks == 9) q = fRepeat(fScale(fLogSphere(p, gCam + vec3(0.0, 0.0, 6.0), 2.5 + vs, gT * 0.05), 2.5, vec3(0.0)), vec3(1.4));   // 3D Droste shells
    else if (ks == 12) q = fRepeat(fHalfSpace(p, 1.0), vec3(1.3));                  // hyperbolic half-space
    else if (ks == 13) { q = fPolarZ(fTwistZ(p, 0.6 + 0.3 * vs), 2.0); q.x -= 1.4; q = zRepeat(q, 0.6); }   // double helix
    else if (ks == 14) q = fRepeat(fLogCyl(p, 2.5 + vs), vec3(1.2));                  // log-cylindrical Droste
    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice
    else if (ks == 16) { q = fRepeat(p, vec3(1.5)); float kb2 = 0.35 + 0.25 * vs; q.xy = rot2(kb2 * q.x) * q.xy; gDR *= 1.0 + 1.5 * kb2; }   // bent cells
    else if (ks == 17) { vec3 cc = gCam + vec3(0.0, 0.0, 6.0); float lr = log(max(length(p - cc), 1e-3));
        q = fLogSphere(p, cc, 2.5 + vs, gT * 0.05); q.xy = rot2(0.9 * lr) * q.xy; gDR *= 1.9; q = fRepeat(fScale(q, 2.5, vec3(0.0)), vec3(1.4)); }   // twisted 3D Droste
    else if (ks == 18) { float ws = 0.3 + 0.2 * vs; q = fRepeat(fWarp(p, ws, gT * 0.05), vec3(1.4)); }   // noise-warped lattice
    else if (ks == 19) q = fRollZ(p, 3.2 + vs, 1.2);                                   // the world rolled round the flight axis
    else if (ks == 10) q = fTorusWrap(p, 7.0 + 3.0 * vs, 1.3);                       // the world wrapped round a great ring
    else if (ks == 11) q = fRepeat(fGyroidWarp(p, 0.25 + 0.15 * vs, gT * 0.05), vec3(1.4));   // gyroid-warped lattice
    else if (ks == 7) q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice        // hexagonal lattice: a honeycomb of pillars
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
    else if (kc == 9) {
        // hyperbolic honeycomb: the cell mapped into the Poincare ball, folded
        q = fHyperBall(q * 0.8, 0.85 + 0.1 * vc) / 0.8;
        bs = 0.45;
    }
    else if (kc == 10) {
        // 'amazing surface' (Kali): box folds in xy only, sphere fold, turn, scale --
        // layered, sheet-like fractal terraces
        for (int i = 0; i < 3; ++i) {
            q.xy = clamp(q.xy, -1.0, 1.0) * 2.0 - q.xy;
            float r2 = max(dot(q, q), 1e-4);
            float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
            q *= k; gDR *= k;
            q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 + 0.4 * vc + 0.2 * sin(gRot));
            q = fScale(q, 1.25, vec3(0.0));
        }
        bs = 3.0;   /* spot check: 4 rounds x 1.5 turned to noise; bodies must be large after the folds */
    }
    else if (kc == 11) {                                    // pseudo-Kleinian (Knighty's constants)
        const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
        for (int i = 0; i < 5; ++i) {
            q = 2.0 * clamp(q, -CS, CS) - q;
            float k = max((1.0 + 0.15 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.6;
    } else if (kc == 12) {                                  // kaliset: abs(p)/|p|^2 - c
        for (int i = 0; i < 4; ++i) {
            float r2 = max(dot(q, q), 0.08);
            q = abs(q) / r2 - vec3(0.5 + 0.3 * vc, 0.4, 0.6); gDR /= r2;
        }
        bs = 0.9;
    } else if (kc == 13) {                                  // dodecahedral KIFS
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(0.0, 0.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(0.0, 0.53, 0.85)); }
        bs = 1.2;
    } else if (kc == 14) {                                  // Sierpinski octahedron
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(1.0, 0.0, 0.0)); }
        bs = 1.8;
    } else if (kc == 15) {                                  // Apollonian sphere packing
        for (int i = 0; i < 3; ++i) {
            q = abs(fract(q * 0.25 + 0.25) * 4.0 - 2.0) - 1.0;   // mirrored repeat (continuous)
            float k = (1.1 + 0.2 * vc) / max(dot(q, q), 1e-3);
            q *= k; gDR *= k;
        }
        bs = 1.6;
    }
    else if (kc == 16) {                                    // Mandelbulb (power 8): its own distance estimate
        vec3 z = q * 1.3, c0 = z; float dr = 1.0, r = length(z);
        for (int i = 0; i < 3; ++i) {
            r = length(z); if (r > 2.0) break;
            float th0 = acos(clamp(z.z / max(r, 1e-4), -1.0, 1.0)) * 8.0 + gRot * 0.3, ph0 = atan(z.y, z.x) * 8.0;
            dr = pow(r, 7.0) * 8.0 * dr + 1.0;
            z = pow(r, 8.0) * vec3(sin(th0) * cos(ph0), sin(th0) * sin(ph0), cos(th0)) + c0;
        }
        r = length(z);
        gP = c0;
        return 0.5 * log(max(r, 1e-4)) * r / dr / 1.3 / gDR * 0.8;
    } else if (kc == 17) {                                  // cross-Menger: Menger folds, scale 2.4 about the arm
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fScale(q, 2.4, vec3(1.4, 1.4, 0.0)); if (q.z < -0.7) q.z += 1.4; }
        bs = 2.2;
    } else if (kc == 18) {                                  // Mandalay box: octahedral fold, box fold, sphere fold
        for (int i = 0; i < 2; ++i) { q = fOcta(q); q = fBox(q, 0.8); q = fSphere(q, 0.4, 1.0); q = fScale(q, 1.6, vec3(0.4, 0.2, 0.1) * (1.0 + vc)); }
        bs = 2.4;   /* spot check: 3 rounds turned to dust */
    } else if (kc == 19) {                                  // mixed Sierpinski: tetra and octa folds alternating
        for (int i = 0; i < 4; ++i) { if (i == 1 || i == 3) q = fOcta(q); else q = fTetra(q); q = fScale(q, 1.8, vec3(0.8 + 0.3 * vc)); }
        bs = 1.6;
    } else if (kc == 20) {                                  // spherical KIFS: abs, sphere fold, turn, scale 2
        for (int i = 0; i < 3; ++i) { q = abs(q); q = fSphere(q, 0.4, 0.9); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.3 * vc); q = fScale(q, 2.0, vec3(0.9)); }
        bs = 1.3;
    } else if (kc == 21) {                                  // twisted octahedral KIFS: the turn grows per round
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.2, 1.0, 0.5), gRot * 0.4 + 0.35 * float(i + 1) + vc); q = fScale(q, 1.6, vec3(0.45, 0.22, 0.08)); }
        bs = 2.6;   /* spot check: the bodies had been pushed out of the cells */
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
    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);
    else if (kb == 9) d = sdSuperquad(q, 0.5 * bs * th, 2.5 + 6.0 * vb);                     // superquadric
    else if (kb == 10) d = max(abs(length(q) - 0.5 * bs * th) - 0.05 * bs, -sdOcta3(q, 0.75 * bs));   // hollow sphere
    else if (kb == 11) { vec3 w = q; w.x -= clamp(w.x, -0.25 * bs, 0.25 * bs); d = sdTorus3(w.xzy, 0.3 * bs, 0.07 * bs * th); }   // chain link
    else if (kb == 12) d = sdNeovius(q * (3.0 / bs), 0.4 + 0.8 * gSpread) * bs / 3.0;          // Neovius surface
    else if (kb == 13) d = sdLidinoid(q * (3.0 / bs), 0.05 + 0.05 * gSpread) * bs / 3.0;       // Lidinoid                                  // octahedron
    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice
    else if (kb == 14) d = min(sdTetra3(q, 0.4 * bs * th), sdTetra3(-q, 0.4 * bs * th));   // stellated octahedron
    else if (kb == 15) d = max(max(length(q.xy), length(q.yz)), length(q.zx)) - 0.4 * bs * th;   // Steinmetz tricylinder
    else if (kb == 16) { vec3 w = q; w.xz = rot2(q.y * 2.5) * w.xz; d = sdBox3(w, vec3(0.16, 0.6, 0.16) * bs * th) * 0.6; }   // twisted pillar
    else if (kb == 17) d = (max(max(abs(q.x) + abs(q.y), abs(q.y) + abs(q.z)), abs(q.z) + abs(q.x)) - 0.6 * bs * th) * 0.7071;   // rhombic dodecahedron
    else if (kb == 18) d = sdIcosa3(q, 0.45 * bs * th);                                  // icosahedron
    else if (kb == 19) { float R = 0.38 * bs, r0 = 0.07 * bs * th; vec3 a = q + vec3(0.2 * bs, 0.0, 0.0), b = q - vec3(0.2 * bs, 0.0, 0.0);
        d = min(length(vec2(length(a.xy) - R, a.z)) - r0, length(vec2(length(b.xz) - R, b.y)) - r0); }   // linked rings
    else if (kb == 20) { float rho = length(q.xy), Rr = 0.45 * bs + 0.06 * bs * smoothstep(-0.3, 0.3, sin(12.0 * atan(q.y, q.x)));
        d = max(max(rho - Rr, 0.2 * bs - rho), abs(q.z) - 0.08 * bs * th) * 0.7; }   // gear
    else if (kb == 21) { vec3 w = q; w.x -= clamp(w.x, -0.3 * bs, 0.3 * bs); d = length(w) - 0.15 * bs * th; }   // pill
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
#endif
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
#ifdef SPEC_SP0
    float d0 = fieldK_0(p, xs, xc, xb, 0);
#else
    float d0 = fieldK(p, xs, xc, xb, 0);
#endif
    if (f <= 0.0) return d0;
    vec3 p0 = gP;
#ifdef SPEC_SP0
    float d1 = fieldK_1(p, ys, yc, yb, 1);
#else
    float d1 = fieldK(p, ys, yc, yb, 1);
#endif
    gP = mix(p0, gP, f);
    return mix(d0, d1, f);
}
vec2 chain(vec2 uv)
{
    return runChain(uv);
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
    // One triplanar projection for both looks: the solid texture is the same
    // three planes with the depth along each normal as the chain's time (the
    // photo look has depth 0) -- three chain call sites instead of six.
    float sd = solidP >= 0.5 ? 1.0 : 0.0;
    // Planes with a small weight are skipped: the weights are shifted down so
    // they reach exactly zero (no seam), and most surface points then read one
    // or two planes instead of three (the chain has no derivatives, so the
    // branches are safe).
    vec3 w = max(pow(abs(n), vec3(4.0)) - 0.03, 0.0); w /= (w.x + w.y + w.z);
    vec3 c = vec3(0.0);
    if (w.x > 0.0) c += chainSlice(q.yz * 0.35 + 0.5, q.x * sd, lod, pal) * w.x;
    if (w.y > 0.0) c += chainSlice(q.zx * 0.35 + 0.5, q.y * sd, lod, pal) * w.y;
    if (w.z > 0.0) c += chainSlice(q.xy * 0.35 + 0.5, q.z * sd, lod, pal) * w.z;
    return c;
}


// Relief: the brightness of the colour chain as height -- the normal is tilted
// by its slope, sampled around the folded surface point (no extra evaluation
// of the field -- each would inline it once more), so the light follows the bumps.
float reliefH(vec3 fq, vec3 n, float lod)
{
    vec3 w = abs(n);
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
    mat3 cf = camFrame(camFlight(gT), ro);
    gCam = ro;
    gTube = 0.4 + 0.15 * swell;                             // the carved tube breathes with the slow swell
    vec3 rd = gazeDir(p, camP, sceneTime, cf, ro);
    float t = 0.05; float d = 1.0; bool hit = false; vec3 fp = vec3(0.0); float fdr = 1.0;
    for (int i = 0; i < 100; ++i) {
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0015 * t) { hit = true; fp = gP; fdr = gDR; break; }   // gP of the hit point: no extra evaluation
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
        float lod = clamp(log2(t * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);
        vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one
        if (reliefP > 0.3) {                                    // a knob: every pixel takes the same branch
            vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
            float e = 0.006 * max(t, 1.0), hl = lod + 1.5;
            // sampled in the folded space around fp (the fold stretches by fdr there)
            float ef = e * fdr, h0 = reliefH(fp, n, hl);
            vec3 g = t1 * (reliefH(fp + t1 * ef, n, hl) - h0) + t2 * (reliefH(fp + t2 * ef, n, hl) - h0);
            n = normalize(n - g / e * 0.05 * smoothstep(0.3, 1.0, reliefP));
        }
        vec3 tex = colour3(fp, nGeo, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));
        float tm = luma(tex);
        tex = max((tex - tm) * 1.5 + tm, 0.0) * 1.5;           // livelier colour, brighter
        vec3 L = normalize(vec3(0.5, 0.7, -0.4));
        float diff = max(dot(n, L), 0.0);
        float ao = 0.0;
        for (int k = 1; k <= 2; ++k) { float h = 0.06 * float(k); ao += (h - fieldD(q + n * h)) / h; }
        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0);
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

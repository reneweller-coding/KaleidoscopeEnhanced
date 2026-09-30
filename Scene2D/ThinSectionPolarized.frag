#version 330 core
out vec4 fragColor;
/**
 * @file ThinSectionPolarized.frag
 * @brief THIN SECTION POLARIZED: a rock thin section under the polarising
 * microscope, crossed polars -- a mosaic of mineral grains, each glowing in
 * its own vivid interference colour (the Michel-Levy chart: blues, magentas,
 * golds, greens), with twinned grains striped, and as the stage turns every
 * grain passes through its colours and blacks out at extinction, so the
 * whole mosaic flickers slowly through the spectrum.  The grain pattern is
 * the photograph's structure (its regions become grains); the round field
 * of view fills the frame.  Endless, mirrorable.
 *
 * Interference colour: a grain with retardation R under white light shows
 * the colour of the path difference R (approximated by a sum of cosines
 * over the visible spectrum); its brightness goes as sin^2(2*theta) with
 * the stage angle theta relative to the grain's optical axis.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the stage turns (integrated, jump-free)
 *   audioAdvance    -> the section slides slowly (integrated)
 *   audioSpread     -> grain size
 *   audioMode       -> retardation range: lower orders in minor, higher in major
 *   audioSwell      -> the lamp's brightness (slow)
 *   audioHigh       -> sparkle on grain boundaries (light)
 *
 * Knobs: grainP (grain size), orderP (retardation / colour order), twinP
 * (share of twinned grains), hueP.
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
uniform float audioMode;
uniform float audioSwell;
uniform float audioHigh;

uniform float grainP;
uniform float orderP;
uniform float twinP;
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

// Interference colour for a path difference R (in units of ~550 nm).
vec3 interference(float R)
{
    vec3 c = vec3(0.0);
    for (int i = 0; i < 6; ++i) {
        float lam = 0.72 + 0.1 * float(i);                  // 0.72 .. 1.22 (relative wavelengths)
        float I = pow(sin(3.14159 * R / lam), 2.0);
        // Rough CIE-like weights of each wavelength into RGB.
        vec3 w = (i < 2) ? vec3(0.1, 0.2, 1.0) : (i < 3) ? vec3(0.1, 0.9, 0.6) : (i < 4) ? vec3(0.5, 1.0, 0.1) : (i < 5) ? vec3(1.0, 0.6, 0.0) : vec3(1.0, 0.1, 0.05);
        c += I * w;
    }
    return c / 2.2;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float sc = (3.0 + 5.0 * clamp(grainP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * sc + vec2(0.02, 0.015) * sceneTime + vec2(0.2, 0.1) * audioAdvance;
    // Grains: Voronoi cells, their boundaries bent by the photo's structure.
    vec2 uvp = q / sc * 0.6 + 0.5;
    vec2 warp = (vec2(luma(imgLod(uvp, 4.0)), luma(imgLod(uvp + 0.3, 4.0))) - 0.5) * 1.2;
    vec2 wq = q + warp;
    vec2 gi = floor(wq), gf = fract(wq);
    float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j);
        vec2 c = o + 0.5 + 0.45 * (hash22(gi + o) - 0.5);
        float d = length(gf - c);
        if (d < f1) { f2 = f1; f1 = d; id = gi + o; } else if (d < f2) f2 = d;
    }
    // Each grain: an optical axis angle and a retardation (from the photo's
    // brightness at the grain, so the photo's structure sets the colours).
    float axis = hash21(id) * 3.14159;
    // grain-scale brightness (plus a little strain across the grain)
    float ph = luma(imgLod((id + 0.5 - warp) / sc * 0.6 + 0.5, 5.0)) + 0.06 * (luma(imgLod(uvp, 3.0)) - 0.5);
    float order = 0.6 + 1.6 * clamp(orderP, 0.0, 1.0) + 0.6 * clamp(audioMode, 0.0, 1.0);
    float R = (0.3 + order * (0.3 * hash21(id + 3.0) + 0.7 * ph)) + hueP * 0.05;
    // Twinning: stripes within some grains with the axis flipped.
    float twin = step(1.0 - 0.5 * clamp(twinP, 0.0, 1.0), hash21(id + 7.0));
    vec2 td = vec2(cos(axis + 0.7), sin(axis + 0.7));
    float stripe = smoothstep(0.45, 0.55, fract(dot(wq, td) * 4.0));
    axis += twin * stripe * 1.2;
    // Stage rotation.
    float theta = 0.08 * sceneTime + 0.5 * audioPhase;
    float ext = pow(sin(2.0 * (theta - axis)), 2.0);
    vec3 col = interference(R) * ext * (0.8 + 0.5 * swell) * 1.6;
    // Grain boundaries: thin dark lines with a faint bright relief.
    float bd = f2 - f1;
    float px = sc / resolution.y * 1.5;
    col *= smoothstep(0.0, 0.03 + px, bd);
    col += vec3(1.0) * smoothstep(0.02 + px, 0.0, abs(bd - 0.03)) * (0.05 + 0.3 * hi);
    // The round field of view, larger than the frame, vignetted.
    col *= 1.0 - 0.35 * dot(p, p);
    finish(col);
}

#version 330 core
out vec4 fragColor;
/**
 * @file WallpaperGroupCycle.frag
 * @brief WALLPAPER GROUP CYCLE: the photograph folded through the plane
 * symmetry groups -- a small cell of the texture is mirrored, rotated and
 * glide-reflected into an endless wallpaper, and the wallpaper wanders
 * slowly from one symmetry to the next (p4m, p6m, p3m1, p4g, pmm, cmm, p31m,
 * p6 ...), each change a soft cross-fade, while the window into the photo
 * drifts so the motif inside the cell keeps changing.  The mirror seams
 * glow faintly like the joints of a kaleidoscope.  Endless and mirrorable
 * by construction -- it IS a mirror pattern.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the cell turns (integrated, jump-free)
 *   audioAdvance    -> the window drifts through the photo (integrated)
 *   audioSwell      -> the cell size breathes (slow)
 *   audioRoughness  -> the mirrors warp like old glass
 *   audioHarmChange -> the seams flare on chord changes (light)
 *   audioMode       -> the seam colour warms in major
 *
 * Knobs: cellP (cell size), groupP (which groups the cycle favours),
 * speedP (how fast the groups change), hueP.
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
uniform float audioSwell;
uniform float audioRoughness;
uniform float audioHarmChange;
uniform float audioMode;
uniform float audioHigh;

uniform float cellP;
uniform float groupP;
uniform float speedP;
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

// Fold a point into the fundamental domain of a group; returns the folded
// point (0..1 cell coords) and writes the distance to the nearest mirror.
vec2 foldSquare(vec2 q, int g, out float seam)
{
    vec2 c = fract(q);
    vec2 id = floor(q);
    if (g == 0) {                       // pmm: mirrors on the cell edges
        c = abs(c - 0.5) * 2.0;
        seam = min(min(c.x, c.y), min(1.0 - c.x, 1.0 - c.y));
        return c;
    }
    if (g == 1) {                       // p4m: square with diagonals
        c = abs(c - 0.5) * 2.0;
        if (c.y > c.x) c = c.yx;
        seam = min(min(1.0 - c.x, c.y), abs(c.x - c.y) * 0.7071);
        return c;
    }
    if (g == 2) {                       // p4g: four-fold rotation plus mirrors off the centres
        vec2 d = c - 0.5;
        float par = mod(id.x + id.y, 2.0);
        if (par > 0.5) d = vec2(-d.y, d.x);
        d = abs(d);
        if (d.x + d.y > 0.5) d = vec2(0.5, 0.5) - d.yx;
        seam = min(abs(d.x + d.y - 0.5) * 0.7071, min(d.x, d.y));
        return d * 2.0;
    }
    // cmm: rhombic mirrors
    vec2 d = abs(c - 0.5);
    vec2 r = vec2(d.x + d.y, abs(d.x - d.y));
    seam = min(abs(r.x - 0.5), min(r.y, 0.5 - d.x)) * 0.7071;
    return r;
}

vec2 foldHex(vec2 q, int g, out float seam)
{
    // Hexagonal lattice: nearest hex centre, then fold by the 6 (or 3) mirrors.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5;
    vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float ang = atan(h.y, h.x);
    float r = length(h);
    float n = (g == 4) ? 6.0 : 3.0;
    float sec = 3.14159265 / n;
    float fa = mod(ang, 2.0 * sec);
    if (g != 6) fa = abs(fa - sec);     // p6m / p3m1 mirror; p6 only rotates
    vec2 f = vec2(cos(fa), sin(fa)) * r;
    seam = (g != 6) ? min(abs(sin(fa)) * r, 0.5 * 0.866 - dot(h, normalize(vec2(cos(floor(ang / (3.14159265 / 3.0)) * 1.0472 + 0.5236), sin(floor(ang / (3.14159265 / 3.0)) * 1.0472 + 0.5236))))) : 0.5 * 0.866 - r * 0.9;
    return f * 1.6 + 0.2;
}

vec3 wallpaper(vec2 p, int g, float cell, vec2 win, float rot, out float seam)
{
    vec2 q = rot2(rot) * p / cell;
    vec2 f = (g < 4) ? foldSquare(q, g, seam) : foldHex(q, g, seam);
    seam *= cell;
    // The folded cell samples a window of the photo.
    vec2 uv = win + (f - 0.5) * 0.35;
    return imgLod(uv, 0.5);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float px = 1.0 / resolution.y;

    float cell = (0.18 + 0.22 * clamp(cellP, 0.0, 1.0)) * (0.9 + 0.2 * swell);
    p += 0.01 * rough * vec2(sin(p.y * 25.0 + sceneTime * 0.4), sin(p.x * 25.0 - sceneTime * 0.3));
    float rot = 0.03 * sceneTime + 0.25 * audioPhase;
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.013 * sceneTime + audioAdvance * 0.2), cos(0.011 * sceneTime + audioAdvance * 0.17));

    // The cycle through the groups: a slow clock, cross-fading at each step.
    float clk = sceneTime * (0.02 + 0.05 * clamp(speedP, 0.0, 1.0)) + 7.0 * clamp(groupP, 0.0, 1.0);
    float k = floor(clk);
    float f = smoothstep(0.82, 1.0, fract(clk));
    int g0 = int(mod(k, 7.0)), g1 = int(mod(k + 1.0, 7.0));
    float s0, s1;
    vec3 c0 = wallpaper(p, g0, cell, win, rot, s0);
    vec3 c1 = (f > 0.0) ? wallpaper(p, g1, cell, win, rot, s1) : c0;
    if (f <= 0.0) s1 = s0;
    vec3 col = mix(c0, c1, f);
    float seam = mix(s0, s1, f);

    // Seams glow like the joints of a kaleidoscope.
    vec3 seamC = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.8, 0.5), clamp(audioMode, 0.0, 1.0));
    seamC = mix(seamC, imgPalette(0.2 + hueP * 0.159) * 1.4, 0.35);
    float glow = exp(-max(seam, 0.0) / (px * 2.5)) * (0.12 + 0.6 * clamp(audioHarmChange, 0.0, 1.0) + 0.15 * clamp(audioHigh, 0.0, 1.0));
    // Colour: the photo's own hue, or a wandering hue field where it is grey.
    col *= mix(vec3(1.0), glowColour(imgLod(win, 5.0), p * 1.5, hueP * 0.159) * 1.5, 0.4);
    col = col * 1.15 + seamC * glow;
    // A gentle vignette of depth toward the edges keeps the eye inside.
    col *= 0.85 + 0.15 * smoothstep(1.2, 0.2, length(p));
    finish(col);
}

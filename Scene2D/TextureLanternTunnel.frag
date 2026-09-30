#version 330 core
out vec4 fragColor;
/**
 * @file TextureLanternTunnel.frag
 * @brief TEXTURE LANTERN TUNNEL: flying through a tunnel whose wall is made of
 * glowing paper lanterns -- ring after ring of lanterns hung close together
 * line the bore, each lit from within, each showing a different piece of
 * the photograph on its paper, their warm light filling the tunnel and
 * reflecting on the ribs between them; far ahead the rings melt into a
 * golden glow.  An endless polar field like the Tunnel, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the rings slowly turn (integrated)
 *   audioSpread     -> throat depth
 *   audioMode       -> the lantern colour: amber in minor, rose-gold in major (slow blend)
 *   audioRoughness  -> the lanterns sway on their cords
 *   audioBass       -> the flames glow (light)
 *   audioKick       -> a ripple of brightness runs along the rings (light)
 *
 * Knobs: countP (lanterns per ring), photoP (how much the paper shows the photo),
 * gapP (spacing), hueP.
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
uniform float audioRoughness;
uniform float audioBass;
uniform float audioKick;

uniform float countP;
uniform float photoP;
uniform float gapP;
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

void main()
{
    vec2 p = screenP() * 3.0;
    float bass = clamp(audioBass, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.015 * sceneTime + 0.25 * audioPhase;
    float throat = 0.5 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / max(r, 1e-3);
    float u = z + 0.4 * sceneTime + 1.5 * audioAdvance;
    // Lantern grid on the wall: rings along u, lanterns around a.
    float nA = 2.0 * floor(5.0 + 5.0 * clamp(countP, 0.0, 1.0));    // even, so the seam hides
    float ringSp = 0.55 + 0.4 * clamp(gapP, 0.0, 1.0);
    vec2 g = vec2(a / 6.2831853 * nA, u / ringSp);
    vec2 gi = floor(g);
    float off = 0.5 * mod(gi.y, 2.0);                                // staggered rings
    g.x -= off; gi.x = floor(g.x);
    vec2 gf = fract(g) - 0.5;
    // Sway: each lantern swings slightly on its cord (stetig).
    gf.x += 0.08 * clamp(audioRoughness, 0.0, 1.0) * sin(sceneTime * 0.8 + hash21(gi) * 6.28);
    vec3 flameC = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.45, 0.35), clamp(audioMode, 0.0, 1.0));
    // Lantern body: rounded barrel.
    // Round lanterns (an ellipse bulging a little along the ring direction).
    float d = length(gf * vec2(1.0, 1.15)) - 0.36;           // stays inside its cell (no clipped rims)
    float fwd = fwidth(g.y) + fwidth(g.x) * 0.0;
    float aa = max(fwd, 0.01) * 1.5;
    float cov = smoothstep(aa, -aa, d);
    // The paper shows a piece of the photo (the id selects which piece).
    vec2 puv = vec2(mod(gi.x, nA) * 0.173, gi.y * 0.311) + gf * 0.35;
    vec3 paper = imgLod(puv, clamp(log2(max(fwd * 1024.0 * 0.35, 1.0)), 0.0, 8.0));
    vec3 tint = mix(flameC, glowColour(paper, vec2(cos(a), sin(a)) + gi.y * 0.1, hueP * 0.159), 0.25) * vec3(1.1, 0.88, 0.65);
    vec3 lit = tint * mix(1.0, 0.4 + 1.2 * luma(paper), clamp(photoP, 0.0, 1.0) * 0.8);
    float core = exp(-length(gf) * 6.0);
    // Paper ribs: horizontal lines on the lantern.
    float ribs = 0.8 + 0.2 * smoothstep(0.3, 0.0, abs(fract(gf.y * 6.0) - 0.5));
    float ripple = 1.0 + 0.8 * kick * exp(-pow(fract(u * 0.25 - sceneTime * 0.5) - 0.5, 2.0) * 30.0);
    vec3 lan = lit * (0.45 + 1.8 * core) * (0.75 + 0.6 * bass) * ripple * ribs;
    // Between the lanterns: dark wooden ribs catching their warm light.
    // The glow between lanterns needs the nearest lantern of the neighbouring
    // rows too (they are staggered), or the rows' seams show as rings.
    float dn = d;
    for (int k = -1; k <= 1; k += 2) {
        float ry = floor(u / ringSp) + float(k);
        float offk = 0.5 * mod(ry, 2.0);
        float gx = a / 6.2831853 * nA - offk;
        vec2 f2 = vec2(fract(gx) - 0.5, u / ringSp - ry - 0.5);
        dn = min(dn, length(f2 * vec2(1.0, 1.15)) - 0.36);
    }
    vec3 rib = vec3(0.03, 0.018, 0.012) + flameC * 0.18 * exp(-max(dn, 0.0) * 6.0) * (0.7 + 0.6 * bass);
    vec3 col = mix(rib, lan, cov);
    // Depth: far rings blur into golden haze; the far end glows.
    float far = smoothstep(2.0, 9.0, z);
    col = mix(col, flameC * 0.75, far);
    col += flameC * exp(-r * 2.0) * (0.3 + 0.6 * bass);
    col *= smoothstep(0.0, 0.25, r) * 0.5 + 0.5;
    finish(col);
}

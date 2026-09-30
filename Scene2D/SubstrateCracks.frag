#version 330 core
out vec4 fragColor;
/**
 * @file SubstrateCracks.frag
 * @brief SUBSTRATE CRACKS: in the manner of Jared Tarbell's "Substrate" --
 * straight lines grow across the plane like cracks, each starting from an
 * existing line at a right angle and running until it hits another,
 * carving the space into an architectural city map of rectangles and
 * slivers; soft watercolour sand trails along one side of each crack in
 * colours sampled from the photograph; the map slowly redraws itself
 * region by region.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the cracks grow and the map redraws (integrated, jump-free)
 *   audioSpread     -> crack density
 *   audioKick       -> the crack lines darken (light)
 *   audioMode       -> the paper: white in major, dark with light lines in minor (blend)
 *   audioRoughness  -> the angle of the cracks varies more
 *   audioSwell      -> the colour trails widen (slow)
 *
 * Knobs: scaleP (map scale), trailP (colour trail width), photoP (photo colours), hueP.
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
uniform float audioSpread;
uniform float audioKick;
uniform float audioMode;
uniform float audioRoughness;
uniform float audioSwell;

uniform float scaleP;
uniform float trailP;
uniform float photoP;
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
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Recursive axis-aligned (slightly tilted) subdivision gives the crack map:
    // each region is split by a crack at a random position, recursively.
    float S = 1.0 + 1.5 * clamp(scaleP, 0.0, 1.0);
    float tilt = 0.3 + 0.2 * rough * sin(0.01 * sceneTime);
    vec2 q = rot2(tilt) * p * S + vec2(0.01 * sceneTime, 0.0);
    vec2 lo = floor(q), hi = lo + 1.0;
    vec2 id = lo;
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    float depth = 4.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float dmin = 9.0; float side = 0.0; float trailD = 9.0; vec2 trailId = id;
    for (int k = 0; k < 7; ++k) {
        if (float(k) >= depth) break;
        float h = hash21(id + float(k) * 13.1);
        vec2 sz = hi - lo;
        bool vert = sz.x > sz.y ? h < 0.8 : h < 0.2;
        // Crack growth: each crack appears over time (continuous): its extent grows from its start.
        float birth = fract(T * 0.3 + hash21(id + 7.0 + float(k)));
        float s = 0.3 + 0.4 * hash21(id + float(k) * 3.7);
        if (vert) {
            float x = mix(lo.x, hi.x, s);
            float grown = smoothstep(0.0, 0.3, birth) * smoothstep(1.0, 0.9, birth);
            float yEnd = mix(lo.y, hi.y, grown);
            float d = abs(q.x - x) + max(q.y - yEnd, 0.0) * 10.0;
            if (d < dmin) { dmin = d; side = sign(q.x - x); }
            if (q.x < x) { hi.x = x; id = id * 2.0 + vec2(1.0, 0.0); trailD = min(trailD, x - q.x); }
            else { lo.x = x; id = id * 2.0 + vec2(2.0, 0.0); }
        } else {
            float y = mix(lo.y, hi.y, s);
            float grown = smoothstep(0.0, 0.3, birth) * smoothstep(1.0, 0.9, birth);
            float xEnd = mix(lo.x, hi.x, grown);
            float d = abs(q.y - y) + max(q.x - xEnd, 0.0) * 10.0;
            if (d < dmin) { dmin = d; side = sign(q.y - y); }
            if (q.y < y) { hi.y = y; id = id * 2.0 + vec2(0.0, 1.0); trailD = min(trailD, y - q.y); }
            else { lo.y = y; id = id * 2.0 + vec2(0.0, 2.0); }
        }
        id = mod(id, 997.0);
    }
    dmin = min(dmin, min(min(q.x - floor(q.x), ceil(q.x) - q.x), min(q.y - floor(q.y), ceil(q.y) - q.y)));
    float px = fwidth(q.x) * 1.2;
    float crack = smoothstep(px * 1.5, 0.0, dmin);
    // Sand-painted colour trail on one side of each crack.
    vec3 pc = imgLod(hash22(id) * 0.8 + 0.1, 3.0);
    pc = glowColour(pc, id * 0.01, hueP * 0.159);
    float tw = 0.02 + 0.06 * clamp(trailP, 0.0, 1.0) * (0.6 + 0.8 * swell);
    float grain = noise2(p * 700.0);                            // sand grain (smooth noise, no pixel grid)
    float trail = exp(-trailD / tw) * step(grain, exp(-trailD / tw) * 0.9);
    vec3 paper = vec3(0.96, 0.95, 0.92);
    vec3 lightV = mix(paper, pc * 0.9, trail * clamp(photoP + 0.3, 0.0, 1.3) * 0.7);
    lightV = mix(lightV, vec3(0.05) * (1.0 - 0.5 * kick), crack);
    vec3 darkV = mix(vec3(0.03, 0.03, 0.04), pc * 0.8, trail * 0.7);
    darkV = mix(darkV, vec3(0.9) * (1.0 + 0.3 * kick), crack);
    finish(mix(darkV, lightV, mode));
}

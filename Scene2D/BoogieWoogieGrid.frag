#version 330 core
out vec4 fragColor;
/**
 * @file BoogieWoogieGrid.frag
 * @brief BOOGIE WOOGIE GRID: Mondrian's Broadway Boogie Woogie set to music
 * -- a city grid of yellow streets on white, each street dotted with
 * small blocks of red, blue and grey that race along like traffic lights
 * and taxis, larger coloured blocks sitting in the squares between, some
 * holding a small window of the photograph; the street pattern is endless
 * and the traffic never stops.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the traffic moves (integrated, jump-free)
 *   audioSpread     -> the traffic density
 *   audioKick       -> the blocks light up (light)
 *   audioMode       -> the ground: grey night in minor, white day in major
 *   audioRoughness  -> the street widths vary
 *   audioSwell      -> the photo windows glow (slow)
 *
 * Knobs: gridP (grid density), blockP (block size), photoP (photo windows), hueP.
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

uniform float gridP;
uniform float blockP;
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

vec3 bwPal(float k)
{
    k = mod(k, 4.0);
    return k < 1.0 ? vec3(0.85, 0.12, 0.1) : (k < 2.0 ? vec3(0.1, 0.22, 0.7) : (k < 3.0 ? vec3(0.95, 0.85, 0.1) : vec3(0.7, 0.7, 0.72)));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = 3.0 + 3.0 * clamp(gridP, 0.0, 1.0);
    vec2 g = p * S + vec2(0.02, 0.01) * sceneTime;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    // Streets: bands along the cell borders, width varying per street.
    float wx = 0.07 + 0.04 * rough * (hash11(gi.x * 1.3) - 0.5) * 2.0;
    float wy = 0.07 + 0.04 * rough * (hash11(gi.y * 2.7 + 5.0) - 0.5) * 2.0;
    float onV = step(f.x, wx);                                  // vertical street at the left edge
    float onH = step(f.y, wy);                                  // horizontal street at the bottom edge
    vec3 ground = mix(vec3(0.5, 0.5, 0.52), vec3(0.95, 0.94, 0.9), mode);
    vec3 col = ground;
    // Blocks in the squares.
    float bh = hash21(gi + 3.0);
    if (bh < 0.35) {
        vec2 bc = vec2(0.3 + 0.4 * hash21(gi + 5.0), 0.3 + 0.4 * hash21(gi + 7.0));
        vec2 bs = (0.12 + 0.2 * clamp(blockP, 0.0, 1.0)) * vec2(0.7 + 0.6 * hash21(gi + 9.0), 0.7 + 0.6 * hash21(gi + 11.0));
        vec2 d = abs(f - bc) - bs;
        if (max(d.x, d.y) < 0.0) {
            col = bwPal(floor(bh * 40.0));
            // Some blocks hold a window of the photo.
            if (hash21(gi + 13.0) < 0.5 * clamp(photoP, 0.0, 1.0)) {
                vec2 wd = abs(f - bc) - bs * 0.55;
                if (max(wd.x, wd.y) < 0.0) col = imgLod((f - bc) / bs * 0.2 + hash22(gi), 1.0) * (0.8 + 0.5 * swell);
            }
        }
    }
    // Streets: yellow with traffic blocks.
    float T = 0.4 * sceneTime + 2.5 * audioAdvance;
    float dens = 0.3 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    if (onV > 0.5 || onH > 0.5) {
        col = vec3(0.95, 0.82, 0.12);
        // Traffic along the street: small squares, moving.
        float along = onV > 0.5 ? g.y : g.x;
        float lane = onV > 0.5 ? gi.x : gi.y + 100.0;
        float dir = mod(lane, 2.0) < 0.5 ? 1.0 : -1.0;
        float x = along * 12.0 + dir * T * (0.6 + 0.6 * hash11(lane));
        float ci = floor(x);
        float fx = fract(x);
        float h = hash21(vec2(ci, lane));
        if (h < dens && fx > 0.15 && fx < 0.85) {
            col = bwPal(floor(h * 40.0) + 1.0) * (1.0 + 0.6 * kick * step(0.5, hash21(vec2(lane, ci))));
        }
    }
    col = mix(col, col * glowColour(imgLod(p * 0.5 + 0.5, 6.0), p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}

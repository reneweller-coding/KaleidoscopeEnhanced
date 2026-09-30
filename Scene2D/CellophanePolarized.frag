#version 330 core
out vec4 fragColor;
/**
 * @file CellophanePolarized.frag
 * @brief CELLOPHANE POLARIZED: crumpled cellophane between crossed polarising
 * filters -- the layers of stretched film light up in vivid interference
 * colours that depend on how many layers overlap and how they were
 * stretched: overlapping angular shards of colour (magenta, yellow, cyan,
 * green) with sharp creases, over a black background where no film is;
 * as the filter slowly turns, every colour shifts to its complement and
 * back.  The shards' shapes are cut from the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the analyser turns (integrated, jump-free)
 *   audioSpread     -> the number of layers
 *   audioKick       -> the colours flash brighter (light)
 *   audioMode       -> crossed polars (dark ground); parallel polars (light ground) only at very major moments
 *   audioRoughness  -> the crumpling
 *   audioSwell      -> the stretch (retardation) (slow)
 *
 * Knobs: shardP (shard size), layerP (layers), photoP (photo shapes the shards), hueP.
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

uniform float shardP;
uniform float layerP;
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
    float mode = smoothstep(0.8, 0.98, clamp(audioMode, 0.0, 1.0));   // parallel polars only at very major moments
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float nL = 2.0 + 3.0 * clamp(layerP, 0.0, 1.0) + 2.0 * clamp(audioSpread, 0.0, 1.0);
    float S = 2.0 + 3.0 * (1.0 - clamp(shardP, 0.0, 1.0));
    // Retardation: sum over layers; each layer a Voronoi of flat shards with
    // its own thickness and fast axis.
    float ret = 0.0;
    float axisC = 0.0, axisS = 0.0;
    float creases = 0.0;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nL - 0.5);
        if (on <= 0.0) break;
        vec2 q = rot2(fk * 1.3) * p * S + fk * 5.1 + 0.3 * rough * vec2(fbm3(p * 4.0 + fk), fbm3(p * 4.0 - fk));
        vec2 qi = floor(q), qf = fract(q);
        float f1 = 9.0, f2 = 9.0; vec2 id = qi;
        for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
            vec2 o = vec2(x, y);
            vec2 c = o + 0.1 + 0.8 * hash22(qi + o + fk * 7.0);
            float d = length(qf - c);
            if (d < f1) { f2 = f1; f1 = d; id = qi + o; } else if (d < f2) f2 = d;
        }
        // Film present where the photo is bright enough (its shapes cut the shards).
        float cover = step(hash21(id + fk * 3.0), mix(0.6, 0.3 + luma(imgLod((id + 0.5 - fk * 5.1) / S * 0.5 + 0.5, 4.0)), clamp(photoP, 0.0, 1.0)));   // per shard, no blotches
        float th = (0.4 + 0.6 * hash21(id + fk)) * (0.8 + 0.5 * swell) * cover * on;
        float ax = hash21(id + fk * 11.0) * 3.14159;
        ret += th;
        axisC += cos(2.0 * ax) * th; axisS += sin(2.0 * ax) * th;
        creases = max(creases, exp(-(f2 - f1) / 0.01) * cover * on);
    }
    // Interference colour for crossed polars: I = sin^2(2 theta) * sin^2(pi * ret / lambda).
    float theta = atan(axisS, axisC) * 0.5 - T;
    float s2 = pow(sin(2.0 * theta), 2.0);
    vec3 lam = vec3(0.65, 0.53, 0.45);
    vec3 crossed = s2 * pow(sin(3.14159 * ret * 1.2 / lam + hueP * 0.159 * 3.0), vec3(2.0));
    vec3 parallel = 1.0 - crossed;
    vec3 col = mix(crossed, parallel * 0.9, mode) * (1.0 + 0.5 * kick);
    col *= 1.0 - 0.4 * creases;
    finish(col);
}

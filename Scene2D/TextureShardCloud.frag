#version 330 core
out vec4 fragColor;
/**
 * @file TextureShardCloud.frag
 * @brief TEXTURE SHARD CLOUD: a slowly tumbling cloud of glass shards -- a
 * shattered pane of the photograph floats in the dark, hundreds of
 * triangular fragments drifting apart and together, each tilted its own
 * way so it shows its piece of the picture slightly shifted and flashes a
 * bright edge when it turns toward the light; fragments at different
 * depths drift at different speeds, the far ones smaller and dimmer.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the shards drift (integrated, jump-free)
 *   audioSpread     -> the pane breaks further apart
 *   audioKick       -> edge flashes (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioHigh       -> sparkles on the edges (light)
 *   audioSwell      -> depth haze (slow)
 *
 * Knobs: shardP (shard size), layerP (depth layers), tiltP (tumbling), hueP.
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
uniform float audioHigh;
uniform float audioSwell;

uniform float shardP;
uniform float layerP;
uniform float tiltP;
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
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.12, 0.92, 0.72), mode);
    vec3 col = vec3(0.01, 0.012, 0.02);
    float nL = 2.0 + 2.0 * clamp(layerP, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.25 * audioAdvance;
    float gap = 0.04 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    for (int L = 3; L >= 0; --L) {                              // far to near
        float fl = float(L);
        float on = smoothstep(fl - 0.5, fl + 0.5, nL - 0.5);
        if (on <= 0.0) continue;
        float depth = 1.0 + fl * 0.7;
        float S = (3.0 + 3.0 * (1.0 - clamp(shardP, 0.0, 1.0))) * depth;
        // Each layer's lattice turned its own way, drifting.
        vec2 q = rot2(fl * 0.9 + 0.3) * p * S + vec2(T * (1.0 + 0.3 * fl), 0.3 * T) * 3.0 + fl * 11.0;
        // Equilateral triangles: skewed lattice, each rhombus split in two.
        vec2 sk = vec2(q.x - q.y * 0.57735, q.y * 1.1547);
        vec2 ci = floor(sk);
        vec2 ff = fract(sk);
        float tri = step(1.0, ff.x + ff.y);                      // which triangle of the rhombus
        vec2 id = ci * 2.0 + vec2(tri, 0.0);
        // Distance to the triangle's edges (barycentric, in skewed units ~ true for equilateral).
        float ed = tri > 0.5 ? min(min(1.0 - ff.x, 1.0 - ff.y), ff.x + ff.y - 1.0) : min(min(ff.x, ff.y), 1.0 - ff.x - ff.y);
        ed *= 0.866;
        vec2 f = ff;
        float px = fwidth(sk.x) * 1.2;
        float inside = smoothstep(gap * 0.5, gap * 0.5 + px, ed);
        // Each shard's tilt shifts its piece of the picture and changes its light.
        float h = hash21(id + fl * 3.0);
        float tilt = (0.3 + 0.7 * clamp(tiltP, 0.0, 1.0));
        float ang = T * 4.0 * (h - 0.5) + h * 6.28;
        vec2 tdir = vec2(cos(ang), sin(ang)) * tilt;
        vec2 uv = q / S * 0.7 + 0.5 + tdir * 0.03;
        vec3 ph = imgLod(uv, 0.8 + fl * 0.5);
        float facing = 0.5 + 0.5 * sin(ang * 1.3 + h * 3.0);
        vec3 sc = ph * lc * (0.45 + 0.7 * facing);
        vec3 gc = glowColour(ph, id, hueP * 0.159);
        float edge = exp(-(ed - gap * 0.5) / (px * 2.0 + 0.01)) * inside;
        sc += mix(gc, vec3(1.0), 0.5) * edge * pow(facing, 4.0) * (0.5 + 1.5 * kick);
        float sparkle = pow(max(0.0, sin(sceneTime * 3.0 + h * 40.0)), 20.0) * edge;
        sc += vec3(1.0) * sparkle * hi;
        // Depth haze.
        float haze = (0.15 + 0.4 * swell) * fl / 3.0;
        sc = mix(sc, lc * 0.05, haze) / (1.0 + fl * 0.3);
        col = mix(col, sc, inside * on);
    }
    finish(col);
}

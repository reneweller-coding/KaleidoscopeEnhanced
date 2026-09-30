#version 330 core
out vec4 fragColor;
/**
 * @file TextureFrostCreep.frag
 * @brief TEXTURE FROST CREEP: frost growing over a window pane with the
 * photograph behind it -- feathery ice ferns creep across the glass from
 * many seeds, branching and filling in, frosting the view into a soft
 * blur; then they slowly melt back, the glass clears in patches and the
 * picture shines through sharp again, until the frost returns.  The ferns
 * sparkle where light catches their facets.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the frost grows and melts (integrated, jump-free)
 *   audioSpread     -> how far the frost reaches
 *   audioHigh       -> the crystals sparkle (light)
 *   audioMode       -> the light behind: cold blue in minor, warm in major
 *   audioRoughness  -> the fern branching
 *   audioSwell      -> the pane mists up (slow)
 *
 * Knobs: fernP (fern scale), seedP (seed density), clearP (how clear the photo shows), hueP.
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
uniform float audioHigh;
uniform float audioMode;
uniform float audioRoughness;
uniform float audioSwell;

uniform float fernP;
uniform float seedP;
uniform float clearP;
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

// Feathery fern field: ridged noise stretched along a seed-radial direction.
float fern(vec2 w, vec2 dir, float scale, float rough)
{
    vec2 t = vec2(dot(w, dir), dot(w, vec2(-dir.y, dir.x)));
    float spine = 1.0 - abs(noise2(vec2(t.x * 0.8, t.y * 3.0) * scale) * 2.0 - 1.0);
    // Barbs at 60 degrees off the spine.
    vec2 b1 = rot2(1.05) * t, b2 = rot2(-1.05) * t;
    float barb = max(1.0 - abs(noise2(vec2(b1.x * 1.5, b1.y * 12.0) * scale) * 2.0 - 1.0),
                     1.0 - abs(noise2(vec2(b2.x * 1.5, b2.y * 12.0) * scale + 5.0) * 2.0 - 1.0));
    return max(pow(spine, 8.0), pow(barb, 6.0 - 2.0 * rough) * 0.8);
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.003, 0.002) * sceneTime;
    // Seeds: a smooth growth direction (weighted away from nearby seeds)
    // and a smooth distance to them, so neighbouring ferns flow together.
    float sd = 2.0 + 3.0 * clamp(seedP, 0.0, 1.0);
    vec2 g = p * sd;
    vec2 gi = floor(g);
    vec2 acc = vec2(0.0); float wsum = 0.0, dsum = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j) + 0.2 + 0.6 * hash22(gi + vec2(i, j));
        float d = length(g - c);
        float wt = exp(-d * d * 3.0);
        acc += wt * (g - c) / max(d, 1e-3);
        wsum += wt; dsum += wt * d;
    }
    vec2 dir = normalize(acc + vec2(1e-4, 0.0));
    float best = dsum / max(wsum, 1e-4);
    // The growth front advances and retreats in slow waves across the pane.
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float grow = 0.5 + 0.5 * sin(T + 6.28 * fbm3(p * 0.6 + 2.0));
    float reach = (0.2 + 0.9 * grow) * (0.7 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    float front = best + 0.25 * (fbm3(p * 6.0) - 0.5);
    float cover = smoothstep(reach, reach - 0.3, front);
    float sid = 0.0;
    float sc = 6.0 + 10.0 * (1.0 - clamp(fernP, 0.0, 1.0));
    float f = fern(p * sc * 0.4 + sid * 7.0, dir, 3.0, rough);
    float f2 = fern(p * sc * 0.9 + sid * 3.0, rot2(0.7) * dir, 3.0, rough);
    float ice = max(f, f2 * 0.7) * cover;
    // The pane: the photo sharp where clear, frosted (blurred, whitened) under ice.
    float clr = clamp(clearP, 0.0, 1.0);
    vec3 sharp = imgLod(uv, 0.3);
    vec3 blur = imgLod(uv, 4.5);
    vec3 back = mix(sharp, blur, clamp(cover * 0.8 + 0.3 * swell, 0.0, 1.0));
    vec3 tint = mix(vec3(0.75, 0.88, 1.1), vec3(1.1, 0.92, 0.75), mode);
    vec3 col = back * tint * (0.6 + 0.3 * clr);
    col = mix(col, mix(col, vec3(0.85, 0.92, 1.0), 0.5), cover * 0.35);  // frosted haze
    col += vec3(0.8, 0.9, 1.0) * ice * 0.55;
    // Sparkling facets on the ferns.
    vec2 sg = p * 160.0;
    vec2 si = floor(sg), sf = fract(sg);
    vec2 scn = 0.25 + 0.5 * hash22(si);
    float spk = smoothstep(0.3, 0.0, length(sf - scn)) * step(0.93, hash21(si + 3.0)) * ice;
    float stw = pow(max(0.0, sin(sceneTime * (1.0 + 2.0 * hash21(si)) + hash21(si + 1.0) * 30.0)), 8.0);
    col += vec3(1.0) * spk * stw * (0.3 + 1.5 * hi);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.08);
    finish(col);
}

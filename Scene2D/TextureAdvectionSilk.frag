#version 330 core
out vec4 fragColor;
/**
 * @file TextureAdvectionSilk.frag
 * @brief TEXTURE ADVECTION SILK: the photograph carried along by a slow,
 * swirling current and drawn out into fine silk threads -- every point of
 * the picture is smeared along the flow's streamlines (line integral
 * convolution), so its colours become long glossy fibres that curl around
 * the vortices; the flow itself slowly evolves, the fibres shimmer with a
 * sheen that runs along them.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the silk streams along the flow (integrated, jump-free)
 *   audioSpread     -> the swirl strength
 *   audioKick       -> the sheen flares (light)
 *   audioMode       -> the silk: cool pearl in minor, warm gold in major (tint)
 *   audioRoughness  -> the fibres get finer
 *   audioSwell      -> how much of the photo's own colour shows (slow)
 *
 * Knobs: fibreP (fibre length), vortexP (vortex size), sheenP, hueP.
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

uniform float fibreP;
uniform float vortexP;
uniform float sheenP;
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

float gT, gVS, gSw;
vec2 flowAt(vec2 x)
{
    // Curl of a noise potential: divergence-free swirls.
    float e = 0.02;
    vec2 q = x * gVS + vec2(0.0, gT);
    float n0 = fbm3(q);
    float nx = fbm3(q + vec2(e, 0.0));
    float ny = fbm3(q + vec2(0.0, e));
    return vec2(ny - n0, -(nx - n0)) / e * gSw + vec2(0.15, 0.05);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gT = 0.01 * sceneTime;
    gVS = 0.8 + 1.5 * (1.0 - clamp(vortexP, 0.0, 1.0));
    gSw = 0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float stepL = (0.006 + 0.01 * clamp(fibreP, 0.0, 1.0));
    float adv = 0.02 * sceneTime + 0.15 * audioAdvance;
    // Streaming noise texture along the flow (phase moves along the lines).
    vec3 acc = vec3(0.0);
    float nacc = 0.0, wsum = 0.0;
    vec2 xf = p, xb = p;
    float fine = 120.0 + 200.0 * rough;
    for (int i = 0; i < 16; ++i) {
        float w = 1.0 - float(i) / 16.0;
        vec2 vf = normalize(flowAt(xf) + 1e-4);
        vec2 vb = normalize(flowAt(xb) + 1e-4);
        xf += vf * stepL;
        xb -= vb * stepL;
        acc += (imgLod(xf * 0.5 + 0.5 - vec2(adv, 0.0), 2.0) + imgLod(xb * 0.5 + 0.5 - vec2(adv, 0.0), 2.0)) * w;
        nacc += (noise2(xf * fine) + noise2(xb * fine)) * w;       // smooth noise: no cell grid
        wsum += 2.0 * w;
    }
    vec3 photo = acc / wsum;
    float fibre = nacc / wsum;                                 // LIC of white noise: threads along the flow
    fibre = (fibre - 0.5) * 4.0 + 0.5;
    vec3 silk = mix(vec3(0.85, 0.88, 0.95), vec3(1.0, 0.85, 0.55), mode);
    vec3 col = mix(silk * luma(photo) * 1.4, photo * 1.2, 0.35 + 0.5 * swell);
    col *= 0.6 + 0.6 * clamp(fibre, 0.0, 1.0);
    // Sheen along the threads: brighter where the flow faces a light direction.
    vec2 v = normalize(flowAt(p) + 1e-4);
    float sheen = pow(abs(dot(v, normalize(vec2(0.6, 0.8)))), 12.0);
    vec3 gc = glowColour(photo, p, hueP * 0.159);
    col += mix(vec3(1.0), gc, 0.3) * sheen * (0.08 + 0.3 * clamp(sheenP, 0.0, 1.0)) * (1.0 + 1.5 * kick) * (0.5 + fibre);
    finish(col);
}

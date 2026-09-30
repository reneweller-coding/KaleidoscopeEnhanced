#version 330 core
out vec4 fragColor;
/**
 * @file TextureCloudInterior.frag
 * @brief TEXTURE CLOUD INTERIOR: flying through the inside of towering
 * clouds -- soft white and grey masses loom up out of the haze and slide
 * past, the sun behind them turning their edges into silver and gold
 * linings, shafts of light breaking through the gaps, darker cores glowing
 * warm where the light scatters deep inside.  The clouds are built from
 * the photograph: its bright regions become the dense cloud, so every
 * photo gives its own cloudscape; its colours tint the light.  The flight
 * never ends; no horizon, the view is into the clouds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight speed (integrated, jump-free)
 *   audioSpread     -> how deep the view reaches into the haze
 *   audioRoughness  -> the cloud edges fray into wisps
 *   audioMode       -> the sun warms from silver toward gold in major (slow blend)
 *   audioBass       -> the light breaking through the gaps (light)
 *   audioSwell      -> the density of the clouds (slow)
 *
 * Knobs: densityP (cloud cover), sunP (sun strength), tintP (photo tint), hueP.
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
uniform float audioRoughness;
uniform float audioMode;
uniform float audioBass;
uniform float audioSwell;

uniform float densityP;
uniform float sunP;
uniform float tintP;
uniform float hueP;
// @expr densityP = clamp(0.4 + 0.35*swell + 0.2*seed2, 0.0, 1.0)

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
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float z0 = 0.12 * sceneTime + 1.0 * audioAdvance;
    float spacing = 0.22 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    vec2 sunDir = normalize(vec2(0.5, 0.7));
    vec3 sunC = mix(vec3(0.95, 0.97, 1.05), vec3(1.15, 0.9, 0.6), clamp(audioMode, 0.0, 1.0));

    // The haze beyond: bright toward the sun.
    // Deep blue sky between the clouds, brighter toward the sun.
    vec3 col = mix(vec3(0.12, 0.28, 0.6), vec3(0.45, 0.62, 0.9), 0.5 + 0.5 * dot(normalize(p + 1e-4), sunDir) * smoothstep(0.0, 0.8, length(p)));
    float dens0 = 0.15 + 0.4 * clamp(densityP, 0.0, 1.0);

    const int N = 9;
    float base = floor(z0 / spacing), fr = fract(z0 / spacing);
    for (int i = N - 1; i >= 0; --i) {
        float li = base + float(i);
        float z = (float(i) + 1.0 - fr) * spacing;
        float persp = 1.0 / z;
        vec2 q = p * persp * 0.28 + hash22(vec2(li, 7.0)) * 9.0;
        // Cloud density: the photo's bright regions (soft mip), shaped by noise.
        float ph = luma(imgLod(q * 0.6, 6.0));
        float avg = luma(imgLod(q * 0.6, 9.0));
        float n = fbm(q * 1.3 + li * 0.7);
        n += 0.12 * rough * (noise2(q * 9.0 + li) - 0.5);
        // Billows: a cloud mass (broad noise) with cauliflower tops (finer).
        float mass = noise2(q * 0.55 + li * 1.3);
        float d = mass * 0.9 + (n - 0.5) * 0.35 + (ph - avg) * 0.35;
        float c = smoothstep(0.62 - dens0 * 0.25, 0.68 - dens0 * 0.25, d);
        // Lighting: sample the density toward the sun; less density there = lit edge.
        vec2 qs = q + sunDir * 0.15;
        float dl = noise2(qs * 0.55 + li * 1.3) * 0.9 + (fbm(qs * 1.3 + li * 0.7) - 0.5) * 0.35 + (luma(imgLod(qs * 0.6, 6.0)) - avg) * 0.35;
        float lit = clamp(0.35 + (d - dl) * 5.0, 0.0, 1.0);
        float depthIn = smoothstep(0.62, 0.95, d);                      // deep inside the cloud: darker
        vec3 tint = mix(vec3(1.0), glowColour(imgLod(q * 0.6, 7.0), q * 0.2, hueP * 0.159), 0.35 * clamp(tintP, 0.0, 1.0));
        vec3 shade = mix(vec3(0.42, 0.46, 0.55), vec3(0.75, 0.6, 0.55), 0.3) * tint;
        vec3 cc = mix(shade, sunC * 1.25, lit) * (1.0 - 0.35 * depthIn * (1.0 - lit));
        // Silver lining: the thin edge facing the sun glows brightly.
        float edge = (1.0 - smoothstep(0.62, 0.7, d - (0.0))) * c * lit;
        cc += sunC * edge * (0.8 + 0.6 * clamp(sunP, 0.0, 1.0)) * (0.8 + 0.5 * bass);
        // Aerial perspective: far layers melt into the haze.
        float fade = smoothstep(float(N) * spacing, float(N) * spacing * 0.5, z) * smoothstep(0.03, 0.25, z);
        cc = mix(col, cc, 0.35 + 0.65 * smoothstep(float(N) * spacing, 0.3, z));
        col = mix(col, cc, c * fade);
    }
    // Shafts of light through the gaps, radiating from the sun direction.
    vec2 sp2 = sunDir * 0.9;
    vec2 v = p - sp2;
    float ang = atan(v.y, v.x);
    float rays = pow(0.5 + 0.5 * noise2(vec2(ang * 9.0, z0 * 0.3)), 3.0) * exp(-length(v) * 0.9);
    col += sunC * rays * (0.15 + 0.35 * clamp(sunP, 0.0, 1.0)) * (0.6 + 0.8 * bass);
    finish(col);
}

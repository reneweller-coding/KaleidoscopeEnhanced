#version 330 core
out vec4 fragColor;
/**
 * @file TextureMaelstrom.frag
 * @brief TEXTURE MAELSTROM: looking down into a whirlpool whose walls are the
 * photograph -- the texture is wound into a logarithmic spiral that turns
 * and sinks toward the eye of the vortex, streaks of foam spiral down with
 * it, the walls grow darker and faster with depth, and at the bottom a
 * cold light glows.  An endless polar field like the Tunnel: it continues
 * past the frame edges and mirrors without seams; every photo gives its
 * own maelstrom.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the downward drift of the walls (integrated, jump-free)
 *   audioPhase      -> the turning of the vortex (integrated)
 *   audioSpread     -> how tightly the spiral winds
 *   audioMode       -> the number of spiral arms (fewer in minor, more in major -- blended, never snapping)
 *   audioRoughness  -> the walls churn (ripple along the spiral)
 *   audioHigh       -> the foam's sparkle (light)
 *   audioBass       -> the glow in the eye (light)
 *   audioSwell      -> the foam's density (slow)
 *
 * Knobs: armsP (base arm count), windP (base winding), foamP (foam amount), hueP.
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
uniform float audioHigh;
uniform float audioBass;
uniform float audioSwell;

uniform float armsP;
uniform float windP;
uniform float foamP;
uniform float hueP;
// @expr foamP = clamp(0.3 + 0.5*swell + 0.2*seed2, 0.0, 1.0)

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

// Spiral coordinates: t winds around (jumps by 'arms' at the branch cut --
// arms is even, the mirror period of the photo is 2, so the jump is
// invisible), s runs down the log radius (continuous).
vec2 spiralUV(float arms, float wind, float lr, float a)
{
    float t = a / 6.2831853 * arms - lr * wind - 0.02 * sceneTime - 0.15 * audioPhase;
    float s = lr * 0.9 + 0.04 * sceneTime + audioAdvance * 0.5;
    return vec2(t, s);
}

void main()
{
    vec2 p = screenP() * 2.2;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    float r = length(p);
    float a = atan(p.y, p.x);
    float lr = log(max(r, 1e-3));
    // Arms: integer counts cross-faded (mode morphs smoothly between them).
    float armsF = 2.0 + 4.0 * clamp(armsP, 0.0, 1.0) + 2.0 * clamp(audioMode, 0.0, 1.0);
    float a0 = 2.0 * floor(armsF * 0.5), af = (armsF - a0) * 0.5;
    float wind = (1.2 + 1.6 * clamp(windP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));

    vec3 col = vec3(0.0);
    float da = length(fwidth(vec2(cos(a), sin(a))));
    for (int i = 0; i < 2; ++i) {
        float arms = a0 + 2.0 * float(i);
        float w = (i == 0) ? 1.0 - af : af;
        if (w < 0.001) continue;
        vec2 tuv = spiralUV(arms, wind, lr, a);
        tuv.x += 0.04 * rough * sin(tuv.y * 12.0 + sceneTime * 0.5);
        vec2 q = tuv;
        float fp = max(da * arms / 6.2831853 + fwidth(lr) * wind, fwidth(tuv.y)) * 1024.0;
        float lod = clamp(log2(max(fp, 1.0)), 0.0, 9.0);
        vec3 wall = imgScroll(tuv, lod);
        // Relief lit from above (the sky over the whirlpool).
        vec2 g = texGrad(tuv, lod + 1.5) * 0.015;
        float lit = 0.55 + 0.45 * clamp(0.5 - g.x - g.y, 0.0, 1.0);
        // Foam streaks wound along the arms: noise on the unit circle, turned
        // with the spiral, so it has no seam either.
        vec2 dir = vec2(cos(a - lr * wind * 6.2831853 / arms), sin(a - lr * wind * 6.2831853 / arms));
        float foamN = fbm3(dir * 2.5 + vec2(lr * 1.5 - 0.06 * sceneTime, 0.0));
        float foam = smoothstep(0.62 - 0.2 * clamp(foamP, 0.0, 1.0), 0.8, foamN);
        vec3 c = wall * lit * mix(vec3(1.0), glowColour(imgLod(tuv, 6.0), vec2(cos(a), sin(a)) + lr * 0.1, hueP * 0.159) * 1.5, 0.45);
        c = mix(c, vec3(0.9, 0.97, 1.0), foam * 0.55 * (0.7 + 0.5 * swell));
        c += vec3(1.0) * foam * pow(noise2(dir * 30.0 + lr * 8.0), 6.0) * (0.3 + 1.2 * hi);
        col += c * w;
    }
    // Depth: the walls darken toward the eye, a cold glow at the bottom.
    col *= smoothstep(0.02, 0.6, r) * (0.55 + 0.45 * smoothstep(0.0, 1.2, r));
    vec3 eye = mix(vec3(0.5, 0.8, 1.0), imgPalette(0.55 + hueP * 0.159) * 1.3, 0.35);
    col += eye * exp(-r * 6.0) * (0.4 + 1.0 * bass);
    finish(col);
}

#version 330 core
out vec4 fragColor;
/**
 * @file PollockDripField.frag
 * @brief POLLOCK DRIP FIELD: an all-over drip painting building itself --
 * long looping skeins of paint in several colours are poured across the
 * canvas, each skein a thin wandering line that thickens into pools where
 * the hand slowed and thins into threads where it flew, splatters beside
 * it; layer on layer the web grows dense, older layers slowly fade back
 * so it never clogs.  The colours come from the photograph, the canvas is
 * raw linen.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pouring (integrated, jump-free)
 *   audioSpread     -> the skeins loop wider
 *   audioRoughness  -> more splatter
 *   audioKick       -> the paint gleams (light)
 *   audioMode       -> palette: black-white-grey in minor, the photo's colours in major (blend)
 *   audioSwell      -> the web gets denser (slow)
 *
 * Knobs: layerP (layers), lineP (line weight), canvasP (canvas tone), hueP.
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
uniform float audioKick;
uniform float audioMode;
uniform float audioSwell;

uniform float layerP;
uniform float lineP;
uniform float canvasP;
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

// One skein: an isoline of a warped noise field, with varying thickness.
float skein(vec2 x, float seed, float T, float loop, out float thick)
{
    vec2 q = x * (1.5 + 0.5 * seed) + seed * 7.3;
    vec2 w = vec2(fbm3(q * loop + vec2(T, 0.0)), fbm3(q * loop + vec2(0.0, T) + 4.0)) - 0.5;
    float f = fbm3(q + w * 2.5);
    float e = 0.004;
    float fx = fbm3(q + vec2(e, 0.0) + w * 2.5), fy = fbm3(q + vec2(0.0, e) + w * 2.5);
    float g = length(vec2(fx - f, fy - f)) / e * (1.5 + 0.5 * seed) + 1e-3;
    thick = 0.4 + 1.6 * smoothstep(0.3, 0.8, fbm3(q * 3.0 + 9.0 + seed));   // pools and threads
    return abs(f - 0.5) / g;                                   // distance to the line (screen units)
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec3 linen = mix(vec3(0.86, 0.81, 0.7), vec3(0.62, 0.58, 0.52), clamp(canvasP, 0.0, 1.0));
    linen *= 0.95 + 0.05 * noise2(p * vec2(300.0, 290.0));
    vec3 col = linen;
    float nL = 3.0 + 4.0 * clamp(layerP, 0.0, 1.0) + 2.0 * swell;
    float loop = 0.6 + 1.0 * clamp(audioSpread, 0.0, 1.0);
    float w0 = (0.003 + 0.005 * clamp(lineP, 0.0, 1.0));
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    for (int k = 0; k < 9; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nL - 0.5);
        if (on <= 0.0) break;
        // Each layer lives a while, then fades as a new one replaces it (continuous).
        float life = fract(T * 0.5 + fk / 9.0);
        float gen = floor(T * 0.5 + fk / 9.0);
        float seed = hash11(fk * 3.7 + gen * 1.31);
        float alpha = smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.75, life) * on;
        float thick;
        float d = skein(p, seed, T * 0.3, loop, thick);
        float w = w0 * thick;
        float px = 1.0 / resolution.y;
        float paint = smoothstep(w + px, w - px, d);
        // Splatter beside the line: round drops.
        vec2 sg = p * 90.0 + seed * 50.0;
        vec2 si = floor(sg);
        float drop = smoothstep(0.3, 0.1, length(fract(sg) - 0.25 - 0.5 * hash22(si))) * step(0.965 - 0.05 * rough, hash21(si + seed)) * exp(-d / 0.03);
        paint = max(paint, drop);
        vec3 pc = imgPalette(fract(seed * 1.7 + hueP * 0.159));
        pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2) * 0.8;
        pc = mix(pc, glowColour(pc, vec2(seed * 9.0, 0.0), hueP * 0.159 + seed), 0.5);
        float grey = hash11(seed * 9.0);
        vec3 bw = grey < 0.4 ? vec3(0.05) : (grey < 0.7 ? vec3(0.92, 0.9, 0.85) : vec3(0.45));
        vec3 c = mix(bw, pc, mode);
        // Gloss on the wet paint.
        c += vec3(1.0) * smoothstep(w * 0.6, 0.0, d) * 0.12 * (1.0 + 2.0 * kick);
        col = mix(col, c, paint * alpha);
    }
    finish(col);
}

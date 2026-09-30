#version 330 core
out vec4 fragColor;
/**
 * @file WaxDripCascade.frag
 * @brief WAX DRIP CASCADE: a wall of candle wax -- layer upon layer of
 * coloured wax has run down it, each layer ending in rounded tongues and
 * fat drips that overlap the layer below, glossy on top and glowing
 * translucent where the wax is thin, as if lit from behind by the candle
 * flames above; the wall slowly scrolls upward, the drips lengthen and
 * swell, and the pigments swirl faintly inside the wax (from the
 * photograph).  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the wall scrolls (integrated, jump-free)
 *   audioSpread     -> how far the drips run
 *   audioBass       -> the backlight glows through the wax (light)
 *   audioMode       -> palette: cool in minor, warm candle colours in major
 *   audioRoughness  -> the wax surface gets lumpy
 *   audioSwell      -> the gloss (slow)
 *
 * Knobs: layerP (layer spacing), dripP (drip density), photoP (pigment swirl), hueP.
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
uniform float audioBass;
uniform float audioMode;
uniform float audioRoughness;
uniform float audioSwell;

uniform float layerP;
uniform float dripP;
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

// Lower edge of layer k at x (world units): a wavy base plus drip tongues.
float layerEdge(float k, float x, float spacing, float dens, float run)
{
    float base = k * spacing + 0.08 * sin(x * 2.0 + k * 1.7) + 0.05 * sin(x * 5.3 + k * 3.1);
    float drip = 0.0;
    float cw = 0.2 - 0.1 * dens;                               // drip cell width
    float ci = floor(x / cw);
    for (int i = -1; i <= 1; ++i) {
        float c = ci + float(i);
        float h = hash21(vec2(c, k));
        float cx = (c + 0.3 + 0.4 * hash21(vec2(k, c) + 3.0)) * cw;
        float w = cw * (0.18 + 0.2 * hash21(vec2(c, k) + 7.0));
        float L = w + run * spacing * (0.1 + 1.6 * h * h * h) * (0.85 + 0.15 * sin(0.05 * sceneTime + h * 6.28));
        float dx = (x - cx) / w;
        float ax = abs(dx);
        // A tongue with a round end (a capsule hanging from the edge) and a
        // soft shoulder where it leaves the layer.
        float prof = ax < 1.0 ? (L - w) * (1.0 - 0.12 * dx * dx) + w * sqrt(1.0 - dx * dx) : 0.0;
        prof = max(prof, (L - w) * 0.25 * exp(-(ax - 1.0) * 3.0) * step(1.0, ax) + w * 0.5 * exp(-(ax - 1.0) * 2.0));
        drip = max(drip, prof);
    }
    return base - drip;
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float spacing = 0.25 + 0.2 * clamp(layerP, 0.0, 1.0);
    float dens = clamp(dripP, 0.0, 1.0);
    float run = 0.6 + 1.2 * clamp(audioSpread, 0.0, 1.0);
    float scroll = 0.03 * sceneTime + 0.25 * audioAdvance;
    vec2 w = vec2(p.x * 1.2, p.y * 1.2 - scroll);
    // Layers stack downward: layer k covers y above its edge; the lowest
    // covering layer (largest k whose edge is below us) is the visible one.
    float k0 = floor(w.y / spacing);
    float vis = -1e3, edgeD = 1.0;
    for (int i = 0; i <= 3; ++i) {
        float k = k0 + float(i);
        float e = layerEdge(k, w.x, spacing, dens, run);
        if (w.y > e && k > vis) { vis = k; edgeD = w.y - e; }
    }
    // Wax colour per layer.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 pc = imgLod(vec2(hash11(vis * 0.37), hash11(vis * 0.71 + 2.0)), 5.0);
    vec3 wc = glowColour(pc, vec2(vis * 0.4, 0.0), hueP * 0.159 + 0.06 * vis);
    wc = mix(wc, mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.55, 0.25), mode) * luma(wc) * 1.8, 0.35);
    // Thickness: thin near the edge (translucent, backlit), thick inside.
    float th = smoothstep(0.0, 0.12, edgeD);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float lump = fbm3(w * 6.0 + vis * 3.0) * (0.3 + 0.7 * rough);
    vec2 uv = vec2(w.x * 0.6, w.y * 0.6) + 0.5 + 0.05 * vec2(fbm3(w * 2.0), fbm3(w * 2.0 + 4.0));
    vec3 pig = imgLod(uv, 1.5);
    vec3 col = wc * (0.35 + 0.35 * th);
    col = mix(col, col * (0.5 + 1.2 * luma(pig)) + pig * 0.1, 0.5 * clamp(photoP, 0.0, 1.0));
    col += wc * (1.0 - th) * (0.5 + 1.2 * bass);                // backlit thin rim
    // Gloss: normal from the thickness and lumps.
    float hgt = th * 0.6 + lump * 0.2;
    vec3 n = normalize(vec3(-dFdx(hgt), -dFdy(hgt), 0.004));
    float spec = pow(max(dot(n, normalize(vec3(-0.3, 0.6, 0.75))), 0.0), 30.0);
    col += vec3(1.0, 0.95, 0.88) * spec * (0.25 + 0.5 * swell);
    // Shadow just under each edge (the layer above casts it).
    float below = 1e3;
    for (int i = 0; i <= 3; ++i) {
        float k = k0 + float(i);
        if (k > vis) { float e = layerEdge(k, w.x, spacing, dens, run); below = min(below, e - w.y); }
    }
    col *= 1.0 - 0.55 * exp(-max(below, 0.0) * 40.0);
    finish(col);
}

#version 330 core
out vec4 fragColor;
/**
 * @file DropCoalescence.frag
 * @brief DROP COALESCENCE: coloured liquid drops seen from above in a dark
 * dish -- glossy blobs of ink-coloured liquid wander, touch, and flow into
 * each other with a soft neck, their colours mixing where they merge, then
 * pull apart again; each drop is a small lens showing the photograph
 * magnified and bent inside it, with a bright meniscus highlight and a
 * darker rim.  The drops' colours come from the photo beneath them.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drops wander (integrated, jump-free)
 *   audioSpread     -> drop size: more merging when the music is wide
 *   audioRoughness  -> a haze of tiny satellite droplets
 *   audioKick       -> the highlights flare (light)
 *   audioMode       -> the dish: cool in minor, warm in major
 *   audioSwell      -> the photo glows through the dish (slow)
 *
 * Knobs: countP (drop scale), mergeP (how readily they merge), lensP (lens strength), hueP.
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

uniform float countP;
uniform float mergeP;
uniform float lensP;
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

// Metaball field of one drop layer: value, gradient and colour-weighted sum.
void dropField(vec2 q, float T, float rad, float seed, inout float F, inout vec2 G, inout vec3 C, inout float W)
{
    vec2 gi = floor(q);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h1 = hash21(id + seed), h2 = hash21(id + seed + 3.1), h3 = hash21(id + seed + 7.7);
        vec2 c = id + 0.5 + 0.42 * vec2(sin(T * (0.6 + 0.5 * h1) + h2 * 6.28), cos(T * (0.5 + 0.5 * h2) + h3 * 6.28));
        float r = rad * (0.55 + 0.45 * sin(T * 0.3 + h1 * 6.28) * 0.5 + 0.45 * h3);
        vec2 d = q - c;
        float e = exp(-dot(d, d) / (r * r) * 2.5);
        F += e;
        G += e * (-5.0 * d / (r * r));
        vec2 cuv = c / 7.0 * 0.8 + 0.5;
        vec3 pc = glowColour(imgLod(cuv, 4.0), c * 0.1, hueP * 0.159 + seed * 0.07);
        vec3 fc = hsv2rgb(vec3(fract(hueP * 0.159 + h2 * 0.6 + 0.02 * T), 0.8, 1.0));
        C += e * mix(pc, fc, 0.25 + 0.5 * step(0.5, h1));
        W += e;
    }
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float S = 3.5 + 3.5 * clamp(countP, 0.0, 1.0);
    vec2 q = p * S + vec2(0.05, 0.03) * sceneTime;
    float T = 0.25 * sceneTime + 1.5 * audioAdvance;
    float rad = 0.55 + 0.15 * clamp(audioSpread, 0.0, 1.0);
    float F = 0.0, W = 0.0; vec2 G = vec2(0.0); vec3 C = vec3(0.0);
    dropField(q, T, rad, 0.0, F, G, C, W);
    // Satellite droplets: a second, finer layer that joins the same field.
    float sat = 0.25 + 0.75 * clamp(audioRoughness, 0.0, 1.0);
    float F2 = 0.0, W2 = 0.0; vec2 G2 = vec2(0.0); vec3 C2 = vec3(0.0);
    dropField(q * 3.0 + 11.0, T * 1.3, 0.3, 5.0, F2, G2, C2, W2);
    // Satellites keep clear of the big drops (no warts on their domes).
    float away = 1.0 - smoothstep(0.15, 0.4, F);
    float ks = 0.9 * sat * away;
    F += F2 * ks; G += G2 * 3.0 * ks; C += C2 * ks; W += W2 * ks;
    vec3 dropC = C / max(W, 1e-4);
    float th = 0.5 - 0.18 * clamp(mergeP, 0.0, 1.0);
    float aa = length(G) * S / resolution.y * 1.5 + 1e-3;
    float inside = smoothstep(th - aa, th + aa, F);
    float h = smoothstep(th, th + 0.9, F);                     // dome height
    vec2 uv = p * 0.8 + 0.5 + vec2(0.004, 0.003) * sceneTime;
    // The dish: the photo, dark and slightly blurred.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 dish = imgLod(uv, 2.5) * (0.07 + 0.1 * swell) * mix(vec3(0.7, 0.85, 1.1), vec3(1.1, 0.9, 0.7), mode);
    // Inside: the photo magnified by the lens, tinted by the drop's colour.
    vec2 n2 = -G / (1.0 + length(G) * 0.15) * 0.08 * (0.4 + 0.8 * clamp(lensP, 0.0, 1.0));
    vec3 seen = imgLod(uv + n2 / S * 4.0, 0.6);
    vec3 dcol = mix(dropC, dropC * (0.35 + 1.3 * luma(seen)) + seen * 0.25, 0.7);
    dcol *= 0.6 + 0.6 * h;
    // Darker rim where the surface is steep, bright meniscus highlight.
    vec3 nrm = normalize(vec3(-G * 0.2, 1.0));
    float rim = 1.0 - nrm.z;
    dcol *= 1.0 - 0.6 * smoothstep(0.1, 0.6, rim);
    float spec = pow(max(dot(nrm, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 40.0) * 1.3;
    float spec2 = pow(max(dot(nrm, normalize(vec3(0.5, -0.3, 0.8))), 0.0), 200.0);
    vec3 col = mix(dish, dcol, inside);
    col += inside * (spec * (0.5 + 0.9 * kick) + spec2 * 0.4) * vec3(1.0, 0.98, 0.95);
    // A faint shadow ring around each drop on the dish.
    col *= 1.0 - (1.0 - inside) * 0.5 * smoothstep(th * 0.4, th, F);
    finish(col);
}

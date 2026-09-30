#version 330 core
out vec4 fragColor;
/**
 * @file TextureAuroraField.frag
 * @brief TEXTURE AURORA FIELD: lying on your back under a great aurora -- the
 * whole sky is curtains of light converging toward the zenith (the corona),
 * rays and folds rippling, green fading up into red and violet, and the
 * colours and the shape of the folds come from the photograph: its colours
 * where it has them, its structure as the ripples running along the
 * curtains.  No horizon: the view is straight up, the curtains radiate in
 * all directions, so the field continues past the edges and mirrors.
 * Stars show through where the curtains thin.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the corona turns slowly (integrated)
 *   audioAdvance    -> the folds travel along the curtains (integrated)
 *   audioSpread     -> how many curtains (wide spectrum = more, finer)
 *   audioRoughness  -> the curtains ripple faster and finer
 *   audioMode       -> the colours: classic green in minor, pinks and violets in major (slow blend)
 *   audioSwell      -> brightness of the aurora (slow)
 *   audioHigh       -> the rays flicker at their lower edges (light)
 *
 * Knobs: foldsP (fold depth), rayP (ray fineness), photoP (share of photo colour), hueP.
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
uniform float audioRoughness;
uniform float audioMode;
uniform float audioSwell;
uniform float audioHigh;

uniform float foldsP;
uniform float rayP;
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
    vec2 p = screenP() * 1.4;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase;
    vec2 dir = vec2(cos(a), sin(a));

    // Night sky with stars (round, jittered).
    vec3 col = vec3(0.005, 0.01, 0.03);
    {
        vec2 g = p * 60.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        col += vec3(0.8, 0.85, 1.0) * smoothstep(0.1, 0.0, length(gf - gc)) * step(0.985, hash21(gi + 5.0)) * 0.7;
    }

    // Curtains: bands along circles around the zenith, folded by a noise
    // along the angle (seamless: noise on the unit circle).
    float nC = 2.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float fold = 0.25 + 0.45 * clamp(foldsP, 0.0, 1.0);
    float flow = 0.08 * sceneTime + 0.8 * audioAdvance;
    vec3 aur = vec3(0.0);
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float rk = 0.3 + fk * 0.3 + 0.15 * sin(fk * 2.7);
        // Photo structure bends the curtain: sample the photo along the angle.
        vec2 tq = dir * (0.35 + fk * 0.12) + 0.5 + vec2(flow * 0.05, 0.0);
        float photoBend = luma(imgLod(tq, 6.0)) - 0.5;
        // Big slow meanders (the curtain snakes across the sky), fine folds on top.
        float bend = fold * 1.6 * (noise2(dir * (0.9 + 0.3 * fk) + vec2(flow * 0.5, fk * 3.0)) - 0.5)
                   + 0.25 * fold * (noise2(dir * 6.0 + vec2(flow * 2.0, fk)) - 0.5) + 0.4 * photoBend;
        float d = r - rk - bend * 0.5;
        // Curtain: sharp lower edge (outer side toward the viewer), long glow upward.
        float lower = smoothstep(-0.03, 0.0, d);
        float glow = lower * exp(-max(d, 0.0) * 9.0);
        // Rays: fine streaks radiating from the zenith.
        float rf = 60.0 + 120.0 * clamp(rayP, 0.0, 1.0);
        // Irregular rays: noise around the circle at a fine scale, shifting with the flow.
        float rn = noise2(dir * rf * 0.1 + vec2(fk * 5.0, flow * (0.8 + 1.5 * rough))) * 0.65 + noise2(dir * rf * 0.3 + vec2(fk, flow * 2.0)) * 0.35;
        float rays = smoothstep(0.35, 0.85, rn);
        rays = mix(rays, 1.0, smoothstep(0.02, 0.0, abs(d)) * 0.5);
        float flick = 1.0 + 0.6 * hi * (noise2(dir * 40.0 + sceneTime * 3.0) - 0.5) * smoothstep(0.08, 0.0, d);
        float I = glow * (0.15 + 1.3 * rays) * flick * smoothstep(fk - 0.5, fk + 0.5, nC) * 0.8;
        // Colour: green at the edge, rising into red/violet; tinted by the photo.
        float mode = clamp(audioMode, 0.0, 1.0);
        vec3 edgeC = mix(vec3(0.2, 1.0, 0.45), vec3(1.0, 0.35, 0.7), mode * 0.6);
        vec3 topC = mix(vec3(0.8, 0.15, 0.4), vec3(0.5, 0.25, 1.0), mode);
        vec3 c = mix(edgeC, topC, smoothstep(0.0, 0.25, d));
        vec3 phC = glowColour(imgLod(tq, 5.0), dir + fk, hueP * 0.159);
        c = mix(c, phC, 0.35 * clamp(photoP, 0.0, 1.0) + 0.1);
        aur += c * I;
    }
    // The corona: the curtains converge into a bright knot at the zenith.
    aur += vec3(0.5, 1.0, 0.6) * exp(-r * 7.0) * 0.25;
    col = col * (1.0 - clamp(luma(aur), 0.0, 1.0)) + aur * (0.7 + 0.8 * swell);
    finish(col);
}

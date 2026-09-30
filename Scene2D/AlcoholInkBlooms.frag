#version 330 core
out vec4 fragColor;
/**
 * @file AlcoholInkBlooms.frag
 * @brief ALCOHOL INK BLOOMS: alcohol ink on white synthetic paper, blooming --
 * drops of intensely coloured ink spread out in soft-edged pools, each pool
 * pushing its pigment to the rim so it ends in a dark, sharp, lacy
 * boundary, often with a thin metallic gold line along it; pools push into
 * each other, leaving pale channels and cell-like shapes; the paper shows
 * white where the alcohol has cleared it.  New blooms keep opening and
 * spreading over the old ones.  The ink colours come from the photograph.
 * An endless field, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the blooms spread (integrated, jump-free)
 *   audioHarmChange -> a fresh bloom starts on chord changes (smoothed)
 *   audioSpread     -> bloom size
 *   audioRoughness  -> the rims get lacier
 *   audioHigh       -> the gold lines glint (light)
 *   audioSwell      -> ink saturation (slow)
 *
 * Knobs: bloomsP (how many), goldP (metallic rims), paperP (how much white
 * shows), hueP.
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
uniform float audioHarmChange;
uniform float audioSpread;
uniform float audioRoughness;
uniform float audioHigh;
uniform float audioSwell;

uniform float bloomsP;
uniform float goldP;
uniform float paperP;
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
    vec2 p = screenP() * 1.6;
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.4 * audioAdvance + 0.08 * clamp(audioHarmChange, 0.0, 1.0);

    // Blooms on a jittered grid in "time layers": each layer is a generation
    // of drops; a drop's radius grows over its life, later ones lie on top.
    vec3 paper = vec3(0.97, 0.96, 0.94);
    vec3 col = paper;
    float rimAcc = 0.0, goldAcc = 0.0;
    float size = 0.55 + 0.45 * clamp(audioSpread, 0.0, 1.0);
    float dens = 0.45 + 0.4 * clamp(bloomsP, 0.0, 1.0);
    for (int L = 0; L < 4; ++L) {
        float fl = float(L);
        // Each generation cycles: born, grows, then is covered by the next.
        float gen = floor(T + fl * 0.25);
        float life = fract(T + fl * 0.25);
        vec2 q = p / size + hash22(vec2(gen, fl)) * 11.0;
        vec2 gi = floor(q);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + gen * 3.1) > dens) continue;
            vec2 c = id + 0.5 + 0.3 * (hash22(id + gen) - 0.5);
            vec2 d = q - c;
            d += 0.18 * vec2(fbm3(q * 1.3 + id), fbm3(q * 1.3 + id + 5.0)) - 0.09;     // organic, not circular
            float ang = atan(d.y, d.x);
            vec2 dir = vec2(cos(ang), sin(ang));
            // Irregular, lacy rim (noise on the circle, seamless).
            float R = (0.25 + 0.5 * smoothstep(0.0, 0.8, life)) * (0.7 + 0.35 * hash21(id + 9.0));
            float lace = 0.12 * (fbm3(dir * 2.5 + id + gen) - 0.5) + (0.015 + 0.04 * rough) * (noise2(dir * 7.0 + id) - 0.5);
            float r = length(d) / R + lace;
            float inside = smoothstep(1.0, 0.97, r);
            // Ink: pale in the middle (the alcohol pushed it out), dense at the rim.
            float dens2 = mix(0.35, 1.0, smoothstep(0.3, 0.97, r));
            vec3 ph = imgLod(id * 0.093 + gen * 0.17, 5.0);
            vec3 ink = hsv2rgb(vec3(fract((satOf(ph) > 0.2 ? hue_of(ph) : hueP * 0.159) + 0.12 * hash21(id + gen) + 0.1 * fl), 0.85, 0.85));
            ink = mix(vec3(1.0), ink, (0.55 + 0.4 * swell) * dens2);
            // Fade out at the end of life (covered by the next layer anyway).
            float a = inside * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.8, life);
            col = mix(col, col * ink, a);
            float rim = exp(-pow((r - 0.99) / 0.018, 2.0)) * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.8, life);
            rimAcc = max(rimAcc, rim);
            goldAcc = max(goldAcc, exp(-pow((r - 1.015) / 0.008, 2.0)) * step(0.5, hash21(id + 17.0)) * smoothstep(1.0, 0.8, life));
        }
    }
    // Dark lacy rims, and gold lines along some of them.
    col *= 1.0 - 0.55 * rimAcc;
    vec3 gold = vec3(1.0, 0.8, 0.35);
    col = mix(col, gold * (0.8 + 0.8 * hi), goldAcc * (0.3 + 0.7 * clamp(goldP, 0.0, 1.0)));
    // Paper shows more where cleared.
    col = mix(col, paper, 0.15 * clamp(paperP, 0.0, 1.0));
    finish(col * 0.95);
}

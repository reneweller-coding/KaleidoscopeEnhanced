#version 330 core
out vec4 fragColor;
/**
 * @file TextureBioluminescentField.frag
 * @brief TEXTURE BIOLUMINESCENT FIELD: a dark shore at night teeming with
 * glowing plankton -- countless tiny cyan-blue sparks lie over the dark
 * photograph, and waves of excitation sweep through them in expanding
 * rings, as if something were stirring the water: each ring lights the
 * sparks it passes, which glow and slowly fade; the photo's bright
 * structures are densely populated, glowing filaments trace its edges.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the field drifts (integrated, jump-free)
 *   audioKick       -> a new ring of excitation, stronger (light)
 *   audioSpread     -> how far the rings spread
 *   audioHigh       -> the sparks glitter (light)
 *   audioMode       -> colour: cyan-blue in minor, green-gold in major
 *   audioSwell      -> the filaments along the photo glow (slow)
 *
 * Knobs: sparkP (spark density), ringP (ring rate), filamentP, hueP.
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
uniform float audioKick;
uniform float audioSpread;
uniform float audioHigh;
uniform float audioMode;
uniform float audioSwell;

uniform float sparkP;
uniform float ringP;
uniform float filamentP;
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

// Excitation at world point w: a sum of expanding rings, each born in its
// own cell and fading as it grows (continuous generations).
float excite(vec2 w, float T, float reach)
{
    float e = 0.0;
    vec2 gi = floor(w * 1.2);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j);
        float h = hash21(c);
        float cyc = T * (0.5 + 0.5 * h) + h * 7.0;
        float age = fract(cyc);
        float gen = floor(cyc);
        vec2 ctr = (c + 0.2 + 0.6 * hash22(c + gen * 0.37)) / 1.2;
        float R = age * reach;
        float d = abs(length(w - ctr) - R);
        e += exp(-d * d / 0.004) * smoothstep(0.0, 0.1, age) * (1.0 - age) * (1.0 - age);
        // The afterglow inside the ring.
        e += 0.15 * smoothstep(R, R - 0.3, length(w - ctr)) * (1.0 - age) * smoothstep(0.0, 0.1, age) * step(length(w - ctr), R);
    }
    return e;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 drift = vec2(0.012, 0.006) * sceneTime + 0.08 * vec2(audioAdvance, 0.0);
    vec2 w = p + drift;
    vec2 uv = w * 0.7 + 0.5;
    vec3 pc = mix(vec3(0.15, 0.7, 1.0), vec3(0.5, 1.0, 0.45), mode);
    pc = mix(pc, glowColour(imgLod(uv, 5.0), w, hueP * 0.159), 0.2);
    float T = (0.08 + 0.12 * clamp(ringP, 0.0, 1.0)) * sceneTime;
    float reach = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float e = excite(w, T, reach) * (0.7 + 1.0 * kick);
    // The dark photo beneath.
    vec3 col = imgLod(uv, 1.5) * 0.06 + vec3(0.0, 0.01, 0.02);
    // Filaments along the photo's edges, lit by the excitation.
    float ed = texEdge(uv, 3.0);
    col += pc * smoothstep(0.1, 0.5, ed) * (0.04 + 0.25 * swell + 0.4 * e) * clamp(filamentP + 0.2, 0.0, 1.2);
    // Sparks: round jittered points, densest where the photo is bright.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = w * (40.0 + 25.0 * fl) + fl * 17.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl * 5.0) + 0.1 * vec2(sin(sceneTime * 0.5 + hash21(id) * 6.28), cos(sceneTime * 0.4 + hash21(id + 2.0) * 6.28));
            vec2 cw = c / (40.0 + 25.0 * fl);
            float b = luma(imgLod((cw - fl * 17.0 / (40.0 + 25.0 * fl)) * 0.7 + 0.5, 3.0));
            float dens = (0.25 + 0.6 * clamp(sparkP, 0.0, 1.0)) * (0.4 + 1.2 * b);
            if (hash21(id + 9.0 + fl) > dens) continue;
            float d = length(g - c);
            float tw = 0.6 + 0.4 * sin(sceneTime * (2.0 + 3.0 * hash21(id + 4.0)) + hash21(id) * 6.28);
            float I = (0.05 + 1.6 * e) * (0.7 + 0.6 * hi * tw);
            col += pc * (smoothstep(0.22, 0.05, d) * 1.1 + exp(-d * 4.0) * 0.12) * I / (1.0 + fl * 0.6);
        }
    }
    finish(col);
}

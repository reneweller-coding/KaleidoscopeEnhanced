#version 330 core
out vec4 fragColor;
/**
 * @file ActiveNematicDefects.frag
 * @brief ACTIVE NEMATIC DEFECTS: a living liquid crystal -- a dense carpet of
 * rod-like filaments that align with their neighbours and push, so the
 * whole field churns in never-ending turbulence: the rods bend into bands
 * and swirls, and topological defects wander through them, comet-shaped
 * +1/2 defects that swim head-first and three-armed -1/2 defects that
 * drift, pairs born and annihilating.  Seen between crossed polarisers the
 * rods glow in interference colours by their orientation; the photo tints
 * the colour wheel.  Endless and mirrorable, every frame different.
 *
 * The director field is built from moving +/-1/2 defects (the angle of a
 * nematic around a defect of charge k is k times the polar angle), plus a
 * slow bend field; it is drawn by line-integral streaks along the director.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the defects swim (integrated, jump-free)
 *   audioSpread     -> how many defect pairs are active (blended in and out)
 *   audioRoughness  -> the rods buckle into finer bends
 *   audioMode       -> the interference palette shifts warm in major
 *   audioHigh       -> the defect cores sparkle (light)
 *   audioSwell      -> brightness of the polarised glow (slow)
 *
 * Knobs: defectsP (base number of defects), streakP (rod length), paletteP
 * (polariser palette vs. photo colours), hueP.
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
uniform float audioHigh;
uniform float audioSwell;

uniform float defectsP;
uniform float streakP;
uniform float paletteP;
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

float gT, gN, gRough;

// Defects come in +1/2 / -1/2 pairs (as they do physically): a pair is born
// and annihilates by its two members meeting.  With full charges the angle
// jumps across the cut are multiples of pi, which a nematic does not see.
vec2 pairCentre(float i)
{
    float a = gT * (0.05 + 0.03 * hash11(i * 3.1)) + hash11(i) * 6.28;
    return vec2(1.3 * sin(a + i) + 0.35 * sin(a * 2.3 + i * 5.0), 0.8 * cos(a * 0.8 + i * 2.0) + 0.3 * cos(a * 1.9 + i));
}
vec2 pairAxis(float i) { float a = gT * 0.07 * (hash11(i * 7.7) - 0.5) + hash11(i * 5.3) * 6.28; return vec2(cos(a), sin(a)); }
float pairSep(float i) { return 0.45 * smoothstep(i - 0.5, i + 0.5, gN); }
vec2 defectPos(float k)                     // k even: + member, odd: - member
{
    float i = floor(k * 0.5);
    float sgn = (mod(k, 2.0) < 0.5) ? 1.0 : -1.0;
    return pairCentre(i) + sgn * pairSep(i) * pairAxis(i);
}

float director(vec2 q)
{
    float th = 0.0;
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        vec2 d = q - defectPos(fk);
        float charge = (mod(fk, 2.0) < 0.5) ? 0.5 : -0.5;
        th += charge * atan(d.y, d.x);
    }
    th += 1.2 * (fbm3(q * (0.5 + 0.8 * gRough) + gT * 0.02) - 0.5);
    return th;
}

void main()
{
    vec2 p = screenP() * 1.6;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gT = sceneTime * 0.5 + 3.0 * audioAdvance;
    gRough = clamp(audioRoughness, 0.0, 1.0);
    gN = 1.0 + 2.0 * clamp(defectsP, 0.0, 1.0) + 2.0 * clamp(audioSpread, 0.0, 1.0);    // active pairs

    // Line integral along the director (a nematic has no arrow: the streak
    // goes both ways).
    float len = 0.006 + 0.01 * clamp(streakP, 0.0, 1.0);
    float th0 = director(p);
    vec2 dirF = vec2(cos(th0), sin(th0));
    vec2 a = p, b = p;
    vec2 da = dirF, db = -dirF;
    float acc = 0.0;
    for (int i = 0; i < 12; ++i) {
        float t1 = director(a); vec2 v1 = vec2(cos(t1), sin(t1)); if (dot(v1, da) < 0.0) v1 = -v1; da = v1; a += v1 * len;
        float t2 = director(b); vec2 v2 = vec2(cos(t2), sin(t2)); if (dot(v2, db) < 0.0) v2 = -v2; db = v2; b += v2 * len;
        acc += noise2(a * 160.0) + noise2(b * 160.0);
    }
    float rods = smoothstep(0.35, 0.7, acc / 24.0);

    // Crossed polarisers: brightness sin^2(2 theta), interference hue by angle.
    float bright = pow(sin(2.0 * th0), 2.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 polC = hsv2rgb(vec3(fract(th0 / 3.14159 + mix(0.55, 0.05, mode)), 0.75, 1.0));
    vec3 ph = imgLod(p * 0.3 + 0.5, 5.0);
    vec3 photoC = glowColour(ph, p * 0.5 + 0.3 * vec2(cos(2.0 * th0), sin(2.0 * th0)), hueP * 0.159);
    vec3 c = mix(polC, photoC, 0.6 * (1.0 - clamp(paletteP, 0.0, 1.0)));
    vec3 col = c * (0.12 + 0.95 * bright) * (0.45 + 0.75 * rods) * (0.7 + 0.6 * swell);
    // Defect cores: bright points where the order breaks down.
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        float w = smoothstep(0.02, 0.15, pairSep(floor(fk * 0.5)));
        float d = length(p - defectPos(fk));
        col += vec3(1.0, 0.95, 0.9) * exp(-d * d * 900.0) * w * (0.3 + 1.0 * hi);
    }
    finish(col);
}

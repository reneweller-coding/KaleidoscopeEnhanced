#version 330 core
out vec4 fragColor;
/**
 * @file RheoscopicSwirl.frag
 * @brief RHEOSCOPIC SWIRL: a rheoscopic fluid -- water filled with tiny
 * pearly flakes that line up with the flow, so every current, eddy and
 * shear layer becomes visible as silky bands of light and shadow, shimmering
 * like mother-of-pearl.  Slow vortices turn and merge, thin shear lines
 * wind around them, and the dye in the fluid takes its colours from the
 * photograph (where it is grey, a soft pearly hue field).  The whole frame
 * flows continuously; an endless field that mirrors without seams.
 *
 * The flake orientation follows the local strain of a slowly evolving
 * divergence-free flow; brightness is how much the flakes face the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the fluid's motion (integrated, jump-free)
 *   audioSpread     -> the vortex scale (wide spectrum = smaller, busier eddies)
 *   audioRoughness  -> fine turbulence on the shear lines
 *   audioMode       -> the pearl sheen warms in major
 *   audioHigh       -> the glitter of the flakes (light)
 *   audioSwell      -> sheen strength (slow)
 *
 * Knobs: scaleP (eddy scale), dyeP (how much colour), speedP (flow speed), hueP.
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

uniform float scaleP;
uniform float dyeP;
uniform float speedP;
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

float gT;

// Stream function of the flow: a few slowly drifting vortices plus noise.
float psi(vec2 q)
{
    float s = 0.0;
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        vec2 c = vec2(sin(gT * (0.11 + 0.03 * fk) + fk * 2.1), cos(gT * (0.09 + 0.02 * fk) + fk * 1.3)) * 1.1;
        float sgn = (mod(fk, 2.0) < 0.5) ? 1.0 : -1.0;
        vec2 d = q - c;
        s += sgn * exp(-dot(d, d) * 1.4);
    }
    s += 0.35 * (fbm3(q * 1.2 + vec2(gT * 0.05, 0.0)) - 0.5);
    return s;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gT = sceneTime * (0.4 + 0.8 * clamp(speedP, 0.0, 1.0)) * 0.3 + 1.2 * audioAdvance;
    float sc = (1.2 + 1.2 * clamp(scaleP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * sc;

    // Velocity = perpendicular gradient of the stream function; the flakes
    // align with it.  Warp the sampling point back along the flow a little,
    // so the pattern is advected (streaky), not just a static field.
    float e = 0.01;
    vec2 g = vec2(psi(q + vec2(e, 0.0)) - psi(q - vec2(e, 0.0)), psi(q + vec2(0.0, e)) - psi(q - vec2(0.0, e))) / (2.0 * e);
    vec2 vel = vec2(g.y, -g.x);
    float speed = length(vel);
    vec2 dir = vel / (speed + 1e-4);
    // Shear bands: fine streaks along the flow (a line-integral of noise).
    float band = 0.0;
    vec2 w = q;
    for (int i = 0; i < 10; ++i) {
        vec2 gg = vec2(psi(w + vec2(e, 0.0)) - psi(w - vec2(e, 0.0)), psi(w + vec2(0.0, e)) - psi(w - vec2(0.0, e)));
        vec2 v = normalize(vec2(gg.y, -gg.x) + 1e-5);
        w += v * 0.035;
        band += noise2(w * vec2(22.0) + vec2(0.0, gT * 0.3));
    }
    band /= 10.0;
    band += 0.15 * clamp(audioRoughness, 0.0, 1.0) * (noise2(q * 60.0 + gT) - 0.5);
    // Flake reflectance: flakes aligned with the flow face the light differently
    // depending on the flow direction relative to the light.
    vec2 L = normalize(vec2(cos(0.3), sin(0.3)));
    float face = pow(abs(dot(dir, L)), 2.0);
    float bandC = smoothstep(0.3, 0.7, band);
    float sheen = pow(face, 1.5) * (0.25 + 1.2 * bandC) * (0.5 + 0.7 * smoothstep(0.0, 1.5, speed));
    // Pearly iridescence varying with the flake angle.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 pearl = hsv2rgb(vec3(fract(mix(0.55, 0.08, mode) + 0.25 * dot(dir, vec2(0.7, 0.7)) + 0.1 * band), 0.3, 1.0));
    // Dye: the photo's colour, advected with the flow (sampled back along it).
    vec2 duv = q * 0.25 + 0.5 - vel * 0.02;
    vec3 ph = imgLod(duv, 4.0);
    vec3 dye = glowColour(ph, q * 0.4, hueP * 0.159) * (0.5 + 0.7 * luma(ph));
    vec3 base = mix(vec3(0.03, 0.035, 0.05), dye * 0.35, clamp(dyeP, 0.0, 1.0) * 0.7 + 0.15);
    vec3 col = base * (1.0 - 0.4 * sheen) + mix(pearl, dye * 1.3 + 0.2, 0.3 * clamp(dyeP, 0.0, 1.0)) * sheen * (0.8 + 0.6 * swell);
    // Glitter: individual flakes catching the light, round points.
    vec2 gq = q * 90.0, gi = floor(gq);
    float gl = step(0.985, hash21(gi)) * smoothstep(0.35, 0.0, length(fract(gq) - 0.5)) * face * bandC;
    col += vec3(1.0) * gl * (0.2 + 1.0 * hi);
    finish(col);
}

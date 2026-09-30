#version 330 core
out vec4 fragColor;
/**
 * @file TextureLightningPaths.frag
 * @brief TEXTURE LIGHTNING PATHS: electricity crawling through the photograph
 * -- branching bolts of blue-white lightning run along the dark cracks and
 * valleys of the texture, as if the photo were a slab of stone charged
 * from within: the bolts flicker along their paths, fork into finer
 * branches, and light up the surrounding stone in cold violet, then fade
 * and strike again elsewhere.  The surface itself is dark, only lit by the
 * discharges and a faint afterglow along the paths.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioKick       -> a discharge (light only)
 *   audioAdvance    -> the discharges wander to new paths (integrated)
 *   audioSpread     -> how many of the fine branches carry current
 *   audioRoughness  -> the bolts jitter along their paths
 *   audioMode       -> the colour: violet in minor, cyan-white in major
 *   audioSwell      -> the afterglow along the paths (slow)
 *
 * Knobs: scaleP, branchP (branch density), stoneP (how much stone is lit), hueP.
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
uniform float audioRoughness;
uniform float audioMode;
uniform float audioSwell;

uniform float scaleP;
uniform float branchP;
uniform float stoneP;
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

// A thin line along the isoline n = 0.5 of a field, of pixel width w.
float isoLine(float n, vec2 grad, float w)
{
    return exp(-pow(abs(n - 0.5) / (length(grad) * w + 1e-4), 2.0));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sc = 1.2 + 1.5 * clamp(scaleP, 0.0, 1.0);
    vec2 q = p * sc;
    vec2 uv = p * 0.7 + 0.5 + vec2(0.002, 0.0015) * sceneTime;
    // The field whose isolines are the bolts: noise warped by the photo, so
    // the bolts follow the photo's structure.
    float T = 0.05 * sceneTime + 0.5 * audioAdvance;
    vec2 warp = vec2(luma(imgLod(uv, 4.0)), luma(imgLod(uv + 0.37, 4.0))) - 0.5;
    vec2 wq = q + warp * 1.5 + 0.02 * rough * vec2(noise2(q * 60.0 + sceneTime * 12.0), noise2(q * 60.0 - sceneTime * 12.0));
    float e = 0.002;
    float n1 = fbm(wq + vec2(T, 0.0));
    vec2 g1 = vec2(fbm(wq + vec2(T + e, 0.0)) - n1, fbm(wq + vec2(T, e)) - n1) / e;
    float n2 = fbm(wq * 2.3 + 7.0 - vec2(0.0, T));
    vec2 g2 = vec2(fbm((wq + vec2(e, 0.0)) * 2.3 + 7.0 - vec2(0.0, T)) - n2, fbm((wq + vec2(0.0, e)) * 2.3 + 7.0 - vec2(0.0, T)) - n2) / e;
    float px = sc / resolution.y;
    float trunk = isoLine(n1, g1, px * 1.2);
    // Branches only near the trunk (they fork off it).
    float nearTrunk = exp(-pow(abs(n1 - 0.5) / 0.06, 2.0));
    float branch = isoLine(n2, g2, px * 0.8) * nearTrunk * (0.3 + 0.7 * clamp(branchP, 0.0, 1.0)) * (0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    // Which stretches are live now: a wandering charge; flicker along the bolt.
    float charge = smoothstep(0.3, 0.6, fbm3(p * 1.2 + vec2(0.09 * sceneTime + audioAdvance, 0.0)));
    float flick = 0.6 + 0.4 * noise2(vec2(sceneTime * 9.0, n1 * 30.0));
    float I = charge * flick * (0.5 + 1.6 * kick);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 boltC = mix(vec3(0.65, 0.5, 1.0), vec3(0.6, 0.95, 1.0), mode);
    boltC = mix(boltC, glowColour(imgLod(uv, 6.0), p, hueP * 0.159), 0.15);
    // The dark stone (the photo), lit around the live bolts.
    vec3 stone = imgLod(uv, 1.0) * 0.14;
    vec3 col = stone * (1.0 + 3.0 * clamp(stoneP, 0.0, 1.0) * nearTrunk * I);
    col += boltC * exp(-pow(abs(n1 - 0.5) / 0.04, 2.0)) * I * 0.6;         // glow around the bolt
    col += mix(boltC, vec3(1.0), 0.6) * (trunk + branch * 0.8) * I * 2.4;
    col += boltC * trunk * 0.08 * (0.4 + 0.8 * swell);                        // faint afterglow everywhere
    finish(col);
}

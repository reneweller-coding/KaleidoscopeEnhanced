#version 330 core
out vec4 fragColor;
/**
 * @file TextureLavaCracks.frag
 * @brief TEXTURE LAVA CRACKS: the photograph as a cooling lava crust -- its
 * dark lines and hollows split open and glow white-yellow-orange with the
 * molten rock beneath, while the plates between them are the photo itself,
 * darkened and cooling, with a thin red rim where they meet the heat.  The
 * heat flows slowly through the network of cracks like a pulse through
 * veins, the crust drifts and the cracks widen and close in slow waves.
 * An endless field, mirroring without seams; every photo gives its own
 * crack network (the veins of marble, the joints of basalt, the mesh of
 * crackle glaze ...).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the cracks open (slow)
 *   audioSpread     -> which lines open: wide spectrum opens the fine ones too
 *   audioRoughness  -> the crust's edges boil (fine stetig ripple)
 *   audioMode       -> the glow's temperature: deep red in minor, yellow-white in major
 *   audioAdvance    -> the heat pulse running through the veins (integrated)
 *   audioBass       -> the glow's brightness (light)
 *   audioHigh       -> sparks rising from the hottest cracks (light)
 *
 * Knobs: scaleP (how close), crustP (how much crust vs. open lava),
 * flowP (the pattern of the heat pulse), hueP.
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
uniform float audioSwell;
uniform float audioSpread;
uniform float audioRoughness;
uniform float audioMode;
uniform float audioBass;
uniform float audioHigh;

uniform float scaleP;
uniform float crustP;
uniform float flowP;
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
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    float sc = 0.6 + 0.9 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * sc + vec2(-0.008, 0.011) * sceneTime + 0.5;
    uv += 0.006 * rough * vec2(fbm3(uv * 40.0 + sceneTime * 0.3) - 0.5, fbm3(uv * 40.0 + 7.0 - sceneTime * 0.3) - 0.5);

    // Where the photo is dark (relative to its surroundings) the crust splits.
    float fine = clamp(audioSpread, 0.0, 1.0);
    float hLocal = luma(imgLod(uv, 1.5 - 0.8 * fine));
    float hWide = luma(imgLod(uv, 5.0));
    float valley = hWide - hLocal;                          // > 0 in dark lines and hollows
    float open = mix(0.05, 0.13, swell) + 0.08 * clamp(crustP, 0.0, 1.0);
    // The cracks breathe in slow waves across the field.
    float breath = 0.5 + 0.5 * sin(dot(uv, vec2(2.3, 1.7)) + fbm3(uv * 2.0) * 3.0 - 0.15 * sceneTime);
    open *= 0.7 + 0.6 * breath;
    float lava = smoothstep(open * 0.55, open, valley);
    float rim = smoothstep(open * 0.05, open * 0.5, valley) - lava;

    // Heat pulse flowing through the network (integrated phase, never snapping).
    float fw = mix(2.0, 7.0, clamp(flowP, 0.0, 1.0));
    float pulse = 0.6 + 0.4 * sin(fw * fbm3(uv * 1.5 + 3.0) * 6.0 - 1.5 * audioAdvance - 0.25 * sceneTime);

    // Lava colour: blackbody-ish ramp, temperature from the mode and the pulse.
    float temp = clamp((0.45 + 0.4 * clamp(audioMode, 0.0, 1.0)) * pulse * (0.8 + 0.4 * bass) * (0.6 + 0.5 * lava), 0.0, 1.2);
    vec3 hot = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.1, 0.5, temp));
    hot = mix(hot, vec3(1.0, 0.92, 0.6), smoothstep(0.5, 1.0, temp));
    hot = mix(hot, hot * imgPalette(0.05 + hueP * 0.159) * 1.6, 0.12);

    // The crust: the photo itself, cooled and dark, a faint heat glow from below.
    vec3 crust = img(mirrorUV(uv)) * 0.22 + imgLod(uv, 4.0) * 0.06;
    crust *= 0.6 + 0.4 * (1.0 - lava);
    vec3 col = crust + vec3(0.25, 0.04, 0.0) * smoothstep(-0.02, 0.06, valley) * 0.6;
    col += vec3(0.9, 0.2, 0.02) * rim * 0.9 * pulse;
    col = mix(col, hot * 2.0, lava);
    // Sparks: round points rising above the hottest cracks.
    vec2 g = uv * 70.0 + vec2(0.0, -sceneTime * 1.5), gi = floor(g), gf = fract(g);
    vec2 gc = 0.25 + 0.5 * hash22(gi);
    float spark = smoothstep(0.12, 0.0, length(gf - gc)) * step(0.93, hash21(gi + 3.0));
    col += vec3(1.0, 0.7, 0.3) * spark * lava * (0.3 + 1.2 * hi);
    finish(col);
}

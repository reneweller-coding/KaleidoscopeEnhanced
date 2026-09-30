#version 330 core
out vec4 fragColor;
/**
 * @file TextureBoreTunnel.frag
 * @brief TEXTURE BORE TUNNEL: a drill bore through the photograph -- the
 * tunnel's wall IS the texture, raised into a relief whose ridges and
 * grooves catch the light of a lamp travelling with the camera, rifled by
 * helical grooves, and far ahead the exit glows.  Like the original Tunnel
 * the picture is an endless polar field: it continues past the frame edges
 * and mirrors without seams, and every photo of the pool gives a different
 * bore (meteorite iron, basalt, felt, glaze ...).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the forward drive (integrated, jump-free)
 *   audioPhase      -> slow roll of the bore (integrated)
 *   audioSpread     -> throat depth: how steeply the wall runs to the exit
 *   audioMode       -> cross-section: round in minor, squarer in major
 *   audioRoughness  -> the wall ripples along the radius
 *   audioRolloff    -> colour temperature of the lamp
 *   audioBass       -> the glow of the exit (light)
 *   audioHigh       -> glints on the ridges (light)
 *   audioSwell      -> the lamp's reach (slow)
 *
 * Knobs: sidesP (texture repeats around the wall), twistP (rifling twist),
 * reliefP (relief depth), hueP.
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
uniform float audioMode;
uniform float audioRoughness;
uniform float audioRolloff;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;

uniform float sidesP;
uniform float twistP;
uniform float reliefP;
uniform float hueP;
// @expr reliefP = clamp(0.35 + 0.4*swell + 0.15*seed2, 0.0, 1.0)

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
    vec2 p = screenP() * 4.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    // Cross-section: a superellipse between circle and rounded square.
    float powV = mix(1.0, 2.2, clamp(audioMode, 0.0, 1.0));
    float r = pow(pow(abs(p.x), 2.0 * powV) + pow(abs(p.y), 2.0 * powV), 1.0 / (2.0 * powV));
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.35 * audioPhase;

    // Depth along the bore and the angle around it.
    float throat = 0.55 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / max(r, 1e-3);
    float k = 2.0 * (1.0 + floor(clamp(sidesP, 0.0, 0.999) * 4.0));   // 2,4,6,8 repeats around
    float u = z + 0.35 * sceneTime + audioAdvance;
    float v = a / 6.2831853 * k + 0.035 * rough * sin(r * 7.5);
    vec2 tuv = vec2(v, u * 1.4);

    // Mip level from the footprint, so the far wall never shimmers.
    // (the angle jumps at the branch cut, so its footprint comes from cos/sin)
    float da = length(fwidth(vec2(cos(a), sin(a))));
    float fp = max(da * k / 6.2831853, fwidth(tuv.y)) * 1024.0;
    float lod = clamp(log2(max(fp, 1.0)), 0.0, 9.0);
    vec3 wall = imgScroll(tuv, lod);
    // Relief: height and gradient from the photo; the lamp sits at the camera,
    // so light falls on the wall from the tunnel axis.
    float relief = 0.3 + 1.2 * clamp(reliefP, 0.0, 1.0);
    vec2 g = texGrad(tuv, lod + 1.5) * 0.02 * relief;
    vec3 n = normalize(vec3(-g.x, -g.y, 1.0));
    vec3 L = normalize(vec3(0.35 * sin(sceneTime * 0.05), 0.6, 1.0));
    float dif = 0.35 + 0.65 * max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);

    // Rifling: helical grooves twisting down the bore.
    float twist = mix(-1.5, 1.5, clamp(twistP, 0.0, 1.0));
    float rifle = 0.5 + 0.5 * cos((v * 6.2831853 / k * 6.0) + u * twist * 6.2831853);
    float groove = smoothstep(0.75, 1.0, rifle);
    float rifleAA = smoothstep(0.6, 0.15, fwidth(u * twist) + 0.02);

    // The lamp's reach: the wall fades into darkness with depth, then the exit glows.
    float reach = exp(-z * mix(1.1, 0.7, swell));
    float h = texHeight(tuv, lod + 2.0, 0.4);
    vec3 lampC = mix(vec3(0.75, 0.85, 1.1), vec3(1.15, 0.95, 0.75), clamp(audioRolloff, 0.0, 1.0));
    // Coloured light: the wall takes a hue from the photo (or a wandering hue
    // field where the photo is grey), strongest in the lit ridges.
    lampC *= mix(vec3(1.0), glowColour(imgLod(tuv, 6.0), vec2(cos(a), sin(a)) * 0.9 + vec2(u * 0.05, 0.0), hueP * 0.159) * 1.4, 0.45);
    vec3 col = wall * dif * lampC * reach * (1.0 - 0.45 * groove * rifleAA) * (0.55 + 0.6 * h);
    col += vec3(1.0, 0.95, 0.85) * spec * reach * (0.25 + 0.9 * hi) * rifleAA;
    // The exit: a glow at the vanishing point, coloured by the photo.
    vec3 exitC = mix(vec3(1.0, 0.8, 0.55), imgPalette(0.1 + hueP * 0.159) * 1.4, 0.5);
    col += exitC * exp(-r * 2.2) * (0.5 + 1.0 * bass);
    finish(col);
}

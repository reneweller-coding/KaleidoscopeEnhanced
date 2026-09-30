#version 330 core
out vec4 fragColor;
/**
 * @file TextureSquareShaft.frag
 * @brief TEXTURE SQUARE SHAFT: flying down an endless square shaft whose
 * four walls are lined with the photograph -- the shaft twists slowly
 * around its axis as it goes deeper, so the corners spiral away into the
 * distance; the corners are lit by lines of light with pulses racing
 * along them, square frames of light rush past, and the far end glows.
 * Each wall is shaded by its own angle to a slowly circling light.  The
 * walls continue beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight down the shaft (integrated, jump-free)
 *   audioPhase      -> the shaft's roll (integrated)
 *   audioSpread     -> how strongly the shaft twists with depth
 *   audioKick       -> pulses on the corner lines and frames (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the glow at the far end (slow)
 *
 * Knobs: twistP, frameP (frame spacing), wallZoomP, hueP.
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
uniform float audioKick;
uniform float audioMode;
uniform float audioSwell;

uniform float twistP;
uniform float frameP;
uniform float wallZoomP;
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
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float travel = 0.4 * sceneTime + 3.0 * audioAdvance;
    float roll = 0.03 * sceneTime + 0.3 * audioPhase;
    float tw = (0.04 + 0.12 * clamp(twistP, 0.0, 1.0)) * (0.5 + clamp(audioSpread, 0.0, 1.0));
    // Depth by fixed point: the square's rotation depends on its depth.
    float z = 1.0 / max(length(p), 1e-3);
    vec2 r = p;
    for (int i = 0; i < 4; ++i) {
        r = rot2(roll + tw * z) * p;
        z = 0.5 / max(max(abs(r.x), abs(r.y)), 1e-3);
    }
    // Which wall, and where along it: a perimeter coordinate that runs on
    // continuously around the four walls (0..8).
    float per;
    if (abs(r.x) > abs(r.y)) per = r.x > 0.0 ? 1.0 + r.y / abs(r.x) : 5.0 - r.y / abs(r.x);
    else                     per = r.y > 0.0 ? 3.0 - r.x / abs(r.y) : 7.0 + r.x / abs(r.y);
    per = mod(per + 1.0, 8.0);                                   // wall k spans [2k, 2k+2]
    float wall = floor(per * 0.5);                               // (space, not time)
    float s = per - 2.0 * wall - 1.0;                            // -1..1 across the wall
    // The photo on the walls (mirror period 2 -> the wrap at 8 is seamless).
    float wz = 0.3 + 0.5 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(per * 0.5, (z + travel) * wz);              // 8 * 0.5 = 4: whole mirror periods
    float fwP = min(fwidth(per), fwidth(mod(per + 4.0, 8.0)));
    float fw = max(fwP * 0.5, fwidth(z) * wz) * 1024.0;
    vec3 wallC = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    // Wall shading from a slowly circling light.
    float wa = wall * 1.5707963 + roll;
    float lightA = 0.2 * sceneTime;
    float shade = 0.7 + 0.35 * cos(wa - lightA);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.6, 0.8, 1.1), vec3(1.15, 0.85, 0.55), mode);
    vec3 glowC = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.05, 0.0), hueP * 0.159);
    vec3 col = wallC * shade * lc * 1.2;
    // Corner lines with pulses racing along.
    float px = fwP * 1.5 + 1e-4;
    float corner = exp(-pow((1.0 - abs(s)) / px, 2.0) * 0.5);
    float pulse = pow(0.5 + 0.5 * sin((z + travel) * 1.5 - 4.0 * sceneTime + wall * 1.3), 8.0);
    col += glowC * corner * (0.4 + (1.0 + 1.5 * kick) * pulse);
    // Frames of light every few units.
    float fs = 0.8 + 1.6 * clamp(frameP, 0.0, 1.0);
    float fz = (z + travel) / fs;
    float fd = abs(fract(fz) - 0.5) * 2.0;                     // 1 at a frame
    float frame = smoothstep(1.0 - fwidth(fz) * 3.0, 1.0, fd);
    col += mix(glowC, vec3(1.0), 0.3) * frame * (0.5 + 1.2 * kick);
    // Depth fog to the glowing end.
    float fog = exp(-z * 0.18);
    vec3 endC = glowC * (0.25 + 0.6 * swell);
    col = mix(endC, col, fog);
    col += endC * exp(-length(p) * 12.0) * 1.5;
    finish(col);
}

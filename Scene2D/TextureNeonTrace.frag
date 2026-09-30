#version 330 core
out vec4 fragColor;
/**
 * @file TextureNeonTrace.frag
 * @brief TEXTURE NEON TRACE: the photograph redrawn in neon -- every strong
 * edge of the texture becomes a glowing tube, the tubes bend along the
 * material's own contours (the grain of wood, the cracks in a glaze, the
 * fibres of felt), each with its halo in the dark, and between them the
 * photo itself lies dim and wet, catching the glow as reflections.  Waves
 * of light run through the tubes; the whole field drifts slowly, so the
 * picture is endless and mirrors without seams.  Every photo of the pool
 * gives a different neon drawing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> which edges light: wide spectrum brings in the fine ones
 *   audioMode       -> the tube colours: cool in minor, warm in major
 *   audioRoughness  -> the tubes shiver (a fine stetig ripple along them)
 *   audioAdvance    -> the light waves running through the tubes (integrated)
 *   audioKick       -> the tubes flare (light)
 *   audioSwell      -> the halos widen (slow)
 *
 * Knobs: scaleP (how close we are), detailP (fine or coarse edges), waveP
 * (the pattern of the light waves), hueP.
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
uniform float audioMode;
uniform float audioRoughness;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;

uniform float scaleP;
uniform float detailP;
uniform float waveP;
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
    float kick = clamp(audioKick, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    // The field: the photo at a scale, drifting slowly (endless, mirrored repeat).
    float sc = 0.7 + 0.9 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * sc + vec2(0.013, 0.007) * sceneTime + 0.5;
    uv += 0.004 * rough * vec2(sin(uv.y * 90.0 + sceneTime), cos(uv.x * 90.0 + sceneTime));

    // Edges at two scales; the spectrum's width brings in the fine ones.
    float lodC = 3.5 - 1.5 * clamp(detailP, 0.0, 1.0);
    float eC = texEdge(uv, lodC);
    float eF = texEdge(uv, lodC - 1.0);
    float fine = clamp(audioSpread, 0.0, 1.0);
    float e = max(eC, eF * (0.35 + 0.65 * fine));
    // Tubes: a thin core where the edge is strong, a halo around it.
    // Only the strongest edges become tubes; a slow noise field lets whole
    // regions go dark so the tubes stand in black, not in a grey hatching.
    float gate = smoothstep(0.3, 0.55, fbm3(uv * 1.3 + 0.02 * sceneTime));
    float core = smoothstep(0.55, 0.9, e) * gate;
    float halo = smoothstep(0.25, 0.9, e) * gate * (0.5 + 0.8 * swell);

    // Colour of the tube: from the photo's hue at the broad scale, pushed to
    // neon saturation; minor cooler, major warmer.
    vec3 base = imgLod(uv, 5.0);
    vec3 neon = glowColour(base, uv * 2.0, hueP * 0.159) * 1.3;
    vec3 warm = vec3(1.0, 0.45, 0.25), cool = vec3(0.25, 0.6, 1.0);
    neon = mix(neon, mix(cool, warm, clamp(audioMode, 0.0, 1.0)), 0.25);
    neon = mix(neon, imgPalette(0.3 + hueP * 0.159) * 1.5, 0.15);

    // Waves of light running along the field (integrated, never snapping).
    float wv = mix(3.0, 9.0, clamp(waveP, 0.0, 1.0));
    float wave = 0.55 + 0.45 * sin(dot(uv, vec2(wv, wv * 0.6)) + fbm3(uv * 3.0) * 4.0 - 2.0 * audioAdvance - 0.4 * sceneTime);

    // The photo underneath: dark and wet, catching the neon as reflections.
    vec3 under = imgLod(uv, 1.0) * 0.05 + base * 0.03;
    under += neon * halo * 0.08;
    vec3 col = under;
    col += neon * halo * 0.55 * wave;
    col += mix(neon, vec3(1.0), 0.25) * core * (0.8 + 0.8 * wave) * (1.0 + 0.9 * kick);
    finish(col);
}

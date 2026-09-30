#version 330 core
out vec4 fragColor;
/**
 * @file SchillerOverTexture.frag
 * @brief SCHILLER OVER TEXTURE: the photograph turned into labradorite -- a
 * dark polished stone in which, where the light catches the hidden crystal
 * lamellae, sheets of electric blue, teal, gold and violet flash up out of
 * the dark and slide across the surface as the light wanders.  The
 * lamellae follow the photo's own structure: its bands and grain become
 * the planes that light up, so every photo gives a different stone.  The
 * whole surface stays in motion because the light never stops moving;
 * endless, mirroring without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light's path across the stone (integrated, jump-free)
 *   audioMode       -> the flash colours: blue-teal in minor, gold-orange in major (slow blend)
 *   audioSpread     -> how narrow the flash angle is (wide spectrum = broader sheets)
 *   audioRoughness  -> the lamellae break into finer domains
 *   audioHigh       -> sparkle in the flashes (light)
 *   audioSwell      -> overall schiller strength (slow)
 *
 * Knobs: scaleP (how close), domainP (size of the crystal domains),
 * darkP (how dark the host stone), hueP.
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
uniform float audioMode;
uniform float audioSpread;
uniform float audioRoughness;
uniform float audioHigh;
uniform float audioSwell;

uniform float scaleP;
uniform float domainP;
uniform float darkP;
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
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float sc = 0.7 + 0.8 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * sc + 0.5 + vec2(0.004, -0.003) * sceneTime;

    // Host stone: the photo, darkened and cooled.
    vec3 photo = img(mirrorUV(uv));
    float dk = 0.25 + 0.35 * (1.0 - clamp(darkP, 0.0, 1.0));
    vec3 host = mix(vec3(luma(photo)), photo, 0.5) * dk;

    // Lamella orientation: a smooth field (large sheets that bend), broken
    // into finer domains by the roughness, bent further by the photo's own
    // gradient -- no hard cell edges.
    float dsz = 1.2 + 2.0 * clamp(domainP, 0.0, 1.0) + 2.5 * clamp(audioRoughness, 0.0, 1.0);
    vec2 tilt = vec2(fbm(uv * dsz + 3.0), fbm(uv * dsz + 11.0)) * 1.6 - 0.8;
    vec2 g = texGrad(uv, 3.5) * 0.02;
    vec3 n = normalize(vec3(tilt + g, 1.0));
    vec2 bid = floor(uv * dsz * 2.0);
    // The wandering light: it moves on a slow Lissajous path.
    float lp = 0.05 * sceneTime + 0.25 * audioPhase;
    vec3 L = normalize(vec3(0.7 * sin(lp), 0.6 * cos(lp * 0.83), 1.0));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ang = dot(n, H);
    float width = mix(40.0, 16.0, clamp(audioSpread, 0.0, 1.0));
    float flash = pow(max(ang, 0.0), width);
    // Interference colour: the lamella spacing varies with the photo and the
    // domain, so each sheet flashes its own spectral colour.
    float spacing = 0.55 + 0.35 * fbm3(uv * dsz * 1.3 + 7.0) + 0.25 * luma(imgLod(uv, 2.0));
    float mode = clamp(audioMode, 0.0, 1.0);
    // Labradorite runs blue -> teal -> green -> gold -> orange with lamella
    // spacing; minor sits on the blue end, major on the gold end.
    float band = clamp((spacing - 0.55) * 1.4 + (1.0 - ang) * 3.0, 0.0, 1.0);
    float hueS = fract(mix(0.62, 0.3, mode) - band * 0.55 + hueP * 0.04);
    vec3 schC = hsv2rgb(vec3(hueS, 0.85, 1.0));
    // Fine striation inside each flash (the lamellae themselves).
    float stri = 0.8 + 0.2 * sin(fbm3(uv * 18.0) * 30.0);
    vec3 col = host * (1.0 - 0.5 * flash) + schC * flash * stri * (1.3 + 1.0 * swell);
    // Sparkle at the brightest points of the flashes.
    vec2 sq = uv * 260.0, si = floor(sq);
    float sp = step(0.93, hash21(si)) * smoothstep(0.35, 0.0, length(fract(sq) - 0.5));
    col += vec3(1.0) * sp * flash * (0.3 + 1.2 * hi);
    // Polish: a faint broad reflection of the room light.
    col += vec3(0.9, 0.95, 1.0) * 0.05 * pow(max(dot(vec3(g, 1.0) / length(vec3(g, 1.0)), H), 0.0), 8.0);
    finish(col);
}

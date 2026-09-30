#version 330 core
out vec4 fragColor;
/**
 * @file TextureConfettiVolume.frag
 * @brief TEXTURE CONFETTI VOLUME: flying through a slow storm of glittering
 * confetti -- countless small metallic flakes (squares, circles and
 * strips) tumble toward the viewer in deep perspective, each catching the
 * light only when it turns flat to us, so the air sparkles in waves; the
 * flakes carry the photograph's colours, far ones tiny and dim, near ones
 * sailing past large and soft.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight through the confetti (integrated, jump-free)
 *   audioSpread     -> the flakes swirl wider
 *   audioKick       -> a wave of flashes (light)
 *   audioMode       -> palette: silver and blue in minor, gold and red in major (tint)
 *   audioHigh       -> sparkle (light)
 *   audioSwell      -> the glow of the air (slow)
 *
 * Knobs: densityP (flakes), sizeP (flake size), photoP (photo colours), hueP.
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
uniform float audioKick;
uniform float audioMode;
uniform float audioHigh;
uniform float audioSwell;

uniform float densityP;
uniform float sizeP;
uniform float photoP;
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
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float travel = 0.4 * sceneTime + 3.0 * audioAdvance;
    vec3 col = glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159) * (0.02 + 0.06 * swell) * exp(-length(p));
    // Depth slices: each slice a layer of flakes at depth z (cycling toward the viewer).
    float pxp = fwidth(p.x);                                    // derivatives before any branch
    const int NS = 10;
    float dz = 1.0;
    float z0 = fract(travel / dz);
    for (int i = NS - 1; i >= 0; --i) {                         // far to near
        float fi = float(i);
        float z = (fi + 1.0 - z0) * dz;                         // depth of this slice
        float sliceId = floor(travel / dz) + fi;
        float fade = smoothstep(float(NS) * dz, float(NS) * dz - 2.0, z) * smoothstep(0.2, 0.6, z);
        vec2 q = p * z * (3.0 - 1.5 * clamp(sizeP, 0.0, 1.0));   // perspective: the slice's plane
        float swirl = (0.2 + 0.5 * clamp(audioSpread, 0.0, 1.0));
        q += swirl * vec2(sin(sliceId * 1.3 + 0.2 * sceneTime), cos(sliceId * 0.7 - 0.15 * sceneTime));
        vec2 gi = floor(q);
        vec2 f = fract(q) - 0.5;
        float h = hash21(gi + sliceId * 7.13);
        if (h > 0.25 + 0.5 * clamp(densityP, 0.0, 1.0)) continue;
        vec2 c = 0.3 * (hash22(gi + sliceId) - 0.5);
        float rot = sceneTime * (1.0 + 2.0 * h) + h * 6.28;
        float flip = cos(sceneTime * (1.3 + 2.0 * fract(h * 7.0)) + h * 11.0);
        vec2 l = rot2(rot) * (f - c);
        l.y /= max(abs(flip), 0.1);
        float kind = fract(h * 13.0);
        float s = 0.12;
        float sd;
        if (kind < 0.4) sd = max(abs(l.x), abs(l.y)) - s;                           // square
        else if (kind < 0.7) sd = length(l) - s;                                    // circle
        else sd = max(abs(l.x) - s * 2.0, abs(l.y) - s * 0.35);                     // strip
        float px = pxp * z * (3.0 - 1.5 * clamp(sizeP, 0.0, 1.0)) * 1.2;
        float flake = smoothstep(px, -px, sd);
        if (flake <= 0.0) continue;
        vec3 pc = imgLod(gi * 0.07 + 0.5 + sliceId * 0.013, 3.0);
        vec3 metal = mix(mix(vec3(0.75, 0.8, 0.9), vec3(0.3, 0.45, 0.9), step(0.5, fract(h * 3.0))), mix(vec3(1.0, 0.78, 0.3), vec3(0.9, 0.2, 0.2), step(0.5, fract(h * 3.0))), mode);
        vec3 fc = mix(metal, glowColour(pc, gi, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.7);
        // Glint when it turns flat toward us.
        float glint = pow(abs(flip), 80.0);
        float wave = kick * exp(-pow(fract(sliceId * 0.1 - sceneTime * 0.2) - 0.5, 2.0) * 20.0);
        vec3 c3 = fc * (0.35 + 0.4 * abs(flip)) + mix(fc, vec3(1.0), 0.5) * glint * (0.5 + 1.0 * hi + 2.0 * wave);
        col = mix(col, c3 * fade, flake * fade);
    }
    finish(col);
}

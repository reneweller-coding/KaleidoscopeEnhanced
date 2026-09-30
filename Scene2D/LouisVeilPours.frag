#version 330 core
out vec4 fragColor;
/**
 * @file LouisVeilPours.frag
 * @brief LOUIS VEIL POURS: after Morris Louis's "Veils" -- translucent sheets
 * of thinned acrylic poured over one another, each a flowing curtain of
 * colour with soft, tide-marked edges, the layers glazing into deeper
 * colours where they overlap; the pours keep coming, each veil flowing
 * across and slowly fading as newer ones cover it.  The colours come from
 * the photograph; the raw canvas shows where no paint reached.  Endless,
 * mirrorable (the veils flow in several directions, no gravity edge).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pours flow (integrated, jump-free)
 *   audioHarmChange -> a new veil begins (smoothed)
 *   audioSpread     -> veil width
 *   audioRoughness  -> the tide lines get more ragged
 *   audioMode       -> the palette warms in major
 *   audioSwell      -> saturation (slow)
 *
 * Knobs: layersP (how many veils), glazeP (transparency), canvasP (raw canvas), hueP.
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
uniform float audioHarmChange;
uniform float audioSpread;
uniform float audioRoughness;
uniform float audioMode;
uniform float audioSwell;

uniform float layersP;
uniform float glazeP;
uniform float canvasP;
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
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.3 * audioAdvance + 0.1 * clamp(audioHarmChange, 0.0, 1.0);
    vec3 canvas = vec3(0.9, 0.87, 0.8) * (0.95 + 0.05 * noise2(p * 300.0));
    vec3 col = canvas;
    int nV = 4 + int(clamp(layersP, 0.0, 1.0) * 3.99);
    float glaze = 0.5 + 0.4 * clamp(glazeP, 0.0, 1.0);
    for (int k = 0; k < 8; ++k) {
        if (k >= nV) break;
        float fk = float(k);
        float life = fract(T + fk / float(nV));
        float gen = floor(T + fk / float(nV));
        float id = gen * 7.0 + fk;
        // A veil: a fan of many narrow bands of one colour, flowing out from
        // a source line and spreading, striated along the flow.
        float ang = hash11(id * 1.7) * 6.2831853;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 nrm = vec2(-dir.y, dir.x);
        vec2 src = (hash22(vec2(id, 3.0)) - 0.5) * 1.4 - dir * 0.6;
        vec2 d = p - src;
        float along = dot(d, dir);
        float across = dot(d, nrm) / (0.35 + 0.35 * max(along, 0.0)) ;         // the fan spreads
        float width = 0.5 + 0.4 * clamp(audioSpread, 0.0, 1.0);
        float inFan = smoothstep(width, width * 0.55, abs(across + 0.15 * fbm3(vec2(along * 2.0, id))));
        // Striations: thin streams of thicker pigment inside the veil.
        float stri = 0.65 + 0.35 * fbm3(vec2(across * 9.0 + id, along * 0.6 + rough * 2.0 * noise2(vec2(along * 8.0, across * 8.0))));
        float reach = life * 3.2 + 0.2;
        float front = smoothstep(reach, reach - 0.25 - 0.1 * noise2(vec2(across * 6.0, id)), along) * smoothstep(-0.4, 0.1, along + 0.2 * fbm3(vec2(across * 3.0, id + 9.0)));
        float a = inFan * front * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.6, life);
        float tide = smoothstep(width * 0.85, width, abs(across)) * inFan;
        vec3 ph = imgLod(vec2(id * 0.137, id * 0.091) + 0.5, 5.0);
        float h = (satOf(ph) > 0.2 ? hue_of(ph) : hueP * 0.159) + 0.14 * fk;
        vec3 dye = hsv2rgb(vec3(fract(h + 0.05 * clamp(audioMode, 0.0, 1.0)), 0.5 + 0.35 * swell, 1.0));
        dye = mix(vec3(1.0), dye, stri) * (1.0 - 0.2 * tide);
        col = mix(col, col * mix(vec3(1.0), dye, glaze + 0.25), a);
    }
    col = mix(col, canvas, 0.12 * clamp(canvasP, 0.0, 1.0));
    finish(col * 1.05);
}

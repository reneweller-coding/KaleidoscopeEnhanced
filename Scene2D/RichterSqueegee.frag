#version 330 core
out vec4 fragColor;
/**
 * @file RichterSqueegee.frag
 * @brief RICHTER SQUEEGEE: a painting in the manner of Gerhard Richter's
 * squeegee abstractions, endlessly being made -- broad drags of a rubber
 * blade pull layers of wet oil paint across each other, the upper layer
 * torn open into skips and ridges where the paint underneath shows through,
 * streaked in the direction of the pull, the thick paint catching the
 * light on its crests.  The layers are the photograph: each layer is the
 * photo smeared along the pull, so every photo gives its own palette and
 * structure.  New drags keep sweeping across the canvas; the canvas is an
 * endless field that mirrors without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drags travel (integrated, jump-free)
 *   audioHarmChange -> the tears open wider on chord changes (slow release)
 *   audioSpread     -> the length of the smear (wide spectrum = longer streaks)
 *   audioRoughness  -> the skips get more ragged
 *   audioMode       -> the lower layer warms in major
 *   audioSwell      -> the gloss on the paint ridges (slow)
 *
 * Knobs: layersP (how many layers show), angleP (pull direction), scaleP, hueP.
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
uniform float angleP;
uniform float scaleP;
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

// One layer of paint dragged along direction d: the photo smeared along d
// (sampled along a short line), and its coverage (torn where it skipped).
vec4 paintLayer(vec2 q, vec2 d, float id, float drag, float smear)
{
    // The blade leaves streaks: the paint varies little along the pull, a lot across it.
    vec2 base = q * 0.6 + hash22(vec2(id, 1.0)) * 5.0;
    vec3 c = vec3(0.0);
    for (int k = 0; k < 5; ++k) {
        float t = (float(k) / 4.0 - 0.5) * smear;
        c += imgLod(base + d * (t - drag * 0.3), 1.5);
    }
    c /= 5.0;
    return vec4(c, 1.0);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sc = 0.8 + 0.8 * clamp(scaleP, 0.0, 1.0);
    vec2 q = p * sc;
    float smear = 0.15 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float drag = 0.08 * sceneTime + 0.6 * audioAdvance;
    float tear = 0.04 * clamp(audioHarmChange, 0.0, 1.0);
    int nL = 2 + int(clamp(layersP, 0.0, 1.0) * 2.99);

    // Ground layer: the photo, smeared horizontally, the warmest colours.
    float ang0 = (clamp(angleP, 0.0, 1.0) - 0.5) * 0.6;
    vec2 d0 = vec2(cos(ang0), sin(ang0));
    vec4 g = paintLayer(q, d0, 0.0, drag * 0.5, smear);
    vec3 col = g.rgb * mix(vec3(0.95, 1.0, 1.1), vec3(1.15, 1.0, 0.85), clamp(audioMode, 0.0, 1.0));
    float height = 0.0;
    // Upper layers dragged over it, each torn open where the blade skipped.
    for (int i = 1; i < 4; ++i) {
        if (i >= nL) break;
        float fi = float(i);
        float ang = ang0 + (fi - 1.5) * 0.25 + 1.5708 * step(2.5, fi);
        vec2 d = vec2(cos(ang), sin(ang));
        vec4 L = paintLayer(q + vec2(fi * 3.7, fi * 1.3), d, fi, drag * (1.0 + 0.3 * fi), smear);
        vec2 n = vec2(-d.y, d.x);
        float skip = fbm(vec2(dot(q, d) * 1.2 - drag * (1.0 + 0.3 * fi), dot(q, n) * 9.0) + fi * 3.0);
        skip += 0.25 * rough * (noise2(vec2(dot(q, d) * 3.6, dot(q, n) * 54.0) + fi) - 0.5);
        float thr = 0.46 + tear - 0.02 * fi;
        float cov = smoothstep(thr - 0.02, thr + 0.02, skip);
        float ridge = exp(-pow((skip - thr - 0.02) / 0.025, 2.0));
        // Colour of the layer: the photo, pushed toward a distinct hue per layer.
        vec3 lc = mix(L.rgb, glowColour(L.rgb, q * 0.4 + fi, hueP * 0.159 + fi * 0.21) * (0.35 + 0.9 * luma(L.rgb)), 0.45);
        col = mix(col, lc, cov);
        height = mix(height, 0.3 + 0.2 * fi, cov) + ridge * 0.4;
    }
    // Wet oil: gloss on the ridges and the streak texture, lit from the upper left.
    float e = 1.5 / resolution.y;
    float streaks = noise2(vec2(dot(q, d0) * 4.0, dot(q, vec2(-d0.y, d0.x)) * 180.0));
    col *= 0.88 + 0.24 * streaks;
    float hx = dFdx(height), hy = dFdy(height);
    vec3 nrm = normalize(vec3(-hx, -hy, e * 4.0));
    float spec = pow(max(dot(reflect(normalize(vec3(0.5, -0.6, -1.0)), nrm), vec3(0.0, 0.0, 1.0)), 0.0), 20.0);
    col += vec3(1.0) * spec * (0.15 + 0.35 * swell);
    col = mix(vec3(luma(col)), col, 1.3);
    finish(col * 1.1);
}

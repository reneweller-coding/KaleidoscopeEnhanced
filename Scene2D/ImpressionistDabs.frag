#version 330 core
out vec4 fragColor;
/**
 * @file ImpressionistDabs.frag
 * @brief IMPRESSIONIST DABS: the photograph repainted in short broken
 * brushstrokes, Monet-style -- every stroke a small comma of paint laid
 * along the picture's forms, its colour taken from the photo but split
 * into pure touches (a warm and a cool neighbour hue side by side), with
 * thick impasto edges catching the light; the strokes slowly shimmer and
 * re-lay as the light of the day changes, the picture drifting beneath.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the picture drifts and the strokes re-lay (integrated)
 *   audioSpread     -> stroke length
 *   audioKick       -> the impasto highlights flare (light)
 *   audioMode       -> the light of the day: blue morning in minor, golden afternoon in major
 *   audioRoughness  -> the colour splitting (more broken colour)
 *   audioSwell      -> the canvas showing between strokes (slow)
 *
 * Knobs: dabP (stroke size), flowP (strokes follow forms), vividP (colour intensity), hueP.
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
uniform float audioRoughness;
uniform float audioSwell;

uniform float dabP;
uniform float flowP;
uniform float vividP;
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
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 drift = vec2(0.004, 0.002) * sceneTime + vec2(0.03, 0.01) * audioAdvance;
    float S = 40.0 + 40.0 * (1.0 - clamp(dabP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gi = floor(g);
    vec3 canvas = vec3(0.88, 0.84, 0.75);
    vec3 col = canvas * (0.9 + 0.1 * noise2(p * 400.0));
    float best = 1e3;
    float len = 0.9 + 0.9 * clamp(audioSpread, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        for (int k = 0; k < 2; ++k) {
            float fk = float(k);
            vec2 hh = hash22(id + fk * 7.3);
            // Strokes re-lay slowly: each has a life cycle, fading as a new one appears.
            float cyc = T * (0.5 + 0.5 * hh.x) + hh.y * 3.0;
            float life = fract(cyc);
            float gen = floor(cyc);
            vec2 c = id + hash22(id + gen * 1.3 + fk * 3.1);
            vec2 cw = c / S;
            vec2 uv = cw * 0.6 + 0.5 + drift;
            vec3 ph = imgLod(uv, 2.0);
            // Direction: along the forms (perpendicular to the gradient), plus a painter's tilt.
            vec2 gr = texGrad(uv, 3.5);
            float ang = atan(gr.x, -gr.y) * clamp(flowP + 0.2, 0.0, 1.0) + 0.6 * (1.0 - clamp(flowP, 0.0, 1.0)) + (hh.x - 0.5) * 0.6;
            vec2 d = rot2(-ang) * (g - c);
            float L = len * (0.6 + 0.5 * hh.y), W = 0.3 + 0.15 * hh.x;
            // Comma shape: a capsule thicker at the start.
            float tpos = clamp(d.x / L + 0.5, 0.0, 1.0);
            float wd = W * (1.1 - 0.5 * tpos);
            float sd = length(vec2(max(abs(d.x) - L * 0.5, 0.0), d.y)) - wd;
            float alpha = smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.8, life);
            // Colour: the photo's colour split into a warm or a cool touch.
            float sp = (0.05 + 0.12 * rough) * (fk * 2.0 - 1.0);
            vec3 hsvC = vec3(hue_of(ph) + sp, clamp(satOf(ph) * (1.2 + 0.8 * clamp(vividP, 0.0, 1.0)), 0.0, 1.0), max(max(ph.r, ph.g), ph.b));
            vec3 pc = hsv2rgb(vec3(fract(hsvC.x + hueP * 0.159 * 0.2), hsvC.y, hsvC.z));
            pc *= mix(vec3(0.85, 0.92, 1.1), vec3(1.12, 0.98, 0.82), mode);
            float px = fwidth(g.x);
            float inside = smoothstep(px, -px, sd) * alpha;
            // Stack: later (higher score) strokes over earlier ones.
            float score = hash21(id + fk + gen * 0.1);
            if (inside > 0.01 && score < best + 2.0) {
                // Impasto: ridge along the stroke's edge, lit from the upper left.
                float edge = smoothstep(-0.12, 0.0, sd);
                vec3 paint = pc * (0.85 + 0.25 * noise2(d * vec2(3.0, 12.0) + id));
                paint += vec3(1.0) * edge * max(0.0, dot(normalize(vec2(d.y, 0.3)), vec2(-0.7, 0.7))) * (0.1 + 0.4 * kick);
                col = mix(col, paint, inside * (1.0 - 0.4 * swell * (1.0 - smoothstep(-0.3, -0.1, sd))));
                best = min(best, score);
            }
        }
    }
    finish(col);
}

#version 330 core
out vec4 fragColor;
/**
 * @file TextureConformalMorph.frag
 * @brief TEXTURE CONFORMAL MORPH: the photograph streams in a double spiral
 * between two wandering poles -- out of one point it unrolls, spirals
 * around, and winds down into the other, endlessly repeated and ever
 * smaller toward both poles, like an Escher double spiral; the map is
 * conformal (every tiny piece of the photo keeps its true shape), the
 * poles drift across the screen and the spiral's pitch slowly changes.
 * Continues beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stream from pole to pole (integrated, jump-free)
 *   audioPhase      -> the stream turns around the poles (integrated)
 *   audioSpread     -> the poles move apart
 *   audioKick       -> the pole glow flares (light)
 *   audioMode       -> colour temperature: cool in minor, warm in major
 *   audioHigh       -> the seams between repeats glint (light)
 *
 * Knobs: twistP (spiral pitch: 1 or 2 turns per repeat, blended), repeatP (photo size), glowP (pole glow), hueP.
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
uniform float audioHigh;

uniform float twistP;
uniform float repeatP;
uniform float glowP;
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

vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }

// The photo along the spiral lattice for integer winding (A, B); returns colour.
vec3 spiralSample(vec2 L, vec2 dL, float A, float B, float zoom, float flow, float turn, float px, out float seam)
{
    // Similarity M maps the log's 2*pi jump (0, 2pi) onto (2A, 2B) -> seamless.
    float k = length(vec2(A, B)) / 3.14159265;
    float th = atan(-A, B);
    mat2 M = k * mat2(cos(th), sin(th), -sin(th), cos(th));
    vec2 uv = M * L;
    uv = uv * zoom + vec2(flow, turn);
    float s = k * zoom * length(dL);                            // photo units per pixel
    float lod = clamp(log2(max(s * px * 1024.0, 1.0)), 0.0, 9.0);
    vec2 fr = abs(fract(uv * 0.5 + 0.5) - 0.5) * 2.0;           // 1 at mirror folds
    seam = exp(-(1.0 - max(fr.x, fr.y)) / max(s * px * 2.0, 1e-4));
    return imgLod(uv, lod);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float sep = 0.22 + 0.18 * clamp(audioSpread, 0.0, 1.0);
    vec2 mid = 0.15 * vec2(sin(0.011 * sceneTime), cos(0.009 * sceneTime));
    float ang = 0.02 * sceneTime + 0.1 * audioPhase;
    vec2 a = mid + sep * vec2(cos(ang), sin(ang));
    vec2 b = mid - sep * vec2(cos(ang), sin(ang));
    // w = log((z - a) / (z - b)) : the two poles.
    vec2 q = cdiv(p - a, p - b);
    vec2 L = vec2(0.5 * log(max(dot(q, q), 1e-12)), atan(q.y, q.x));
    // |dw/dz| = |1/(z-a) - 1/(z-b)| = |a-b| / (|z-a||z-b|)
    float dmag = length(a - b) / max(length(p - a) * length(p - b), 1e-5);
    vec2 dL = vec2(dmag, 0.0);
    float zoom = 1.0 + 1.5 * clamp(repeatP, 0.0, 1.0);
    float flow = 0.08 * sceneTime + 0.6 * audioAdvance;
    float turn = 0.02 * sceneTime + 0.2 * audioPhase;
    float px = 1.0 / resolution.y;
    float sA, sB;
    vec3 c1 = spiralSample(L, dL, 1.0, 1.0, zoom, flow, turn, px, sA);
    vec3 c2 = spiralSample(L, dL, 1.0, 2.0, zoom, flow, turn, px, sB);
    float tw = clamp(twistP, 0.0, 1.0);
    float wmix = smoothstep(0.2, 0.8, tw + 0.25 * sin(0.013 * sceneTime));
    vec3 col = mix(c1, c2, wmix);
    float seam = mix(sA, sB, wmix);
    float mode = clamp(audioMode, 0.0, 1.0);
    float lc = luma(col);
    col = max(mix(vec3(lc), col, 1.35), 0.0) * mix(vec3(0.9, 0.97, 1.1), vec3(1.1, 0.97, 0.85), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159);
    col += gc * seam * (0.04 + 0.25 * hi);
    // Glow at the poles hides the infinitely small repeats.
    float g = clamp(glowP, 0.0, 1.0);
    float pa = exp(-length(p - a) * (14.0 - 6.0 * g)), pb = exp(-length(p - b) * (14.0 - 6.0 * g));
    col = mix(col, gc * (0.7 + 1.2 * kick), clamp((pa + pb) * (0.7 + 0.5 * g), 0.0, 1.0));
    finish(col);
}

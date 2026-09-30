#version 330 core
out vec4 fragColor;
/**
 * @file TextureIrisShutter.frag
 * @brief TEXTURE IRIS SHUTTER: an endless nest of camera irises -- a ring of
 * overlapping metal blades (each a sheet of the photograph, polished and
 * darkened like blued steel) forms a turning polygonal aperture that
 * slowly opens and closes; through the aperture lies the next iris, and
 * the next, and we drift inward through them forever.  Each iris has its
 * own blade count and turn; the blades' edges catch a bright line of
 * light.  The blades continue beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift inward (integrated, jump-free)
 *   audioPhase      -> the irises turn (integrated)
 *   audioSpread     -> the apertures open wider
 *   audioKick       -> the blade edges flash (light)
 *   audioMode       -> the steel: cold blue in minor, bronze in major
 *   audioSwell      -> the light shining through from the far centre (slow)
 *
 * Knobs: bladesP (blade count), curveP (blade curvature), photoP (photo on the blades), hueP.
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

uniform float bladesP;
uniform float curveP;
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

// One iris (level m) at local coordinates q: returns colour, alpha (0 in the aperture).
vec4 iris(vec2 q, float m, float px)
{
    float hm = hash11(m * 0.731 + 0.2);
    float N = floor(6.0 + 6.0 * clamp(bladesP + 0.5 * (hm - 0.5), 0.0, 1.0));
    float rot = 0.05 * sceneTime * (hm > 0.5 ? 1.0 : -1.0) + 0.4 * audioPhase + hm * 6.28;
    float R = (0.2 + 0.12 * clamp(audioSpread, 0.0, 1.0)) * (0.8 + 0.25 * sin(0.2 * sceneTime + m * 2.1));
    float curv = (0.3 + 1.2 * clamp(curveP, 0.0, 1.0)) / R * 0.3;
    float halfSide = R * tan(3.14159265 / N);
    // Every blade whose edge lies behind the point covers it; the visible
    // one is chosen by a skewed score, which turns the blade borders into a
    // pinwheel.  The gap to the runner-up shades the overlap.
    float vis = -1.0, dv = 0.0, tv = 0.0;
    float best = 1e3, second = 1e3;
    float skew = 0.9;
    for (int i = 0; i < 16; ++i) {
        if (float(i) >= N) break;
        float ph = rot + float(i) * 6.2831853 / N;
        vec2 n = vec2(cos(ph), sin(ph)), t = vec2(-n.y, n.x);
        float tt = dot(q, t);
        float d = dot(q, n) - R + curv * tt * tt * 0.3;
        if (d <= 0.0) continue;
        float sc = d - skew * tt;
        if (sc < best) { second = best; best = sc; vis = float(i); dv = d; tv = tt; }
        else if (sc < second) second = sc;
    }
    if (vis < 0.0) return vec4(0.0);                            // inside the aperture
    float dn = -(second - best);                                // <= 0, 0 on a blade border
    // The blade: a sheet of the photo in the blade's own frame.
    float ph = rot + vis * 6.2831853 / N;
    vec2 buv = rot2(-ph) * q * 1.2 + vec2(hash11(vis + m * 3.0), hash11(vis * 1.7 + m)) + 0.5;
    vec3 photo = imgLod(buv, 1.5);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 steel = mix(vec3(0.3, 0.45, 0.8), vec3(0.9, 0.55, 0.25), mode);
    vec3 c = mix(steel * (0.4 + 0.8 * luma(photo)), photo * 1.1, 0.5 * clamp(photoP, 0.0, 1.0));
    // Sheen across the blade and shading by its tilt.
    c *= 0.55 + 0.5 * (0.5 + 0.5 * sin(tv * 6.0 / R + vis * 1.3 + 0.1 * sceneTime));
    c *= 0.6 + 0.4 * smoothstep(0.0, R * 0.3, dv);             // shadow near the edge (depth)
    c *= 0.7 + 0.45 * hash11(vis * 3.1 + m);                    // each blade its own tone
    c *= 1.0 - 0.6 * exp(dn / (R * 0.06)) * step(dn, 0.0);     // shadow of the blade lying over it
    vec3 edgeC = glowColour(imgLod(vec2(0.5), 6.0), vec2(m, vis) * 0.3, hueP * 0.159);
    float edge = exp(-dv / (px * 2.5)) + 0.3 * exp(-dv / (px * 12.0));
    c += mix(edgeC, vec3(1.0), 0.4) * edge * (0.5 + 1.3 * clamp(audioKick, 0.0, 1.0));
    return vec4(c, 1.0);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float K = 3.2;
    float flow = 0.05 * sceneTime + 0.3 * audioAdvance;
    float f = fract(flow);
    float m0 = floor(flow);                                  // level identity (matches across the wrap)
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    for (int j = 0; j < 5; ++j) {
        float fj = float(j);
        float size = pow(K, f - fj);
        vec2 q = p / size;
        float px = 1.0 / resolution.y / size;
        vec4 c = iris(q, m0 + fj, px);
        float a = c.a * (j == 0 ? 1.0 - smoothstep(0.75, 1.0, f) : 1.0);
        acc += trans * a * c.rgb;
        trans *= 1.0 - a;
        if (trans < 0.01) break;
    }
    // Light from the far centre.
    vec3 lc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.03 * sceneTime), 0.5), 5.0), p, hueP * 0.159);
    acc += trans * lc * (0.5 + 0.8 * swell);
    finish(acc);
}

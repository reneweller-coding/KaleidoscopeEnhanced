#version 330 core
out vec4 fragColor;
/**
 * @file TextureDelaunayLightNet.frag
 * @brief TEXTURE DELAUNAY LIGHT NET: a living net of light -- glowing nodes
 * drift slowly over the dark photograph and every pair of nearby nodes is
 * joined by a thin luminous thread, fading as they move apart and
 * brightening as they approach, so the web continually re-knits itself;
 * nodes take their colour from the photo beneath them and gather more
 * densely on its bright parts; small triangles between close nodes fill
 * with a faint tinted glow.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the nodes drift (integrated, jump-free)
 *   audioSpread     -> link reach (how far threads span)
 *   audioKick       -> the nodes flash (light)
 *   audioHigh       -> the threads shimmer (light)
 *   audioMode       -> palette: cool in minor, warm in major
 *   audioSwell      -> the triangle fills (slow)
 *
 * Knobs: nodeP (node spacing), threadP (thread brightness), photoP (photo visibility), hueP.
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
uniform float audioHigh;
uniform float audioMode;
uniform float audioSwell;

uniform float nodeP;
uniform float threadP;
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

float gS;
vec2 nodeAt(vec2 id, float T)
{
    vec2 h = hash22(id);
    return id + 0.5 + 0.38 * vec2(sin(T * (0.5 + h.x) + h.y * 6.28), cos(T * (0.4 + h.y) + h.x * 6.28));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gS = 6.0 + 6.0 * clamp(nodeP, 0.0, 1.0);
    vec2 g = p * gS + vec2(0.05, 0.03) * sceneTime;
    vec2 gi = floor(g);
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    vec2 uv0 = p * 0.7 + 0.5;
    vec3 col = imgLod(uv0, 2.0) * (0.03 + 0.12 * clamp(photoP, 0.0, 1.0));
    vec2 P[25]; vec3 C[25];
    for (int j = 0; j < 5; ++j) for (int i = 0; i < 5; ++i) {
        vec2 id = gi + vec2(i - 2, j - 2);
        vec2 c = nodeAt(id, T);
        P[j * 5 + i] = c;
        vec2 cuv = (c - vec2(0.05, 0.03) * sceneTime) / gS * 0.7 + 0.5;
        vec3 pc = glowColour(imgLod(cuv, 3.0), c * 0.1, hueP * 0.159);
        C[j * 5 + i] = mix(pc, pc * mix(vec3(0.7, 0.9, 1.2), vec3(1.2, 0.9, 0.7), mode), 0.5);
    }
    float reach = 1.15 + 0.35 * clamp(audioSpread, 0.0, 1.0);   // <= 1.5 cells: both ends lie in the 5x5 block
    float px = gS / resolution.y * 1.5;
    float thr = 0.3 + 0.7 * clamp(threadP, 0.0, 1.0);
    for (int a = 0; a < 25; ++a) {
        for (int b = a + 1; b < 25; ++b) {
            vec2 ab = P[b] - P[a];
            float L = length(ab);
            if (L > reach) continue;
            float d = sdSeg(g, P[a], P[b]);
            float fade = smoothstep(reach, reach * 0.25, L);
            float shimmer = 0.8 + 0.2 * sin(dot(g - P[a], ab / max(L, 1e-3)) * 20.0 - sceneTime * 4.0) * hi;
            vec2 pa = g - P[a];
            float tpos = clamp(dot(pa, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            vec3 lc = mix(C[a], C[b], tpos);
            col += lc * fade * thr * shimmer * (smoothstep(px * 1.5, 0.0, d) * 1.4 + exp(-d / (px * 5.0)) * 0.25);
        }
    }
    // Triangle fills around the cell's own node and two ring neighbours.
    int ring[9];
    ring[0] = 6; ring[1] = 7; ring[2] = 8; ring[3] = 13; ring[4] = 18; ring[5] = 17; ring[6] = 16; ring[7] = 11; ring[8] = 6;
    for (int a = 0; a < 8; ++a) {
        vec2 A = P[12], B = P[ring[a]], Cc = P[ring[a + 1]];
        vec2 e0 = B - A, e1 = Cc - B, e2 = A - Cc;
        float s0 = e0.x * (g.y - A.y) - e0.y * (g.x - A.x);
        float s1 = e1.x * (g.y - B.y) - e1.y * (g.x - B.x);
        float s2 = e2.x * (g.y - Cc.y) - e2.y * (g.x - Cc.x);
        bool inT = (s0 > 0.0 && s1 > 0.0 && s2 > 0.0) || (s0 < 0.0 && s1 < 0.0 && s2 < 0.0);
        float per = length(e0) + length(e1) + length(e2);
        if (inT && per < reach * 2.4) col += (C[12] + C[ring[a]]) * 0.5 * (0.02 + 0.08 * swell) * smoothstep(reach * 2.4, reach * 1.6, per);
    }
    // Nodes: round glows.
    for (int k = 0; k < 25; ++k) {
        float d = length(g - P[k]);
        col += C[k] * (smoothstep(px * 3.0, px, d) * 1.2 + exp(-d * 8.0) * 0.2) * (0.6 + 1.2 * kick);
    }
    finish(col);
}

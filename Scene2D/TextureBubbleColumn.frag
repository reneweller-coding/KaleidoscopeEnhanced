#version 330 core
out vec4 fragColor;
/**
 * @file TextureBubbleColumn.frag
 * @brief TEXTURE BUBBLE COLUMN: columns of rising bubbles in a dark aquarium
 * -- streams of bubbles of every size well up from below in wavering
 * columns, big ones wobbling and flattening as they rise, small ones
 * racing in tight spirals, each bubble a little mirror with a bright rim
 * and a highlight, catching and bending the coloured light of the
 * photograph behind the glass.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bubbles rise (integrated, jump-free)
 *   audioSpread     -> the columns spread into plumes
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> the water: blue in minor, green-gold in major
 *   audioHigh       -> the small bubbles sparkle (light)
 *   audioSwell      -> the light behind (slow)
 *
 * Knobs: columnP (column spacing), sizeP (bubble size), lensP (lens effect), hueP.
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

uniform float columnP;
uniform float sizeP;
uniform float lensP;
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
    vec3 waterC = mix(vec3(0.1, 0.25, 0.5), vec3(0.2, 0.45, 0.3), mode);
    vec2 uv = p * 0.5 + 0.5;
    vec3 behind = imgLod(uv, 3.0);
    vec3 col = mix(waterC * 0.15, behind * waterC * 1.5, 0.3 + 0.4 * swell);
    float T = 0.25 * sceneTime + 1.5 * audioAdvance;
    float cw = 0.25 + 0.3 * clamp(columnP, 0.0, 1.0);
    float plume = 0.02 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    float pxs = 1.5 / resolution.y;
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);                                    // bubble size class: 0 big .. 2 small
        float R = (0.035 - 0.009 * fl) * (0.7 + 0.6 * clamp(sizeP, 0.0, 1.0));
        float spacing = R * 3.2;
        float colI = floor(p.x / cw + fl * 0.33);
        for (int k = -1; k <= 1; ++k) {
            float ci = colI + float(k);
            float h = hash11(ci * 1.37 + fl * 5.0);
            if (h > 0.7) continue;
            float cx = (ci + 0.5 - fl * 0.33) * cw + 0.08 * sin(p.y * 2.0 + h * 6.28 + T * 0.3);
            float speed = (1.0 + 0.8 * fl) * (0.7 + 0.6 * h);
            float y = p.y + T * speed * 0.3;
            float bi = floor(y / spacing);
            for (int m = -1; m <= 1; ++m) {
                float b = bi + float(m);
                float hb = hash21(vec2(b, ci + fl * 17.0));
                if (hb > 0.75) continue;
                float wob = plume * (hb - 0.5) * 2.0 + (0.01 + 0.02 * fl) * sin(b * 1.7 + T * (3.0 + fl * 3.0));
                vec2 c = vec2(cx + wob, (b + 0.5) * spacing - T * speed * 0.3);
                vec2 d = p - c;
                float Rb = R * (0.7 + 0.6 * hash21(vec2(ci, b) + 3.0));
                // Big bubbles flatten and wobble.
                d.y *= 1.0 + (0.25 - 0.1 * fl) * (0.5 + 0.5 * sin(T * 4.0 + b));
                float r = length(d) / Rb;
                if (r > 1.3) continue;
                float inside = smoothstep(1.0 + pxs / Rb, 1.0 - pxs / Rb, r);
                // Lens: the photo behind, flipped and squeezed.
                vec3 lensC = imgLod(uv - d * (2.0 + 4.0 * clamp(lensP, 0.0, 1.0)), 2.0) * waterC * 1.8;
                float rim = smoothstep(0.75, 1.0, r) * inside;
                float hl = smoothstep(0.35, 0.1, length(d / Rb - vec2(-0.35, 0.35)));
                vec3 bc = mix(lensC * 0.6, mix(waterC, vec3(1.0), 0.6), rim * (0.7 + 0.8 * kick)) + vec3(1.0) * hl * (0.6 + hi * step(1.5, fl) * 1.0);
                col = mix(col, bc, inside);
            }
        }
    }
    col = mix(col, col * glowColour(behind, p, hueP * 0.159) * 1.3, 0.06);
    finish(col);
}

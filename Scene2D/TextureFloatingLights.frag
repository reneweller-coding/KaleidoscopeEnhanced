#version 330 core
out vec4 fragColor;
/**
 * @file TextureFloatingLights.frag
 * @brief TEXTURE FLOATING LIGHTS: a night festival of floating lanterns on a
 * dark lake -- hundreds of small paper lanterns drift on the water in
 * slow currents, each glowing warm from within, its reflection wavering
 * beneath it in the ripples, the far ones tiny sparks near the horizon;
 * the lanterns take their tints from the photograph, which also shows
 * faintly as the far shore's lights reflected in the lake.  Endless
 * sideways, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lanterns drift (integrated, jump-free)
 *   audioSpread     -> the current spreads them
 *   audioKick       -> the lanterns flare (light)
 *   audioMode       -> the light: pale blue in minor, warm amber in major
 *   audioRoughness  -> ripples on the lake
 *   audioSwell      -> the glow on the water (slow)
 *
 * Knobs: densityP (lanterns), sizeP (lantern size), shoreP (photo lights on the shore), hueP.
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

uniform float densityP;
uniform float sizeP;
uniform float shoreP;
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
    float horizon = 0.28;
    vec3 warm = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.62, 0.25), mode);
    vec3 col;
    float yy = p.y - horizon;
    // Sky and shore above the horizon.
    vec3 sky = vec3(0.01, 0.015, 0.04) + vec3(0.02, 0.02, 0.05) * smoothstep(0.4, 0.0, yy);
    vec2 suv = vec2(p.x * 0.5 + 0.5 + 0.002 * sceneTime, 0.3);
    vec3 shore = imgLod(suv + vec2(0.0, max(yy, 0.0) * 2.0), 2.0);
    float shoreBand = smoothstep(0.06, 0.0, yy) * step(0.0, yy);
    col = sky + neonOf(shore + 1e-3, 1.5) * shoreBand * 0.25 * clamp(shoreP + 0.2, 0.0, 1.2);
    // Water-plane quantities computed unconditionally (derivatives must not
    // live in a pixel-dependent branch).
    float d = 0.3 / max(-yy, 0.005);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    vec2 w = vec2(p.x * d, d);                                   // water plane coordinates
    float spread = 0.5 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    w.x += 0.2 * spread * sin(w.y * 0.3 + T);
    vec2 g = w * vec2(1.4, 1.0) * (0.8 + 0.8 * (1.0 - clamp(sizeP, 0.0, 1.0))) + vec2(T * 0.6, -T * 1.2);
    float pxw = fwidth(g.x) + 1e-4;
    if (yy < 0.0) {
        // The lake: ripples distort the reflection.
        float rip = (0.004 + 0.012 * rough) * sin(d * 20.0 + 1.5 * sceneTime + p.x * 30.0) * (1.0 + 0.5 * noise2(vec2(p.x * 20.0, d * 3.0)));
        vec2 ruv = vec2(p.x * 0.5 + 0.5 + rip * 3.0, 0.3 - yy * 2.0);
        vec3 refl = neonOf(imgLod(ruv, 2.5) + 1e-3, 1.5) * smoothstep(0.1, 0.0, -yy) * 0.15 * clamp(shoreP + 0.2, 0.0, 1.2);
        col = vec3(0.005, 0.008, 0.02) + refl;
        // Lanterns: on a perspective grid over the water plane.
        // Each lantern stands upright on the water: find its screen footprint
        // from its plane position (cells around the pixel's plane point; the
        // search reaches one cell further toward the viewer, where lanterns are tall).
        vec2 gi = floor(g);
        float gs = 1.4 * (0.8 + 0.8 * (1.0 - clamp(sizeP, 0.0, 1.0)));
        for (int j = -2; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id);
            if (h > 0.25 + 0.5 * clamp(densityP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.3 * (hash22(id + 2.0) - 0.5);
            // Back to the water plane, then to the screen.
            vec2 wc = (c - vec2(T * 0.6, -T * 1.2)) / vec2(gs, gs / 1.4);
            float dz = wc.y;
            if (dz < 0.5) continue;
            float wx = wc.x - 0.2 * spread * sin(dz * 0.3 + T);
            vec2 base = vec2(wx / dz, horizon - 0.3 / dz);
            float S = 0.12 / dz;                                   // lantern height on screen
            float bob = 0.1 * S * sin(sceneTime * 1.3 + h * 6.28);
            vec2 lb = (p - base - vec2(0.0, S * 0.55 + bob)) / S;
            float px = pxw / gs * dz / S * 0.0 + 1.5 / resolution.y / S;
            // Paper lantern: slightly barrel-shaped, dark caps top and bottom, glowing core.
            float barrel = abs(lb.x) * (1.35 + 0.5 * lb.y * lb.y);
            float body = smoothstep(0.5 + px, 0.5 - px, max(barrel, abs(lb.y)));
            float cap = smoothstep(0.38, 0.42, abs(lb.y));
            float glowIn = (1.0 - 0.6 * length(lb * vec2(1.6, 1.0))) * (1.0 - 0.85 * cap);
            vec2 lr = (p - base + vec2(0.0, S * 0.55 + bob)) / S;
            lr.x += rip * 8.0 / S * 0.1;
            float reflB = smoothstep(0.7, 0.1, length(lr * vec2(1.3, 0.7)));
            vec3 lc = mix(warm, glowColour(imgLod(hash22(id + 5.0), 4.0), id, hueP * 0.159), 0.35);
            float flick = 0.85 + 0.15 * sin(sceneTime * (3.0 + 4.0 * h) + h * 30.0);
            float far = smoothstep(40.0, 15.0, dz);
            col += lc * body * max(glowIn, 0.05) * flick * (1.4 + 1.5 * kick) * far;
            col += lc * reflB * 0.25 * flick * (0.6 + 0.8 * swell) * far;
            col += lc * exp(-length(p - base - vec2(0.0, S * 0.5)) / S * 1.5) * 0.08 * (0.5 + swell) * far;
        }
        // Distance haze.
        col = mix(col, sky * 1.5 + warm * 0.02, smoothstep(10.0, 40.0, d));
    }
    finish(col);
}

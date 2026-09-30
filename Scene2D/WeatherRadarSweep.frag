#version 330 core
out vec4 fragColor;
/**
 * @file WeatherRadarSweep.frag
 * @brief WEATHER RADAR SWEEP: a weather radar screen at night -- the beam
 * sweeps around and around, and in its wake the rain echoes light up in
 * the radar palette (green drizzle, yellow rain, red downpours, magenta
 * hail cores) and slowly fade until the next pass; the echoes are storm
 * cells shaped by the photograph and drifting with the wind; range rings,
 * a faint map (the photo's edges) and the sweep's bright leading line.
 * Several radar sites overlap across the endless plane.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the storms drift (integrated, jump-free)
 *   audioPhase      -> the sweep turns (integrated)
 *   audioSpread     -> the storms grow and intensify
 *   audioKick       -> the leading line flashes (light)
 *   audioMode       -> the screen: green phosphor in minor, modern colour in major
 *   audioSwell      -> the afterglow lasts longer (slow)
 *
 * Knobs: siteP (radar site spacing), stormP (storm density), mapP (map lines), hueP.
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

uniform float siteP;
uniform float stormP;
uniform float mapP;
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

vec3 radarPal(float v)
{
    vec3 c = mix(vec3(0.0, 0.35, 0.1), vec3(0.1, 0.85, 0.2), smoothstep(0.1, 0.3, v));
    c = mix(c, vec3(0.95, 0.9, 0.1), smoothstep(0.35, 0.5, v));
    c = mix(c, vec3(1.0, 0.25, 0.05), smoothstep(0.55, 0.7, v));
    c = mix(c, vec3(0.95, 0.1, 0.85), smoothstep(0.78, 0.9, v));
    return c;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 wind = vec2(0.012, 0.004) * sceneTime + vec2(0.08, 0.03) * audioAdvance;
    // Storm field: photo structure plus noise, drifting.
    vec2 w = p - wind;
    vec2 uv = w * 0.5 + 0.5;
    float storm = 0.6 * luma(imgLod(uv, 4.0)) + 0.6 * fbm(w * 3.0 + 1.3) - 0.35;
    storm += 0.3 * (fbm3(w * 8.0) - 0.5);
    float dens = 0.45 + 0.4 * clamp(stormP, 0.0, 1.0) + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float v = smoothstep(0.55 - dens * 0.5, 1.0, storm);
    // Radar sites on a grid; every site within range sweeps this pixel,
    // the strongest return wins (no hard borders between sites).
    float S = 1.0 + 1.0 * (1.0 - clamp(siteP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gc = floor(g + 0.5);
    float after = 0.0, lead = 0.0, r = 9.0;
    float decay = 0.15 + 0.35 * swell;
    for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
        vec2 si = gc + vec2(ii, jj);
        vec2 l = (g - si) / S;
        float rr = length(l);
        float range = smoothstep(0.75 / S + 0.1, 0.3 / S, rr);
        if (range <= 0.0) continue;
        float a = atan(l.y, l.x);
        float sweep = 0.6 * sceneTime + 3.0 * audioPhase + hash21(si) * 6.28;
        float since = fract((sweep - a) / 6.2831853);           // 0 just swept, 1 about to be swept
        after = max(after, exp(-since / decay) * range);
        lead = max(lead, (exp(-since * 120.0) + exp(-(1.0 - since) * 400.0) * 0.5) * range);
        r = min(r, rr);
    }
    vec3 echo = radarPal(v) * step(0.05, v) * (0.25 + 0.9 * after);
    vec3 phosphor = vec3(0.2, 1.0, 0.35) * (0.2 + 0.8 * v) * step(0.05, v) * (0.25 + 0.9 * after);
    vec3 col = mix(phosphor, echo, mode);
    // Leading line of the sweep.
    vec3 lineC = mix(vec3(0.4, 1.0, 0.5), vec3(0.8, 0.95, 1.0), mode);
    col += lineC * lead * (0.3 + 1.0 * kick);
    // Range rings and map.
    float rings = abs(fract(r * 8.0) - 0.5);
    float rpx = fwidth(r * 8.0) + 1e-4;
    col += lineC * smoothstep(rpx * 1.5, 0.0, 0.5 - rings) * 0.08;
    float mapE = texEdge(p * 0.6 + 0.5, 3.0);
    col += lineC * smoothstep(0.3, 0.8, mapE) * 0.06 * clamp(mapP + 0.2, 0.0, 1.2);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.08);
    col += vec3(0.0, 0.01, 0.015);
    finish(col);
}

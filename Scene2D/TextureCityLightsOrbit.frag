#version 330 core
out vec4 fragColor;
/**
 * @file TextureCityLightsOrbit.frag
 * @brief TEXTURE CITY LIGHTS ORBIT: the Earth at night seen from orbit,
 * gliding slowly beneath -- the photograph becomes a continent: where it
 * is bright, cities sprawl as clusters of countless tiny sodium-orange and
 * white lights, strung together by glowing roads along its edges; its
 * dark areas are sea and wilderness, faintly moonlit; thin clouds drift
 * over it, lit from within now and then by lightning.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the orbit (integrated, jump-free)
 *   audioSpread     -> the cities sprawl further
 *   audioKick       -> lightning in the clouds (light)
 *   audioHigh       -> the lights twinkle through the air (light)
 *   audioMode       -> sodium orange in minor, LED white in major
 *   audioSwell      -> the cloud cover (slow)
 *
 * Knobs: cityP (light density), roadP (road glow), cloudP, hueP.
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

uniform float cityP;
uniform float roadP;
uniform float cloudP;
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
    vec2 orbit = vec2(0.012, 0.004) * sceneTime + vec2(0.08, 0.02) * audioAdvance;
    vec2 w = p + orbit;
    vec2 uv = w * 0.55 + 0.5;
    // Urbanisation from the photo.
    float urb = clamp(luma(imgLod(uv, 3.5)) - luma(imgLod(uv, 7.0)) + 0.5, 0.0, 1.0);
    float urbC = smoothstep(0.5 - 0.12 * clamp(audioSpread, 0.0, 1.0), 0.7, urb + 0.15 * (fbm3(w * 4.0) - 0.5));
    // Ground: dark land and sea, moonlit.
    float land = smoothstep(0.2, 0.35, luma(imgLod(uv, 5.0)));
    vec3 col = mix(vec3(0.005, 0.01, 0.025), vec3(0.02, 0.022, 0.025) + imgLod(uv, 2.0) * 0.03, land);
    vec3 sodium = vec3(1.0, 0.6, 0.2), led = vec3(0.95, 0.95, 1.0);
    vec3 lc = mix(sodium, led, mode);
    lc = mix(lc, glowColour(imgLod(uv, 5.0), w, hueP * 0.159), 0.12);
    // City glow (the bloom of many lights).
    col += lc * urbC * urbC * 0.3;
    // Individual lights: round jittered points in two scales.
    float dens = (0.3 + 0.7 * clamp(cityP, 0.0, 1.0));
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = w * (70.0 + 50.0 * fl) + fl * 9.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl * 3.0);
        vec2 cw = (gi + c - fl * 9.0) / (70.0 + 50.0 * fl);
        vec2 cuv = cw * 0.55 + 0.5;
        float u = smoothstep(0.47 - 0.12 * clamp(audioSpread, 0.0, 1.0), 0.65, luma(imgLod(cuv, 3.5)) - luma(imgLod(cuv, 7.0)) + 0.5 + 0.15 * (fbm3(cw * 4.0) - 0.5));
        float on = step(hash21(gi + 7.0 + fl), u * dens);
        float d = length(gf - c);
        float tw = 0.8 + 0.2 * sin(sceneTime * (3.0 + 4.0 * hash21(gi)) + hash21(gi + 1.0) * 6.28) * hi;
        vec3 tint = mix(lc, mix(sodium, led, step(0.7, hash21(gi + 3.0))), 0.4);
        col += tint * on * (smoothstep(0.28, 0.06, d) * 1.3 + exp(-d * 5.0) * 0.2) * tw * (1.0 - 0.3 * fl);
    }
    // Roads along the photo's edges, between the cities.
    float ed = texEdge(uv, 2.5);
    col += lc * smoothstep(0.25, 0.7, ed) * (0.05 + 0.2 * clamp(roadP, 0.0, 1.0)) * smoothstep(0.35, 0.55, urb);
    // Clouds drifting at their own pace, moonlit, lightning inside.
    vec2 cq = p * 1.4 + vec2(0.02, 0.008) * sceneTime + orbit * 0.6;
    float cl = fbm(cq + 0.5 * vec2(fbm3(cq * 0.8), fbm3(cq * 0.8 + 3.0)));
    float cover = smoothstep(0.62 - 0.2 * clamp(cloudP, 0.0, 1.0) - 0.1 * swell, 0.9, cl);
    vec3 cloudC = vec3(0.05, 0.06, 0.08) + lc * urbC * 0.08;
    // Lightning: one wandering cell flashes with the kick.
    vec2 lp = 0.5 * vec2(sin(0.13 * sceneTime), cos(0.11 * sceneTime));
    float bolt = kick * exp(-length(p - lp) * 4.0) * cover;
    cloudC += vec3(0.7, 0.75, 1.0) * bolt * 1.5;
    col = mix(col, cloudC, cover * 0.85);
    // The thin blue airglow haze.
    col += vec3(0.01, 0.02, 0.05) * (1.0 + length(p));
    finish(col);
}

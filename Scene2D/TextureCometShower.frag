#version 330 core
out vec4 fragColor;
/**
 * @file TextureCometShower.frag
 * @brief TEXTURE COMET SHOWER: a shower of comets across a starry night --
 * bright heads streak diagonally over the sky trailing long curved tails
 * that fan out and fade, some tails split into a straight blue ion tail
 * and a curved golden dust tail; the sky behind is the photograph turned
 * into a deep night with faint stars, and the heads take their colours
 * from it.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the comets fly (integrated, jump-free)
 *   audioSpread     -> tail length
 *   audioKick       -> the heads flare (light)
 *   audioMode       -> palette: icy blue in minor, golden in major
 *   audioHigh       -> the stars twinkle (light)
 *   audioSwell      -> the sky's glow (slow)
 *
 * Knobs: densityP (comets), angleP (flight direction), skyP (photo in the sky), hueP.
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

uniform float densityP;
uniform float angleP;
uniform float skyP;
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
    vec2 uv = p * 0.5 + 0.5 + vec2(0.002, 0.0) * sceneTime;
    vec3 sky = imgLod(uv, 3.0);
    sky = mix(vec3(0.01, 0.015, 0.04), sky * vec3(0.12, 0.14, 0.25), 0.3 + 0.5 * clamp(skyP, 0.0, 1.0)) * (0.7 + 0.6 * swell);
    vec3 col = sky;
    // Stars: round, twinkling.
    vec2 sg = p * 70.0;
    vec2 si = floor(sg);
    float st = smoothstep(0.25, 0.0, length(fract(sg) - 0.25 - 0.5 * hash22(si))) * step(0.94, hash21(si + 1.0));
    col += vec3(0.8, 0.85, 1.0) * st * (0.3 + 0.4 * sin(sceneTime * (1.0 + hash21(si)) + hash21(si + 2.0) * 30.0) * hi + 0.2);
    // Comets: lanes along the flight direction.
    float ang = -0.5 - 0.6 * clamp(angleP, 0.0, 1.0);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p, dir), across = dot(p, nrm);
    float laneW = 0.12 - 0.06 * clamp(densityP, 0.0, 1.0);
    float li = floor(across / laneW);
    float tailL = 0.3 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float fly = 0.4 * sceneTime + 2.5 * audioAdvance;
    vec3 ice = vec3(0.6, 0.85, 1.0), gold = vec3(1.0, 0.8, 0.4);
    for (int k = -1; k <= 1; ++k) {
        float lane = li + float(k);
        float h = hash11(lane * 0.37 + 4.0);
        if (h > 0.6) continue;
        float spd = 0.6 + 0.6 * hash11(lane * 1.3);
        float period = 3.5;
        float hx = mod(fly * spd + h * 10.0, period) - period * 0.5;   // head position along the lane
        float c0 = (lane + 0.5 + 0.3 * (hash11(lane * 2.1) - 0.5)) * laneW;
        float da = along - hx * 1.4;                            // behind the head: da < 0
        float dc = across - c0;
        // Dust tail curves away from the lane; ion tail straight.
        float behind = max(-da, 0.0);
        float curveOff = 0.15 * behind * behind * (h - 0.3);
        float spread = 0.004 + 0.06 * behind / tailL;
        float dust = exp(-pow((dc - curveOff) / spread, 2.0)) * exp(-behind / tailL) * step(da, 0.0);
        float ion = exp(-pow(dc / (0.002 + 0.01 * behind), 2.0)) * exp(-behind / (tailL * 1.5)) * step(da, 0.0);
        float head = exp(-(da * da + dc * dc) / 0.00008);
        float fade = smoothstep(period * 0.5, period * 0.35, abs(hx));   // appear and vanish smoothly at the lane ends
        vec3 hc = glowColour(imgLod(vec2(h, fract(h * 7.0)), 4.0), vec2(lane, 0.0), hueP * 0.159);
        vec3 dustC = mix(mix(ice, gold, mode), hc, 0.3);
        col += (dustC * dust * 0.8 + ice * ion * 0.6 + vec3(1.0) * head * (1.5 + 2.5 * kick)) * fade;
    }
    finish(col);
}

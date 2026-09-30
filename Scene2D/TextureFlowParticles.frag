#version 330 core
out vec4 fragColor;
/**
 * @file TextureFlowParticles.frag
 * @brief TEXTURE FLOW PARTICLES: the photograph dissolved into a river of
 * light particles -- countless fine grains stream along the contours of
 * the texture (the flow runs across its brightness gradient, so it follows
 * the grain of wood, the rings of agate, the veins of marble), each grain
 * carrying the colour of the photo where it is, drawn as a short glowing
 * streak.  Denser streams gather where the texture has strong structure,
 * sparse drift fills the calm areas.  An endless field that mirrors
 * without seams; every photo gives its own current.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the streams' flow (integrated, jump-free)
 *   audioSpread     -> streak length: a wide spectrum draws long threads
 *   audioRoughness  -> turbulence mixed into the flow
 *   audioMode       -> the flow's sense of rotation leans (slow blend)
 *   audioHigh       -> the grains sparkle (light)
 *   audioSwell      -> particle density (slow)
 *
 * Knobs: scaleP (how close), densityP (grains), curlP (share of free
 * turbulence against the photo's own contours), hueP.
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
uniform float audioRoughness;
uniform float audioMode;
uniform float audioHigh;
uniform float audioSwell;

uniform float scaleP;
uniform float densityP;
uniform float curlP;
uniform float hueP;
// @expr densityP = clamp(0.4 + 0.4*swell + 0.2*seed2, 0.0, 1.0)

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

float gCurl, gSc;

// The flow direction at uv: along the texture's contours (perpendicular to
// its luma gradient), blended with a slow curl-noise swirl.
vec2 flowDir(vec2 uv)
{
    vec2 g = texGrad(uv, 5.0);
    vec2 along = vec2(-g.y, g.x);
    float ga = length(along);
    float e = 0.02;
    vec2 cq = uv * 3.0 + 0.02 * sceneTime;
    float n1 = fbm3(cq + vec2(0.0, e)), n2 = fbm3(cq - vec2(0.0, e));
    float n3 = fbm3(cq + vec2(e, 0.0)), n4 = fbm3(cq - vec2(e, 0.0));
    vec2 curl = vec2(n1 - n2, n4 - n3) / (2.0 * e);
    vec2 dA = along / (ga + 1e-4), dC = curl / (length(curl) + 1e-4);
    // Where the photo has structure its contours rule; calm areas swirl freely.
    float w = gCurl * (1.0 - smoothstep(0.1, 0.8, ga));
    vec2 d = normalize(mix(dA, dC, w) + 1e-4);
    return d;
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gSc = 0.6 + 0.9 * clamp(scaleP, 0.0, 1.0);
    gCurl = 0.2 + 0.5 * clamp(curlP, 0.0, 1.0) + 0.2 * clamp(audioRoughness, 0.0, 1.0);
    vec2 uv0 = p * gSc + 0.5 + vec2(0.006, 0.004) * sceneTime;

    // Line-integral: walk backward and forward along the flow, collecting
    // sparse round grains that slide along the streamline with time.
    float len = 0.0025 + 0.003 * clamp(audioSpread, 0.0, 1.0);
    float dens = 0.9 - 0.12 * clamp(densityP, 0.0, 1.0);
    float flow = 0.25 * sceneTime + 2.0 * audioAdvance;
    // Line integral convolution: fine noise averaged along the streamline,
    // both ways; a phase pulse travels along each line with the flow, so the
    // threads visibly stream.  Many thin threads, not a smear.
    float acc = 0.0, wsum = 0.0;
    vec2 uF = uv0, uB = uv0;
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        float w = exp(-fi * fi / 90.0);
        uF += flowDir(uF) * len;
        uB -= flowDir(uB) * len;
        float nF = noise2(uF * 260.0);
        float nB = noise2(uB * 260.0);
        nF *= nF * nF; nB *= nB * nB;                        // sparse bright seeds
        // travelling pulse: phase along the line
        float pF = 0.5 + 0.5 * sin((flow - fi * 0.35) * 2.0);
        float pB = 0.5 + 0.5 * sin((flow + fi * 0.35) * 2.0);
        acc += w * (nF * pF + nB * pB);
        wsum += 2.0 * w;
    }
    float lic = acc / wsum;
    // The average of pulse-weighted noise sits near 0.25; stretch its spread.
    float lc = (lic - 0.07) * 9.0 + 0.4 * (clamp(densityP, 0.0, 1.0) - 0.5);
    float streak = smoothstep(0.0, 1.0, lc) * 1.5;

    // Colour from the photo (saturated where it has colour, a hue field where grey).
    vec3 photo = imgLod(uv0, 2.0);
    vec3 c = mix(photo * 1.2, glowColour(photo, uv0 * 1.5, hueP * 0.159) * 1.3, 0.5);
    vec3 col = photo * 0.08;
    col += c * streak * (0.9 + 0.6 * swell);
    col += vec3(1.0) * pow(clamp(streak, 0.0, 1.0), 3.0) * (0.15 + 0.6 * hi);
    finish(col);
}

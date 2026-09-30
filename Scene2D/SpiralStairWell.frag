#version 330 core
out vec4 fragColor;
/**
 * @file SpiralStairWell.frag
 * @brief SPIRAL STAIR WELL: looking straight down an endless spiral
 * staircase -- the steps wind around the open well in a helix, turn
 * after turn sinking into the depth, each step a slab of the photograph
 * with a bright nosing on its edge, a glowing handrail running along the
 * inner rim, and the well's wall behind the steps; we descend slowly
 * while the whole staircase turns.  Mirrorable; the steps continue
 * beyond the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the descent (integrated, jump-free)
 *   audioPhase      -> the staircase turns (integrated)
 *   audioSpread     -> the well opens wider
 *   audioKick       -> lights along the handrail flare (light)
 *   audioMode       -> the light: cool in minor, warm lamplight in major
 *   audioSwell      -> the glow from the bottom (slow)
 *
 * Knobs: stepsP (steps per turn), pitchP (height per turn), photoP (photo on the steps), hueP.
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

uniform float stepsP;
uniform float pitchP;
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

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float spin = 0.02 * sceneTime + 0.25 * audioPhase;
    p = rot2(spin) * p;
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float Ri = 0.35 + 0.25 * clamp(audioSpread, 0.0, 1.0);    // well radius
    float Ro = 1.0;                                            // wall radius
    float pitch = 0.8 + 1.2 * clamp(pitchP, 0.0, 1.0);         // depth per turn
    float nS = 2.0 * floor(6.0 + 6.0 * clamp(stepsP, 0.0, 1.0)); // steps per turn (even)
    float travel = 0.25 * sceneTime + 1.5 * audioAdvance;
    float af = a / 6.2831853 + 0.5;                            // 0..1 around
    // Step tops sit at depths z = pitch * (floor((af + k) * nS) / nS) - travel.
    float zIn = Ri / r;                                        // the ray reaches the well rim here
    float zOut = Ro / r;                                       // ... and the wall here
    float u0 = (zIn + travel) / pitch;                        // in turns
    float k = ceil(u0 - af);
    float s = floor((af + k) * nS);
    // The first step top at or below zIn (stepped heights may sit just above).
    if (s / nS * pitch - travel < zIn) s += 1.0;
    float zS = s / nS * pitch - travel;
    vec3 col;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lampC = mix(vec3(0.6, 0.8, 1.1), vec3(1.15, 0.85, 0.55), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.02, 0.0), hueP * 0.159);
    if (zS < zOut) {
        // On a step: where on its top face?
        float rho = r * zS;                                    // radius on the step
        float within = fract((af + k) * nS);                   // 0..1 along the step (angle)
        // Which step we are on varies with angle too; recompute its angular position.
        float stepA = (s / nS - k - 0.5) * 6.2831853;          // start angle of the step
        vec2 sp = rho * vec2(cos(a), sin(a));
        vec2 suv = sp * 0.6 + vec2(hash11(s * 0.13), hash11(s * 0.71)) + 0.5;
        float fw = fwidth(r) * zS * 0.6 * 1024.0;
        vec3 ph = imgLod(suv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
        vec3 stone = mix(vec3(0.5, 0.48, 0.45), ph, clamp(photoP, 0.0, 1.0));
        float fog = exp(-zS * 0.35);
        // Light from above falls on the steps; the nosing (step front edge) is bright.
        float angPos = fract((a / 6.2831853 + 0.5 + k) * nS - s + 1.0);
        float nose = smoothstep(0.08, 0.0, 1.0 - angPos) + smoothstep(0.05, 0.0, angPos) * 0.5;
        col = stone * lampC * (0.45 + 0.55 * smoothstep(Ro, Ri, rho));
        col *= 1.0 - 0.45 * smoothstep(0.2, 0.0, angPos);      // shadow under the step above
        col += lampC * nose * 0.25;
        // The handrail at the inner rim with lamps.
        float rail = exp(-abs(rho - Ri * 1.04) / (0.012 * zS + 0.003));
        float lampAt = pow(0.5 + 0.5 * cos(within * 6.2831853), 20.0);
        col += gc * rail * (0.6 + (0.8 + 1.5 * kick) * lampAt);
        col = mix(gc * (0.1 + 0.5 * swell), col, fog);
    } else {
        // The wall of the well behind/under the steps.
        float zW = zOut;
        vec2 wuv = vec2(a / 3.14159265, (zW + travel) * 0.3);
        vec2 cfw = fwidth(vec2(cos(a), sin(a)));
        float fw = max(length(cfw) / 3.14159265, fwidth(zW) * 0.3) * 1024.0;
        vec3 wall = imgLod(wuv, clamp(log2(max(fw, 1.0)), 0.0, 9.0)) * 0.5;
        float fog = exp(-zW * 0.35);
        col = mix(gc * (0.1 + 0.5 * swell), wall * lampC, fog);
    }
    // The open well: the glow of the bottom far below.
    col += gc * exp(-r / Ri * 3.0) * (0.3 + 0.8 * swell);
    finish(col);
}

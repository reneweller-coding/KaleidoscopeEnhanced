#version 330 core
out vec4 fragColor;
/**
 * @file TextureTidePools.frag
 * @brief TEXTURE TIDE POOLS: looking down into rock pools at low tide --
 * the photograph is the rocky shore, and in its hollows clear water
 * stands in pools, rippling gently in the breeze so the rock and pebbles
 * at their bottoms wobble, caustic light nets dancing across them, bits of
 * seaweed swaying; as the tide slowly rises and falls, the pools grow and
 * shrink along the rock's contours.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ripples and the tide (integrated, jump-free)
 *   audioSpread     -> how high the tide stands
 *   audioBass       -> the caustics brighten (light)
 *   audioMode       -> the water: cold green in minor, tropical turquoise in major
 *   audioRoughness  -> breeze on the water
 *   audioSwell      -> the wet sheen on the rock (slow)
 *
 * Knobs: poolP (pool depth), causticP (caustic strength), rockP (rock relief), hueP.
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
uniform float audioBass;
uniform float audioMode;
uniform float audioRoughness;
uniform float audioSwell;

uniform float poolP;
uniform float causticP;
uniform float rockP;
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
// The photo read through a turning kaleidoscope -- the trick of the original
// Kaleidoscope/Tunnel scenes: uv is folded into mirrored wedges around a
// slowly wandering centre and turned with time and the integrated audio
// phase, so the texture itself keeps changing (detailed, continuous, never
// repeating).  The fold is continuous at every wedge border and at the atan
// cut (sides is a whole number); the explicit mip level avoids seams.
vec2 kaleidoUV(vec2 uv, float sides)
{
    vec2 c = vec2(0.5) + 0.2 * vec2(sin(0.0107 * sceneTime), cos(0.0131 * sceneTime));
    vec2 d = uv - c;
    float r = length(d);
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    a += 0.03 * sceneTime + 0.25 * audioPhase;
    return c + r * vec2(cos(a), sin(a));
}
vec3 imgK(vec2 uv, float lod) { return imgLod(kaleidoUV(uv, 6.0), lod); }
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
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    // Rock height from the photo (broad) with detail.
    float hB = luma(imgK(uv, 4.0));
    float hD = luma(imgK(uv, 1.5));
    float H = hB * 0.8 + hD * 0.2 * (0.5 + clamp(rockP, 0.0, 1.0));
    // Tide level.
    float tide = 0.35 + 0.2 * clamp(audioSpread, 0.0, 1.0) + 0.05 * sin(0.03 * sceneTime);
    float depth = tide - H;
    float water = smoothstep(-0.005, 0.01, depth);
    // Rock shading.
    float e = 1.0 / 256.0;
    vec2 g = vec2(luma(imgK(uv + vec2(e, 0.0), 4.0)) - luma(imgK(uv - vec2(e, 0.0), 4.0)),
                  luma(imgK(uv + vec2(0.0, e), 4.0)) - luma(imgK(uv - vec2(0.0, e), 4.0))) / (2.0 * e);
    vec3 n = normalize(vec3(-g * 0.02 * (0.5 + clamp(rockP, 0.0, 1.0)), 1.0));
    vec3 L = normalize(vec3(-0.5, 0.6, 0.7));
    float diff = max(dot(n, L), 0.0);
    vec3 rock = imgK(uv, 0.6) * (0.3 + 0.8 * diff);
    rock += vec3(1.0) * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 20.0) * (0.05 + 0.3 * swell) * smoothstep(0.08, 0.0, abs(depth));   // wet rim
    // Water: ripples refract the bottom.
    vec2 rip = vec2(noise2(p * 12.0 + vec2(T, 0.0)) - 0.5, noise2(p * 12.0 + vec2(0.0, T) + 5.0) - 0.5) * (0.004 + 0.012 * rough);
    vec3 bottom = imgK(uv + rip * (1.0 + depth * 8.0), 1.0 + depth * 4.0);
    vec3 wc = mix(vec3(0.3, 0.55, 0.45), vec3(0.2, 0.75, 0.8), mode);
    float d2 = clamp(depth * (2.0 + 4.0 * clamp(poolP, 0.0, 1.0)), 0.0, 1.0);
    vec3 pool = mix(bottom, bottom * wc * 1.2, d2) * (1.0 - 0.4 * d2);
    // Caustics on the bottom.
    vec2 cq = p * 7.0;
    float c1 = fbm3(cq + vec2(T * 0.4, 0.0) + rip * 30.0);
    float c2 = fbm3(cq * 1.3 - vec2(0.0, T * 0.35) + 3.0);
    float caus = pow(max(0.0, 1.0 - abs(c1 - c2) * 2.5), 8.0);
    pool += wc * caus * (0.15 + 0.5 * clamp(causticP, 0.0, 1.0)) * (0.6 + 0.8 * bass) * (1.0 - d2 * 0.5);
    // Seaweed fronds: swaying dark wisps in the deeper parts.
    float weed = smoothstep(0.55, 0.75, fbm3(vec2(p.x * 8.0 + 0.3 * sin(T + p.y * 6.0), p.y * 3.0))) * smoothstep(0.05, 0.15, depth);
    pool = mix(pool, pool * vec3(0.4, 0.6, 0.3), weed * 0.6);
    vec3 col = mix(rock, pool, water);
    col = mix(col, col * glowColour(imgK(uv, 6.0), p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}

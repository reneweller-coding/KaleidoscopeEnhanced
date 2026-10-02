#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TextureLavaFieldTop.frag
 * @brief TEXTURE LAVA FIELD TOP: an active lava field seen from straight
 * above at night -- channels and rivers of bright molten rock wind between
 * plates of black cooled crust, the crust split by glowing cracks, fresh
 * lava oozing out as bright lobes that cool from yellow-white to orange to
 * dark red at their edges; the flow creeps along the channels.  The
 * channel network is shaped by the photograph (its dark valleys are where
 * the lava runs).  Faint heat haze and steam drift over it.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lava creeps along its channels (integrated)
 *   audioBass       -> the glow of the molten rock (light)
 *   audioSpread     -> how much of the field is molten
 *   audioRoughness  -> the crust edges crumble
 *   audioMode       -> temperature: dull red in minor, bright yellow in major
 *   audioSwell      -> steam over the field (slow)
 *
 * Knobs: channelP (channel width), crustP (crack density), steamP, hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSpread;   ///< Spectral spread, 0..1.
uniform float audioRoughness;   ///< Roughness (dissonance) of the sound, 0..1.
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float channelP;
uniform float crustP;
uniform float steamP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

// ---- shared building blocks (texture pool, noise, shapes) ----
/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Pseudo-random 2D vector (each 0..1) from a 2D point.
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}
/// @brief Fractal noise of three octaves, 0..1.
float fbm3(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}
/// Mirror-repeat in the shader (the engine's textures mirror, the editor's
/// repeat -- doing it here makes both identical).  Identity inside [0,1].
vec2 mirrorUV(vec2 uv) { return 1.0 - abs(fract(uv * 0.5) * 2.0 - 1.0); }
/// The photo at a mip level: lod 0 is full detail, ~4 a soft field, ~7 broad masses.
vec3 imgLod(vec2 uv, float lod) {
    uv = mirrorUV(uv);
    return (interpolation * textureLod(tex0, uv, lod) + (1.0 - interpolation) * textureLod(tex1, uv, lod)).rgb;
}
/// @brief Luminance of a colour (Rec. 601 weights).
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
/// @brief HSV (all 0..1) to RGB.
vec3 hsv2rgb(vec3 c) {
    vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), k, c.y);
}
/// @brief Hue of a colour, 0..1.
float hue_of(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn + 1e-5;
    float h = (mx == c.r) ? (c.g - c.b) / d : (mx == c.g) ? 2.0 + (c.b - c.r) / d : 4.0 + (c.r - c.g) / d;
    return fract(h / 6.0);
}
/// @brief Saturation of a colour, 0..1.
float satOf(vec3 c) { float mx = max(c.r, max(c.g, c.b)); return (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3); }
/// A glowing colour for a place: the photo's own hue where it has one, a
/// slowly wandering hue field (anchored on hue0) where the photo is grey.
vec3 glowColour(vec3 photo, vec2 q, float hue0) {
    vec3 field = hsv2rgb(vec3(fract(hue0 + 0.55 * fbm3(q * 0.8) + 0.03 * audioAdvance), 0.85, 1.0));
    vec3 own = photo / max(max(photo.r, max(photo.g, photo.b)), 1e-3); own = own * own * own;
    return mix(field, own, smoothstep(0.12, 0.35, satOf(photo)));
}
/// Push a colour toward full saturation, keeping its hue (neon from a photo).
vec3 neonOf(vec3 c, float k) {
    vec3 n = c / max(max(c.r, max(c.g, c.b)), 1e-3);
    return pow(n, vec3(k));
}
/// The photo along an endless scroll in y without mirror seams: the photo
/// repeats mirrored, so a scroll crosses a visible fold every unit; two reads
/// half a period apart are cross-faded so each fold is hidden by the other.
vec3 imgScroll(vec2 uv, float lod) {
    float w = abs(fract(uv.y) - 0.5) * 2.0;           // 1 at the fold, 0 between
    w = smoothstep(0.55, 1.0, w);
    return mix(imgLod(uv, lod), imgLod(uv + vec2(0.37, 0.5), lod), w);
}
/// Height from the photo: broad masses plus a share of the detail.
float texHeight(vec2 uv, float lodBroad, float detail) {
    return mix(luma(imgLod(uv, lodBroad)), luma(imgLod(uv, max(lodBroad - 3.0, 0.0))), detail);
}
/// Gradient of the photo's luma at a mip level (per UV unit).
vec2 texGrad(vec2 uv, float lod) {
    float e = exp2(lod) / 1024.0;
    return vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
}
/// Edge strength of the photo (0..1-ish) at a mip level.
float texEdge(vec2 uv, float lod) { return length(texGrad(uv, lod)) * exp2(lod) / 1024.0 * 6.0; }

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief 2D rotation matrix.
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
/// @brief Smooth minimum of two distances (blend width k).
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
/// @brief Distance from a point to a line segment.
float sdSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
/// Centred coordinates: y in -0.5..0.5, x scaled by the aspect.
vec2 screenP() { return (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0); }
/// House finish: loudness brightness and the soft highlight roll-off.
void finish(vec3 col)
{
    col *= 0.9 + 0.2 * audioLevel;
    vec3 t = max(col, 0.0);
    t /= 1.0 + 0.35 * max(t.r, max(t.g, t.b));
    fragColor = vec4(clamp(t, 0.0, 1.0), 1.0);
}

float cracksV(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float T = 0.08 * sceneTime + 0.6 * audioAdvance;
    // Channels: valleys of the photo (soft), plus noise so every photo flows.
    float lv = luma(imgLod(uv, 5.0)) - luma(imgLod(uv, 7.5));
    float nf = fbm3(p * 1.6 + vec2(0.0, 0.02 * sceneTime));
    float chan = smoothstep(-0.02 - 0.05 * (1.0 - clamp(channelP, 0.0, 1.0)), -0.1, lv + (nf - 0.5) * 0.25 - 0.03 - 0.06 * clamp(audioSpread, 0.0, 1.0));
    // Flow texture inside the channels: streaks creeping along.
    vec2 g = texGrad(uv, 5.5);
    vec2 dir = normalize(vec2(-g.y, g.x) + vec2(0.3, 0.1));
    float along = dot(p, dir) * 8.0 - T * 4.0;
    float streak = 0.6 + 0.4 * fbm3(vec2(along, dot(p, vec2(-dir.y, dir.x)) * 30.0));
    // Crust plates with glowing cracks.
    vec2 cq = p * (5.0 + 5.0 * clamp(crustP, 0.0, 1.0)) + 0.4 * vec2(fbm3(p * 2.0), fbm3(p * 2.0 + 3.0));
    float cr = cracksV(cq);
    float crack = smoothstep(0.06 + 0.04 * rough, 0.0, cr);
    // Cracks glow hot near the molten channels and cool (dark) far from them.
    float heat = smoothstep(0.15, 0.7, fbm3(p * 1.1 + 9.0 + vec2(0.01 * sceneTime, 0.0)) + 0.5 * smoothstep(-0.02, -0.12, lv + (nf - 0.5) * 0.25));
    crack *= heat;
    // Temperature.
    float mode = clamp(audioMode, 0.0, 1.0);
    float t = chan * streak * (0.55 + 0.35 * mode) * (0.8 + 0.4 * bass) * (0.7 + 0.5 * chan) + crack * (1.0 - chan) * 0.45 * (0.7 + 0.6 * bass);
    vec3 col = mix(vec3(0.02, 0.015, 0.015), vec3(0.5, 0.04, 0.0), smoothstep(0.08, 0.3, t));
    col = mix(col, vec3(1.0, 0.35, 0.02), smoothstep(0.3, 0.6, t));
    col = mix(col, vec3(1.0, 0.8, 0.3), smoothstep(0.6, 0.9, t));
    col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.9, 1.2, t));
    col *= 1.5;
    // The crust shows the photo's texture, faintly lit by the glow nearby.
    col += imgLod(uv, 0.5) * 0.06 * (1.0 - chan) * (1.0 + 2.0 * smoothstep(0.3, 0.0, cr));
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.4, 0.06);
    // Steam drifting over the field, lit from below by the glow.
    float steam = smoothstep(0.55, 0.85, fbm(p * 1.8 + vec2(0.04 * sceneTime, 0.02 * sceneTime))) * (0.3 + 0.7 * clamp(steamP, 0.0, 1.0)) * (0.5 + 0.7 * swell);
    col = mix(col, vec3(0.5, 0.35, 0.3) * (0.4 + 0.8 * chan), steam * 0.4);
    finish(col);
}

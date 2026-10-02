#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file GlassblowerGather.frag
 * @brief GLASSBLOWER GATHER: a gather of molten glass on the end of the
 * blowpipe, turning steadily on the scene clock, inflating with the swell
 * (the breath), and cooling from white-orange toward the colour it will
 * keep -- the photo, which shows through the glass as its pattern once
 * the glow has gone.  The kick is the reheat in the glory hole (a flash of
 * orange), the treble the glints on the glass, the bass the furnace mouth
 * glow behind.  Camera fixed at the bench.
 *
 * Audio Reactivity:
 *   audioSwell   -> inflation (slow)
 *   sceneAdvance -> rotation and the cooling cycle (continuous)
 *   audioKick    -> reheat flash (light)
 *   audioHigh    -> glints (light)
 *   audioBass    -> furnace glow (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: sizeP, coolP, hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float coolP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

vec3 heatCol(float t)
{
    return vec3(smoothstep(0.0, 0.35, t), smoothstep(0.25, 0.75, t), smoothstep(0.6, 1.0, t)) * (0.2 + 1.8 * t);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float baseR = 0.16 + 0.08 * clamp(sizeP, 0.0, 1.0);
    float coolRate = 0.5 + 0.5 * clamp(coolP, 0.0, 1.0);
    float breath = clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    float bass = clamp(audioBass, 0.0, 1.0);
    // The gather: a blob on the pipe end, its radius inflating with the
    // breath, its shape a slightly lopsided ellipsoid that turns; the
    // temperature cycles on the clock (reheat, work, cool) and the kick
    // reheats it as light.
    vec2 centre = vec2(0.1, -0.02);
    float R = baseR * (1.0 + 0.6 * breath);
    float temp = 0.35 + 0.35 * (0.5 + 0.5 * sin(clock * 0.25 * coolRate));    // slow cycle
    temp = clamp(temp + 0.3 * audioKick, 0.0, 1.0);

    // The shop: the photo dark, the furnace mouth glowing left with the bass.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.45), imgPalette(hue * 0.159 + 0.55) * 0.8, 0.5) + 0.04;
    vec2 furnace = vec2(-0.55, 0.05);
    float fd = length((p - furnace) * vec2(1.0, 1.4));
    col += heatCol(0.85) * (smoothstep(0.16, 0.14, fd) * 0.8 + exp(-fd * 4.0) * 0.4) * (0.5 + 0.6 * bass);
    col *= 0.75 + 0.6 * exp(-length(p - centre) * 2.0) * temp;
    // The blowpipe: a dark rod from the right into the gather.
    float pipe = step(centre.x + R * 0.6, p.x) * step(abs(p.y - centre.y), 0.012);
    col = mix(col, vec3(0.15, 0.14, 0.13) * (0.6 + 0.4 * exp(-length(p - centre) * 3.0)), pipe);
    // The gather itself: an ellipsoid; inside, the photo shows through as
    // the glass colour, brighter with the glow; the surface turns (the
    // photo pattern rotates about the pipe axis).
    vec2 q = p - centre;
    float lop = 1.0 + 0.08 * sin(clock * 0.7);
    float r = length(q * vec2(1.0 / lop, lop));
    if (r < R)
    {
        float nx = q.x / R, ny = q.y / R;
        float nz = sqrt(max(1.0 - r * r / (R * R), 0.0));
        // Surface coordinate turning about x (the pipe axis).
        float ang = atan(ny, nz) + clock * 1.2;
        vec2 guv = vec2(fract(nx * 0.4 + 0.5), fract(ang / 6.2831853));
        vec3 glass = img(guv);
        glass = mix(glass, glass * imgPalette(hue * 0.159 + 0.5) * 1.6, 0.3);
        // Glow: the glass is self-luminous by temperature, and the pattern
        // shows more as it cools.
        vec3 glow = heatCol(temp);
        vec3 body = mix(glass * (0.5 + 0.8 * (1.0 - temp)), glow, temp * 0.85);
        // Fresnel rim and a highlight; glints on the treble.
        float rim = pow(1.0 - nz, 3.0);
        body += vec3(1.0, 0.9, 0.8) * rim * 0.5 * (0.3 + temp);
        body += vec3(1.0) * pow(max(1.0 - length(vec2(nx + 0.35, ny - 0.35)) * 1.6, 0.0), 4.0) * (0.5 + 1.0 * clamp(audioHigh * 2.0, 0.0, 1.0));
        // Swirls of colour in the glass (cane), turning.
        float cane = pow(0.5 + 0.5 * sin(ang * 5.0 + nx * 8.0), 8.0);
        body += imgPalette(hue * 0.159 + 0.1) * cane * 0.4 * (1.0 - temp);
        col = body;
    }
    // Heat shimmer above the gather: a faint refractive wobble of the shop.
    float shimmer = fbm(vec2(p.x * 6.0, p.y * 4.0 - clock * 2.0)) * smoothstep(0.0, 0.3, p.y - centre.y - R) * temp;
    col += vec3(0.15, 0.08, 0.02) * shimmer;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

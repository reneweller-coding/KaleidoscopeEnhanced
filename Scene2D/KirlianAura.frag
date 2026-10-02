#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KirlianAura.frag
 * @brief KIRLIAN AURA: the photo as a Kirlian print -- its edges crowned
 * with corona discharge, violet-blue filaments streaming outward from every
 * contour.  The treble drives the discharge (a light effect: brightness and
 * reach of the filaments), the filaments flicker on a continuous noise
 * clock, the bass warms the glow.  Camera still; the print itself never
 * moves.
 *
 * Audio Reactivity:
 *   audioHigh    -> corona brightness and reach (light)
 *   audioBass    -> glow warmth (colour)
 *   audioKick    -> a bright pulse along the edges (light)
 *   audioSwell   -> the print itself fades in from dark (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: reachP, filP (filament density), hueP.
 */
uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float reachP;
uniform float filP;
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

/// @brief Luminance of a colour (Rec. 601 weights).
float luma(vec2 uv) { return dot(img(uv), vec3(0.299, 0.587, 0.114)); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float reach = 0.02 + 0.05 * clamp(reachP, 0.0, 1.0);
    float fil = 30.0 + 40.0 * clamp(filP, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // Edges of the photo (Sobel on luma).
    vec2 e = vec2(1.5) / resolution;
    float gx = luma(uv + vec2(e.x, 0.0)) - luma(uv - vec2(e.x, 0.0));
    float gy = luma(uv + vec2(0.0, e.y)) - luma(uv - vec2(0.0, e.y));
    vec2 grad = vec2(gx, gy);
    float edge = clamp(length(grad) * 6.0, 0.0, 1.0);
    vec2 n = grad / max(length(grad), 1e-4);            // outward from dark to bright

    // Corona: filaments stream from the edges along the gradient; their
    // reach grows with the treble, their brightness flickers on a noise
    // clock (continuous, no steps).
    float glow = 0.0;
    for (int i = 1; i <= 6; ++i)
    {
        float fi = float(i);
        float dist = fi * reach * (0.5 + 1.0 * hi);
        vec2 q = uv - n * dist;                          // look back along the gradient
        float src = clamp(length(vec2(luma(q + vec2(e.x, 0.0)) - luma(q - vec2(e.x, 0.0)), luma(q + vec2(0.0, e.y)) - luma(q - vec2(0.0, e.y)))) * 6.0, 0.0, 1.0);
        float fl = fbm(p * fil + vec2(fi * 3.1, -sceneAdvance * 0.6));
        float streak = pow(fl, 3.0) * 3.0;
        glow += src * streak * exp(-fi * 0.35) * (0.45 + 0.55 * hi);
    }
    glow *= 1.6;
    // The print: dark, fading in on the swell; its edges glow directly.
    float printIn = 0.08 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    vec3 print = img(uv) * printIn;
    vec3 aura = mix(vec3(0.35, 0.3, 1.0), vec3(1.0, 0.55, 0.3), clamp(audioBass, 0.0, 1.0) * 0.6);
    aura = mix(aura, imgPalette(hue * 0.159 + 0.7), 0.35);
    vec3 col = print;
    col += aura * edge * (1.5 + 0.7 * hi + 0.5 * audioKick);
    col += aura * glow;
    // Faint film grain of the print, static (no flicker).
    col *= 0.94 + 0.06 * hash21(floor(gl_FragCoord.xy * 0.5));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

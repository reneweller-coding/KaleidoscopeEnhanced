#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LetterpressImpression.frag
 * @brief TRANSITION LETTERPRESS IMPRESSION: the incoming scene is a relief
 * plate pressed into the sheet the outgoing scene is printed on.
 *
 * The plate's height field is the incoming scene's own luminance, so the
 * emboss is derived from the picture rather than drawn on top of it: the
 * lighting comes from the gradient of that field, which puts the bright edge on
 * the side facing the light and the shadow opposite, and turns the relief the
 * moment the picture does.
 *
 * The give-away detail of real letterpress is the bite: ink squeezed to the rim
 * of every stroke leaves a darker margin exactly where the plate's edges are
 * steepest.  That comes from the gradient's magnitude, free.
 *
 * The impression deepens as the press closes and the ink coverage grows past
 * every part of the plate, so the last frame is the incoming scene flat and
 * fully inked, with no relief left.
 *
 * Audio Reactivity:
 *   audioKick  -> the light on the impression as the platen closes (light)
 *   audioHigh  -> the paper's tooth (light)
 *   audioMid   -> the ink's temperature (colour)
 *   audioSwell -> how deep the bite runs (slow)
 *
 * Per-activation variety: biteP, reliefP, hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float biteP;
uniform float reliefP;   ///< Relief knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

const float PI = 3.14159265358979;   ///< Pi.

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Luminance of the photo at a coordinate.
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float bite   = (biteP   > 0.0) ? biteP   : 1.0;
    float relief = (reliefP > 0.0) ? reliefP : 1.0;
    float hue    = (hueP    > 0.0) ? hueP    : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);                      // the relief only exists mid-press

    vec3 src0 = texture(tex0, uv).rgb;
    vec3 src1 = texture(tex1, uv).rgb;

    // The plate: the incoming picture read as a height field.
    vec2 px = 1.5 / resolution;
    float hC = lum(src1);
    float hX = lum(texture(tex1, clamp(uv + vec2(px.x, 0.0), 0.0, 1.0)).rgb)
             - lum(texture(tex1, clamp(uv - vec2(px.x, 0.0), 0.0, 1.0)).rgb);
    float hY = lum(texture(tex1, clamp(uv + vec2(0.0, px.y), 0.0, 1.0)).rgb)
             - lum(texture(tex1, clamp(uv - vec2(0.0, px.y), 0.0, 1.0)).rgb);
    vec2  grad = vec2(hX, hY) * 26.0 * relief;
    float steep = length(grad);

    // The platen closes: the inked area grows until it has taken the whole
    // plate, which is what makes the endpoint exact.
    float press = smoothstep(0.0, 1.0, d);
    float inkT  = hC + (press * 2.3 - 1.15);
    float ink   = smoothstep(-0.05, 0.05, inkT);

    // Lighting off the plate's own gradient: light from the upper left.
    vec3  n   = normalize(vec3(-grad.x, -grad.y, 1.0));
    vec3  lig = normalize(vec3(-0.55, 0.62, 0.56));
    float lam = clamp(dot(n, lig), 0.0, 1.0);
    float emboss = (lam - 0.62) * 1.5;

    // Paper: the sheet the outgoing scene was on, going blank under the press.
    // Only PART way to blank stock: a full-frame white sheet reads as a flash,
    // and the outgoing scene should still be legible under the press.
    float blank = 0.55 * smoothstep(0.0, 0.30, d) * (1.0 - smoothstep(0.72, 1.0, d));
    vec3  stock = vec3(0.72, 0.70, 0.66);
    stock *= 0.94 + 0.11 * noise2(p * 340.0) * (0.5 + 1.0 * clamp(audioHigh * 2.0, 0.0, 1.0));
    vec3  sheet = mix(src0, stock, blank);

    // The ink itself, a touch warmer or cooler with the midrange.
    // hueP picks the ink's own cast, audioMid warms or cools it from there.
    vec3 inkCast = mix(vec3(0.98, 0.97, 1.00), vec3(1.00, 0.96, 0.90), fract(hue * 0.159));
    vec3 inked = src1 * mix(vec3(1.0),
                            mix(inkCast, inkCast * vec3(1.04, 1.00, 0.94),
                                clamp(audioMid * 2.0, 0.0, 1.0)), arc);

    vec3 col = mix(sheet, inked, ink);

    // The impression: the sheet is pushed down where the plate stands high.
    col *= 1.0 + emboss * 0.55 * arc;
    // The bite: ink squeezed to the rim of every stroke.
    float rim = clamp(steep, 0.0, 1.0) * ink;
    col *= 1.0 - rim * 0.45 * arc * (0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0)) * bite;
    // The platen's own light on the raised shoulders.
    col += vec3(1.0, 0.98, 0.94) * clamp(emboss, 0.0, 1.0) * arc
         * (0.03 + 0.16 * clamp(audioKick, 0.0, 1.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

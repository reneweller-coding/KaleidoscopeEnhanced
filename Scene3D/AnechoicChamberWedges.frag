#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file AnechoicChamberWedges.frag
 * @brief ANECHOIC CHAMBER WEDGES: the quietest room, seen wall-on.  Grey
 * foam wedges absorb everything; here they give the music back as light:
 * each wedge belongs to a spectrum band by its column, its tip glows with
 * that band, the base stays dark; the room light (the swell) rakes across
 * the pyramids from one side so their ridges read; the kick pulses the
 * whole wall's tips; the photo is the foam's faint mottle.  Nothing moves
 * but light; camera still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> wedge-tip light by column (light)
 *   audioSwell        -> room light (slow)
 *   audioKick         -> all tips pulse (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: detailP, wedgeP, hueP.
 */
in vec3  vWorld;   ///< World position (from the vertex stage).
in vec2  vSurfUV;
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vWedge;
in float vHeight;

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
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

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 n = normalize(vNormal);
    float room = 0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    // Band by column position across the wall.
    int band = int(clamp(vSurfUV.x * 31.0, 0.0, 31.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    // Foam: dark grey with the photo as a faint mottle.
    vec3 foam = vec3(0.24, 0.24, 0.26) * (0.8 + 0.4 * dot(img(vSurfUV), vec3(0.333)));
    vec3 L = normalize(vec3(-0.6, 0.5, -0.6));
    float diff = max(dot(n, L), 0.0);
    vec3 col = foam * (0.15 + 0.9 * diff * room);
    // The tip glow: the band's light, concentrated at the wedge tip.
    vec3 tipCol = imgPalette(hue * 0.159 + float(band) / 32.0) * 1.8 + 0.2;
    float tip = pow(vHeight, 3.0);
    col += tipCol * tip * (0.3 + 1.4 * e + 0.6 * audioKick);
    // A faint glow bleeding down the wedge faces from the tip.
    col += tipCol * vHeight * 0.12 * e;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

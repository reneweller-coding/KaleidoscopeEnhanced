#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MetamaterialNegativeRefraction.frag
 * @brief METAMATERIAL NEGATIVE REFRACTION: a wave-carrying slab seen from above;
 * two media take their tints from opposite ends of the photo-palette arc,
 * the refraction kink runs through the middle and a superlens focal spot
 * glows in the slab plane on the kick.
 *   audioKick -> focal spot    audioBass -> wave amplitude
 */

in vec3 vWorldPos;   ///< World position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
in float vPhaseVelocity;

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float nP;
uniform float lensP;   ///< Lens knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping onto metamaterial grid
    vec3 photo = img(vTexCoord);

    // Negative refraction: the two media take their tints from the photo
    // palette a half-turn apart, so they always contrast but never candy.
    vec3 positiveCol = imgPalette(0.10) * 1.25;
    vec3 negativeCol = imgPalette(0.60) * 1.25;
    vec3 metaColor = (vPhaseVelocity > 0.0) ? positiveCol : negativeCol;

    // Superlens focal spot: a spot IN the slab plane (xz), kick-pulsed
    float focusGlow = exp(-length(vWorldPos.xz) * 2.2) * (0.7 + audioKick * 0.6);

    vec3 col = mix(photo, metaColor, 0.45);
    col += focusGlow * imgPalette(0.35) * 1.6;

    if (hue > 0.001) col = hueRot(col, hue);

    col /= 1.0 + 0.32 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}

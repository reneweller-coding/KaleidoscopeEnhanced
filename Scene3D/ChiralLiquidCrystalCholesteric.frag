#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file ChiralLiquidCrystalCholesteric.frag
 * @brief CHIRAL LIQUID CRYSTAL (CHOLESTERIC): 20 helical director ribbons seen
 * from the SIDE at a slow orbit - layered golden wave-sheets whose twist
 * period (the cholesteric pitch) reads directly in the picture; Bragg
 * colours come from the photo palette.
 *   audioAdvance -> orbit + helix twist    audioKick -> ribbon width
 *   pitchP/twistP -> cholesteric pitch and twist rate
 */

in vec3 vWorldPos;   ///< World position (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
in float vHelixPhase;

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

uniform float pitchP;   ///< Pitch knob, 0..1.
uniform float twistP;   ///< Twist knob, 0..1.
uniform float widthP;   ///< Width knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping along liquid crystal ribbons
    vec3 photo = img(fract(vTexCoord));

    // Cholesteric Bragg circular reflection color palette (iridescent emerald, sapphire, ruby)
    vec3 braggColor = imgPalette((vWorldPos.z * 3.0 + vHelixPhase * 6.28 + audioPhase) * 0.159);

    // Glowing edges
    float edgeGlow = pow(abs(vTexCoord.y - 0.5) * 2.0, 3.0);

    vec3 col = mix(photo, braggColor, 0.5);
    col += edgeGlow * vec3(1.0, 0.95, 0.6) * (1.2 + audioKick * 2.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.03, 0.06), 1.0 - exp(-dist * 0.15));

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

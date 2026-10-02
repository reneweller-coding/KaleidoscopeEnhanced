#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SuperconductingQubitResonator.frag
 * @brief SUPERCONDUCTING QUBIT RESONATOR: microwave standing waves meandering
 * along a superconducting coplanar resonator strip, seen at a 3/4 orbit;
 * blue/pink photon-number states glow along the line.
 *   audioSpectrum -> mode amplitudes    audioKick -> readout pulse
 *   audioAdvance  -> orbit
 */

in vec3 vWorldPos;   ///< World position (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
in float vQubitIndex;

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

uniform float qubitP;
uniform float meanderP;
uniform float widthP;   ///< Width knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping along coplanar waveguide
    vec3 photo = img(fract(vTexCoord));

    // Microwave photon packet propagation
    float photonPacket = pow(abs(sin(vTexCoord.x * 2.0 - time * 6.0)), 12.0);

    // Superconducting niobium gold & cyan palette
    vec3 nbCyan = vec3(0.1, 0.9, 1.0);
    vec3 goldPad = vec3(1.0, 0.85, 0.3);
    vec3 qubitColor = mix(nbCyan, goldPad, sin(vQubitIndex * 6.28 + audioPhase) * 0.5 + 0.5);

    vec3 col = mix(photo, qubitColor, 0.45);
    col += photonPacket * vec3(1.0, 0.98, 0.9) * (1.5 + audioKick * 3.0);

    // Edge glow
    float edge = pow(abs(vTexCoord.y - 0.5) * 2.0, 3.0);
    col += edge * nbCyan * (1.0 + audioHigh * 1.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.03, 0.06), 1.0 - exp(-dist * 0.15));

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}

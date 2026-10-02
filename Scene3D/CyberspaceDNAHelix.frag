#version 330 core
in vec3 vPos;   ///< Position (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vStrandID;
in float vTranscription;

out vec4 fragColor;   ///< The pixel's colour (output).

/**
 * @file CyberspaceDNAHelix.frag
 * @brief Lighting for the double-helix DNA strand: colours each base-pair
 * rung by nucleotide (Adenine/Thymine/Cytosine/Guanine, cycled along the
 * strand) and flashes it toward white as a transcription pulse travels past.
 *
 * The transcription pulse itself (vTranscription, which drives both the
 * brightness boost and the colour mix toward the pulse colour) is generated
 * per-vertex in CyberspaceDNAHelix.vert, where audioKick sharpens it and
 * audioSwell widens the strand-unzipping fork at the helix's centre; this
 * fragment stage reads vTranscription back, colours the bases by musical
 * mode, and applies the preset hue rotation (hueP).
 *
 * Audio Reactivity:
 *   audioMode      -> nucleotide palette temperature: a minor key cools the
 *                     whole A/T/C/G set toward steel-cyan, a major key lets
 *                     the full warm base spectrum through
 *   (audioKick / audioSwell / audioAdvance / audioHarmChange / audioUpperMid
 *    all act upstream in CyberspaceDNAHelix.vert -- see that file.)
 */

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioMode;   ///< 0 = minor / dark, 1 = major / resolved (slow ~3 s)

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float helixP;
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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    float edge = smoothstep(0.5, 0.1, abs(vUV.y - 0.5));

    // DNA nucleotide base color mapping (Adenine=Green, Thymine=Red, Cytosine=Cyan, Guanine=Gold)
    float baseIdx = mod(floor(vUV.x * 40.0), 4.0);
    vec3 baseColor = vec3(0.0);
    if (baseIdx == 0.0) baseColor = vec3(0.1, 0.9, 0.3); // Adenine
    else if (baseIdx == 1.0) baseColor = vec3(1.0, 0.2, 0.3); // Thymine
    else if (baseIdx == 2.0) baseColor = vec3(0.1, 0.8, 1.0); // Cytosine
    else baseColor = vec3(1.0, 0.8, 0.2); // Guanine

    // Musical mode sets the sequencer's colour temperature: minor keys drain
    // the four bases toward a cold steel-cyan readout, major keys let the full
    // warm A/T/C/G spectrum come back. Colour only -- luminance never rises.
    vec3 coldBase = mix(vec3(0.15, 0.55, 0.85), baseColor, 0.35);
    baseColor = mix(coldBase, baseColor, clamp(audioMode, 0.0, 1.0));

    // Transcription laser pulse
    vec3 pulseColor = vec3(1.0, 1.0, 0.8);
    vec3 col = mix(baseColor, pulseColor, vTranscription * 0.7);
    col *= (0.8 + 2.0 * vTranscription) * edge * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * 1.7, edge * 0.95);
}

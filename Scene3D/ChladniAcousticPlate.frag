#version 330 core
in vec3 vPos;   ///< Position (from the vertex stage).
in float vNodalDist;
in float vPlateEnergy;

out vec4 fragColor;   ///< The pixel's colour (output).

/**
 * @file ChladniAcousticPlate.frag
 * @brief Shades a single grain of sand settling into a Chladni acoustic
 * resonance pattern, as a soft circular point sprite whose colour shifts
 * between a gold/bronze "resting on a nodal line" hue and an electric-azure
 * "in flight" hue.
 *
 * vNodalDist (distance from the nearest vibration node, set per vertex)
 * selects that gold-to-azure mix, and vPlateEnergy (the plate's local
 * vibration energy) drives the grain's brightness; both already carry the
 * scene's audio reactivity from the vertex stage. hueP applies a final
 * uniform hue rotation via hueRot(), and glowP is available to scale overall
 * brightness. Ends with a soft-knee tone-map so loud audio compresses
 * instead of clipping to white.
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

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float nodalP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

    vec2 circ = gl_PointCoord - vec2(0.5);
    float r = length(circ);
    if (r > 0.5) discard;

    float alpha = smoothstep(0.5, 0.05, r);

    // High contrast resonant sand colors: Gold/Bronze on nodal lines, electric azure in flight
    vec3 nodalColor = vec3(1.0, 0.85, 0.3);
    vec3 flightColor = vec3(0.1, 0.8, 1.0);

    vec3 col = mix(nodalColor, flightColor, clamp(vNodalDist * 2.0, 0.0, 1.0));
    col *= (0.7 + 1.5 * vPlateEnergy) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, alpha);
}

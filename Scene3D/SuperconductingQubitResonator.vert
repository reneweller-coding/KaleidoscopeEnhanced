#version 330 core
/**
 * @file SuperconductingQubitResonator.vert
 * @brief Vertex stage companion to SuperconductingQubitResonator.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
layout(location = 1) in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

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

out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out float vQubitIndex;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float qbt = (qubitP   > 0.0) ? qubitP   : 1.0;
    float mnd = (meanderP > 0.0) ? meanderP : 1.0;
    float wdp = (widthP   > 0.0) ? widthP   : 1.0;

    // GEOM_RIBBON packs the ribbon index into attrA.w; attrB.x is a random
    // hash01 in [0,1), so int(attrB.x) was always 0 and all 20 ribbons
    // collapsed onto ribbon 0 (see Scene3DShader::buildGeometry).
    int ribbonIdx = int(attrA.w);
    float s = attrA.x;       // [0, 1] along resonator
    float side = attrA.y;    // -1 or +1
    vQubitIndex = float(ribbonIdx) / 20.0;
    vTexCoord = vec2(s * 8.0, side * 0.5 + 0.5);

    float t = time * 0.4 + audioAdvance * 0.2;

    // Resonator array layout: 20 parallel coplanar waveguides with meander turns
    float xBase = (float(ribbonIdx) - 10.0) * 0.35 * qbt;
    float yMeander = sin(s * 25.0 * mnd) * 0.25;
    float z = (s - 0.5) * 5.0;

    // Microwave standing wave voltage: V(s) = V_0 * cos(n * pi * s)
    float standingVoltage = cos(s * 12.566 - t * 4.0) * (0.08 + 0.04 * audioBass);

    vec3 p0 = vec3(xBase + yMeander, standingVoltage, z);

    // Tangent & Binormal
    vec3 tangent = normalize(vec3(cos(s * 25.0 * mnd) * 6.25, 0.0, 5.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)));

    float ribbonWidth = (0.035 + 0.015 * sin(s * 30.0 + t * 4.0)) * wdp * (1.0 + audioKick * 0.6);
    vec3 worldPos = p0 + binormal * (side * ribbonWidth);
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    vec3 vp = worldPos;
    // Orbit + pitch: the resonator strip was seen edge-on as a thin band
    float yaw = 0.9 + time * 0.13 + audioAdvance * 0.06;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    float pit = -1.05 + 0.10 * sin(time * 0.15);   // top-down onto the resonator strip
    float cp = cos(pit), sp = sin(pit);
    vp.yz = mat2(cp, -sp, sp, cp) * vp.yz;
    vp.z += 6.8;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

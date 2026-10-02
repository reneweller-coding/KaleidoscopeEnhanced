#version 330 core
/**
 * @file PlasmaFilamentTornado.vert
 * @brief Vertex stage companion to PlasmaFilamentTornado.frag -- see that file's header for
 * this scene's description.
 */
// PlasmaFilamentTornado.vert

layout(location = 0) in vec4 attrA; ///< xyz = pos, w = strandID
layout(location = 1) in vec4 attrB; ///< x = seed, y = u, zw = uv

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

out vec4 vColor;
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 pos = attrA.xyz;
    float strandID = attrA.w;
    float u = attrB.y;
    vTexCoord = attrB.zw;

    // Relativistic plasma emission colors: Hot Cyan, Electric Violet, Blinding Core White
    vec3 plasmaCyan   = vec3(0.0, 0.85, 1.0);
    vec3 plasmaViolet = vec3(0.7, 0.15, 1.0);
    vec3 coreWhite    = vec3(1.0, 0.98, 0.95);

    vec3 col = mix(plasmaCyan, plasmaViolet, sin(strandID * 0.2 + time) * 0.5 + 0.5);
    col = mix(col, coreWhite, exp(-length(pos.xz) * 3.0) * (0.5 + 1.0 * audioKick));

    vColor = vec4(col * (0.8 + 0.6 * audioLevel), 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

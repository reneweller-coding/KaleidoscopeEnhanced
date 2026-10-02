#version 330 core
/**
 * @file BioluminescentMyceliumCave.vert
 * @brief Vertex stage companion to BioluminescentMyceliumCave.frag -- see that file's header for
 * this scene's description.
 */
// BioluminescentMyceliumCave.vert

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

uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec4 vColor;
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec3 pos = attrA.xyz;
    float strandID = attrA.w;
    float u = attrB.y;
    vTexCoord = attrB.zw;

    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Action potential electrical wave propagating down the mycelium
    float pulse = fract(u * 2.0 - time * 2.0 - strandID * 0.1);
    float pulseGlow = exp(-pulse * 6.0) * (1.5 + audioKick * 3.0);

    // Bio-luminescence palette: Cave emerald green, bio-blue, spore gold
    vec3 bioEmerald = vec3(0.1, 0.95, 0.4);
    vec3 bioBlue    = vec3(0.05, 0.5, 1.0);
    vec3 sporeGold  = vec3(1.0, 0.9, 0.3);

    vec3 col = mix(bioEmerald, bioBlue, u);
    col = mix(col, sporeGold, pulseGlow * 0.5);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vColor = vec4(col * (0.8 + 0.6 * audioLevel + pulseGlow), 1.0);

    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

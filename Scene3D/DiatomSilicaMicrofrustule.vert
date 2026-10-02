#version 330 core
/**
 * @file DiatomSilicaMicrofrustule.vert
 * @brief Vertex stage companion to DiatomSilicaMicrofrustule.frag -- see that file's header for
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

uniform float diatomP;
uniform float poreP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out float vDiatomIndex;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float dtm = (diatomP > 0.0) ? diatomP : 1.0;
    float por = (poreP   > 0.0) ? poreP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    // The engine draws NON-instanced (glDrawArrays), so gl_InstanceID is
    // always 0 -- every unit would collapse onto one spot.  Scene3DShader
    // packs the per-unit index into attrA.w instead (see buildGeometry).
    int quadIndex = int(attrA.w);
    vDiatomIndex = float(quadIndex) / 3000.0;
    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 corner = attrA.xy * 2.0 - 1.0;   // [-1,1]
    vTexCoord = corner * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // 3D suspension cloud
    float u = float(quadIndex) * 0.6180339887; // Golden ratio hash
    float phi = u * 6.2831853;
    float costheta = fract(u * 123.456) * 2.0 - 1.0;
    float theta = acos(costheta);
    float r = pow(fract(u * 789.123), 0.333) * 3.5 * dtm;

    vec3 center = vec3(
        r * sin(theta) * cos(phi + t * 0.3),
        r * sin(theta) * sin(phi + t * 0.3),
        r * cos(theta) + sin(t * 0.5 + u * 10.0) * 0.3
    );

    // Diatom card scale
    float cardScale = (0.08 + 0.04 * sin(u * 20.0 + t * 2.0)) * por * (1.0 + audioKick * 0.7);
    vec3 worldPos = center + vec3(corner.x, corner.y, 0.0) * cardScale;
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    vec3 vp = worldPos;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

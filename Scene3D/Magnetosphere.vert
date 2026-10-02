#version 330 core
/**
 * @file Magnetosphere.vert
 * @brief Vertex stage companion to Magnetosphere.frag -- see that file's header for
 * this scene's description.
 */
// Magnetosphere.vert — vertices arrive finished from the generator; place the
// system and pass the shading data through.

in vec4 attrA;      ///< xyz = object position, w = band energy on this line
in vec4 attrB;      ///< xyz = normal, w = 0 field line / 1 planet

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out float vEnergy;
out float vKind;   ///< Element kind (from the vertex stage).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camDistP;   ///< Camera distance knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;
    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(p.x - eyeOff, p.y, p.z + dist);

    vObj    = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vEnergy = attrA.w;
    vKind   = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

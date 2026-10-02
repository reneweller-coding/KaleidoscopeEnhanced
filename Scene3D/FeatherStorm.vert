#version 330 core
/**
 * @file FeatherStorm.vert
 * @brief Vertex stage companion to FeatherStorm.frag -- see that file's header for
 * this scene's description.
 */
// FeatherStorm.vert — the quads arrive oriented; this only places the column.

in vec4 attrA;      ///< xyz = object position, w = u (quill to tip)
in vec4 attrB;      ///< xyz = quad normal, w = v (across the vane)

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec2  vFeather;

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camDistP;   ///< Camera distance knob, 0..1.
uniform float camHP;   ///< Camera height knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;

    float ya = audioAdvance * 0.045;
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    vec3 pw = yaw * p;

    float dist = camDistP * (1.0 - 0.05 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y - camHP, pw.z + dist);

    vObj     = p;
    vNormal  = yaw * attrB.xyz;
    vView    = normalize(-vp);
    vFeather = vec2(attrA.w, attrB.w);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

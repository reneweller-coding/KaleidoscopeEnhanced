#version 330 core
/**
 * @file PrismExplode.vert
 * @brief Vertex stage companion to PrismExplode.frag -- see that file's header for
 * this scene's description.
 */
// PrismExplode.vert — place the shell and pass the facet data through.

in vec4 attrA;      ///< xyz = object position, w = wedge angle
in vec4 attrB;      ///< xyz = facet normal, w = per-shard seed

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out vec3  vObj;   ///< Object-space position (from the vertex stage).
out float vWedge;
out float vSeed;   ///< Per-instance random seed (from the vertex stage).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camDistP;   ///< Camera distance knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;

    float ya = audioAdvance * 0.07;
    float pa = 0.24 * sin(audioAdvance * 0.05);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    float dist = camDistP * (1.0 - 0.06 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = rot * attrB.xyz;
    vView   = normalize(-vp);
    vWedge  = attrA.w;
    vSeed   = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

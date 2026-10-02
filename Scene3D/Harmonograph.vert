#version 330 core
/**
 * @file Harmonograph.vert
 * @brief Vertex stage companion to Harmonograph.frag -- see that file's header for
 * this scene's description.
 */
// Harmonograph.vert — the wire arrives finished; turn the sculpture slowly so
// its three-dimensionality is visible rather than implied.

in vec4 attrA;      ///< xyz = object position, w = position along the wire
in vec4 attrB;      ///< xyz = normal, w = interval energy

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out float vAlong;
out float vEnergy;

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float camDistP;   ///< Camera distance knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;

    // 3-axis tumble (user feedback): continuous turn on all axes
    float ya = time * 0.20 + audioAdvance * 0.12;
    float pa = 0.55 * sin(time * 0.12 + audioAdvance * 0.07);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    float ro = time * 0.09;
    mat3 roll = mat3(cos(ro), sin(ro), 0.0, -sin(ro), cos(ro), 0.0, 0.0, 0.0, 1.0);
    mat3 rot = yaw * pitch * roll;

    vec3 pw = rot * p;
    float dist = camDistP * (1.0 - 0.05 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = rot * attrB.xyz;
    vView   = normalize(-vp);
    vAlong  = attrA.w;
    vEnergy = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

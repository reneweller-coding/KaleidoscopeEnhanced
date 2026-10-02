#version 330 core
/**
 * @file DrumSkin.vert
 * @brief Vertex stage companion to DrumSkin.frag -- see that file's header for
 * this scene's description.
 */
// DrumSkin.vert — look across the head, not down at it.  Seen from directly
// above, a membrane mode is a flat pattern and could have been drawn; seen at a
// low angle the displacement becomes a silhouette and the surface is obviously
// moving.

in vec4 attrA;      ///< xyz = object position, w = displacement at that point
in vec4 attrB;      ///< xyz = normal, w = normalised radius

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out float vDisp;
out float vRad;

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camDistP;   ///< Camera distance knob, 0..1.
uniform float tiltP;   ///< Tilt knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;

    // Tip the DRUM toward the camera rather than lifting the camera above it.
    // Raising the eye and looking straight ahead puts a disc lying at y = 0 into
    // the bottom of the frame and half of it below the edge; tilting the object
    // keeps it centred while still showing the displacement in silhouette.
    float ta = clamp(tiltP, 0.0, 1.30);
    mat3 tilt = mat3(1.0, 0.0, 0.0,
                     0.0, cos(ta), sin(ta),
                     0.0, -sin(ta), cos(ta));
    float ya = audioAdvance * 0.05;
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 rot = yaw * tilt;

    vec3 pw = rot * p;

    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = rot * attrB.xyz;
    vView   = normalize(-vp);
    vDisp   = attrA.w;
    vRad    = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

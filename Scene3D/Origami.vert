#version 330 core
/**
 * @file Origami.vert
 * @brief Vertex stage companion to Origami.frag -- see that file's header for
 * this scene's description.
 */
// Origami.vert — the sheet arrives finished from Origami.comp.  All this does is
// tip it so we look ACROSS the corrugation rather than down at it: seen from
// straight on, a Miura is a flat rectangle with some shading, and the whole
// point of folding it is the silhouette.

in vec4 attrA;      ///< xyz = object position, w = fold depth 0..1
in vec4 attrB;      ///< xyz = panel normal, w = position across the sheet

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out vec3  vWorld;   ///< World position (from the vertex stage).
out float vFold;
out float vAcross;

uniform mat4  projM;   ///< Projection matrix.
uniform mat4  lightM;   ///< Light view-projection matrix (shadow map).
uniform float shadowPass;   ///< 1 during the shadow map's depth-only pass.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float camDistP;   ///< Camera distance knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;

    // Slow continuous turn + pitch DOWN onto the sheet (the old -0.62
    // showed the corrugation from below, as a ceiling).
    float ya = time * 0.09 + 0.22 * sin(audioAdvance * 0.037);
    float pa = -1.05 + 0.10 * sin(audioAdvance * 0.029);
    mat3 yaw   = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(pa), sin(pa), 0.0, -sin(pa), cos(pa));
    mat3 rot = yaw * pitch;

    vec3 pw = rot * p;
    float cd = (camDistP > 0.0) ? camDistP : 7.0;   // param defaults to 0 -> guard
    float dist = cd * 1.35 * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y, pw.z + dist);

    vObj    = p;
    vNormal = rot * attrB.xyz;
    vView   = normalize(-vp);
    vWorld  = pw;
    vFold   = attrA.w;
    vAcross = attrB.w;

    if (shadowPass > 0.5)
    {
        gl_Position = lightM * vec4(pw, 1.0);
    }
    else
    {
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    }
}

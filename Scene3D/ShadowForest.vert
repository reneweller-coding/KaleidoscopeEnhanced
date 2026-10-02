#version 330 core
/**
 * @file ShadowForest.vert
 * @brief Vertex stage companion to ShadowForest.frag -- see that file's header for
 * this scene's description.
 */
// ShadowForest.vert — eye height on the forest floor, looking level into the
// stand.  No rotation: the motion is the trunks drifting past, which is what
// makes their shadows sweep.

in vec4 attrA;      ///< xyz = object position, w = kind (0 ground, 1 trunk)
in vec4 attrB;      ///< xyz = normal, w = per-trunk variation

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out vec3  vWorld;   ///< World position (from the vertex stage).
out float vKind;   ///< Element kind (from the vertex stage).
out float vVar;

uniform mat4  projM;   ///< Projection matrix.
uniform mat4  lightM;   ///< Light view-projection matrix (shadow map).
uniform float shadowPass;   ///< 1 during the shadow map's depth-only pass.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camHP;   ///< Camera height knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;
    vec3 vp = vec3(p.x - eyeOff, p.y - camHP, p.z + 7.0);

    vObj    = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vWorld  = p;
    vKind   = attrA.w;
    vVar    = attrB.w;

    if (shadowPass > 0.5)
    {
        gl_Position = lightM * vec4(p, 1.0);
    }
    else
    {
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    }
}

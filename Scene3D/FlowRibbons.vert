#version 330 core
/**
 * @file FlowRibbons.vert
 * @brief Vertex stage companion to FlowRibbons.frag -- see that file's header for
 * this scene's description.
 */
// FlowRibbons.vert — the ribbons arrive finished; place them and pass through.

in vec4 attrA;      ///< xyz = object position, w = position along the ribbon
in vec4 attrB;      ///< xyz = normal, w = per-ribbon random

out vec3  vObj;   ///< Object-space position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vView;   ///< View vector (from the vertex stage).
out float vAlong;
out float vRnd;
out float vDist;   ///< Distance (from the vertex stage).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.

uniform float camHP;   ///< Camera height knob, 0..1.

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 p = attrA.xyz;

    // A slow sideways drift, so the flow is something we move through.
    float sway = 2.2 * sin(audioAdvance * 0.05);
    vec3 vp = vec3(p.x - sway - eyeOff, p.y - camHP, p.z);

    vObj    = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vAlong  = attrA.w;
    vRnd    = attrB.w;
    vDist   = p.z;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

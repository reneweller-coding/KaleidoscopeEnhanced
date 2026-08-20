#version 330 core
/**
 * @file GrowthTree.vert
 * @brief Vertex stage companion to GrowthTree.frag -- see that file's header for
 * this scene's description.
 */
// GrowthTree.vert — vertices arrive finished from GrowthTree.comp; place the
// tree and pass the shading data through.

in vec4 attrA;      // xyz = object position, w = depth 0..1
in vec4 attrB;      // xyz = normal, w = 0 wood / 1 leaf

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vDepth;
out float vKind;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;
uniform float camHP;

void main()
{
    vec3 p = attrA.xyz;

    float ya = audioAdvance * 0.075;
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    vec3 pw = yaw * p;

    // The grove needs the camera much further back than the single tree did:
    // its ring reaches ~9.8 units out from the centre, and the eye has to sit
    // clear of that or a trunk swings straight through it as the grove turns.
    float dist = camDistP * 2.15 * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y - camHP, pw.z + dist);

    vObj    = p;
    vNormal = yaw * attrB.xyz;
    vView   = normalize(-vp);
    vDepth  = attrA.w;
    vKind   = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

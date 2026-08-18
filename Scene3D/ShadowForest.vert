#version 330 core
/**
 * @file ShadowForest.vert
 * @brief Vertex stage companion to ShadowForest.frag -- see that file's header for
 * this scene's description.
 */
// ShadowForest.vert — eye height on the forest floor, looking level into the
// stand.  No rotation: the motion is the trunks drifting past, which is what
// makes their shadows sweep.

in vec4 attrA;      // xyz = object position, w = kind (0 ground, 1 trunk)
in vec4 attrB;      // xyz = normal, w = per-trunk variation

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out vec3  vWorld;
out float vKind;
out float vVar;

uniform mat4  projM;
uniform mat4  lightM;
uniform float shadowPass;
uniform float eyeOff;
uniform float audioLevel;

uniform float camHP;

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

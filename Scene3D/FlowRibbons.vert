#version 330 core
// FlowRibbons.vert — the ribbons arrive finished; place them and pass through.

in vec4 attrA;      // xyz = object position, w = position along the ribbon
in vec4 attrB;      // xyz = normal, w = per-ribbon random

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vAlong;
out float vRnd;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camHP;

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

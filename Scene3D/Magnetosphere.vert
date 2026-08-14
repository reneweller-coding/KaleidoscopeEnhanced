#version 330 core
// Magnetosphere.vert — vertices arrive finished from the generator; place the
// system and pass the shading data through.

in vec4 attrA;      // xyz = object position, w = band energy on this line
in vec4 attrB;      // xyz = normal, w = 0 field line / 1 planet

out vec3  vObj;
out vec3  vNormal;
out vec3  vView;
out float vEnergy;
out float vKind;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;

void main()
{
    vec3 p = attrA.xyz;
    float dist = camDistP * (1.0 - 0.04 * audioLevel);
    vec3 vp = vec3(p.x - eyeOff, p.y, p.z + dist);

    vObj    = p;
    vNormal = attrB.xyz;
    vView   = normalize(-vp);
    vEnergy = attrA.w;
    vKind   = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
// FeatherStorm.vert — the quads arrive oriented; this only places the column.

in vec4 attrA;      // xyz = object position, w = u (quill to tip)
in vec4 attrB;      // xyz = quad normal, w = v (across the vane)

out vec3  vNormal;
out vec3  vView;
out vec3  vObj;
out vec2  vFeather;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camDistP;
uniform float camHP;

void main()
{
    vec3 p = attrA.xyz;

    float ya = audioAdvance * 0.045;
    mat3 yaw = mat3(cos(ya), 0.0, -sin(ya), 0.0, 1.0, 0.0, sin(ya), 0.0, cos(ya));
    vec3 pw = yaw * p;

    float dist = camDistP * (1.0 - 0.05 * audioLevel);
    vec3 vp = vec3(pw.x - eyeOff, pw.y - camHP, pw.z + dist);

    vObj     = p;
    vNormal  = yaw * attrB.xyz;
    vView    = normalize(-vp);
    vFeather = vec2(attrA.w, attrB.w);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

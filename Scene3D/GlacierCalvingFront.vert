#version 330 core
/**
 * @file GlacierCalvingFront.vert
 * @brief Vertex stage for GlacierCalvingFront: world positions pass
 * through (camera at the origin on the water, +z ahead); kind, life and
 * uv go to the fragment stage.  No camera motion.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = id
layout(location = 1) in vec4 attrB;   // x = life, y = kind, zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

out vec2 vTexCoord;
out vec3 vWorld;
out float vKind;
out float vLife;

void main()
{
    vec3 vp = attrA.xyz;
    vTexCoord = attrB.zw;
    vKind = attrB.y;
    vLife = attrB.x;
    vWorld = vp;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
/**
 * @file FadeOutDissolution.vert
 * @brief Vertex stage for FadeOutDissolution.comp/.frag: passes the curtain
 * particles through with their photo UV (attrB.zw) and how free they are
 * (attrB.x); kind -1 is the backdrop.  No camera motion.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = id
layout(location = 1) in vec4 attrB;   // x = free (0 in the curtain .. 1 drifting), y = kind, zw = photo uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

out vec2 vTexCoord;
out float vDepth;
out float vKind;
out float vFree;

void main()
{
    vec3 vp = attrA.xyz;
    vTexCoord = attrB.zw;
    vKind = attrB.y;
    vFree = attrB.x;
    vDepth = vp.z;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

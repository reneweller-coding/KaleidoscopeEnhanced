#version 330 core
/**
 * @file BeeWaggleDance.vert
 * @brief Vertex stage for BeeWaggleDance: world positions pass through
 * (camera at the origin, +z ahead); id, run intensity, kind and uv go to
 * the fragment stage.  No camera motion.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = id (comb: cell size)
layout(location = 1) in vec4 attrB;   // x = run intensity, y = kind, zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

out vec2 vTexCoord;
out vec3 vWorld;
out float vKind;
out float vRun;
out float vId;

void main()
{
    vec3 vp = attrA.xyz;
    vTexCoord = attrB.zw;
    vKind = attrB.y;
    vRun = attrB.x;
    vId = attrA.w;
    vWorld = vp;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

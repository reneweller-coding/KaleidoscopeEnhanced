#version 330 core
/**
 * @file SmokeRingChorus.vert
 * @brief Vertex stage for SmokeRingChorus: world positions pass through
 * (camera at the origin, +z ahead).  The torus normal arrives as xy in the
 * uv slots with its z sign in kind; it is rebuilt here.  In the opaque
 * pass only the wall is drawn, in the OIT pass only the rings (the other
 * half is collapsed behind the near plane).  No camera motion.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = ring id
layout(location = 1) in vec4 attrB;   // x = life, y = kind (-1 wall, 0/1 ring by normal z sign), zw = normal xy

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float oitPass;

out vec2 vTexCoord;
out vec3 vWorld;
out vec3 vNormal;
out float vKind;
out float vLife;
out float vId;

void main()
{
    float kind = attrB.y;
    bool isWall = kind < -0.5;
    bool wantRings = oitPass > 0.5;
    if (isWall == wantRings)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vTexCoord = vec2(0.0); vWorld = vec3(0.0); vNormal = vec3(0.0, 0.0, 1.0); vKind = kind; vLife = 0.0; vId = 0.0;
        return;
    }
    vec3 vp = attrA.xyz;
    vWorld = vp;
    vKind = kind;
    vLife = attrB.x;
    vId = attrA.w;
    if (isWall)
    {
        vTexCoord = attrB.zw;
        vNormal = vec3(0.0, 0.0, -1.0);
    }
    else
    {
        vec2 nxy = attrB.zw;
        float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.0)) * (kind > 0.5 ? -1.0 : 1.0);
        vNormal = vec3(nxy, nz);
        vTexCoord = vec2(0.0);
    }
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
/**
 * @file GlassVesselsOIT.vert
 * @brief Vertex stage for GlassVesselsOIT: positions pass through (camera
 * at the origin, +z ahead); the vessel normal is rebuilt from its packed
 * xy and z sign.  Opaque pass draws the wall and shelf, the OIT pass the
 * glass; the other half collapses behind the near plane.  No camera motion.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = vessel id
layout(location = 1) in vec4 attrB;   // x = height t, y = kind (-1 wall, -2 shelf, 0/1 glass by nz sign), zw = normal xy or uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float oitPass;

out vec2 vTexCoord;
out vec3 vWorld;
out vec3 vNormal;
out float vKind;
out float vT;
out float vId;

void main()
{
    float kind = attrB.y;
    bool isOpaque = kind < -0.5;
    bool wantGlass = oitPass > 0.5;
    if (isOpaque == wantGlass)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vTexCoord = vec2(0.0); vWorld = vec3(0.0); vNormal = vec3(0.0, 0.0, 1.0); vKind = kind; vT = 0.0; vId = 0.0;
        return;
    }
    vec3 vp = attrA.xyz;
    vWorld = vp; vKind = kind; vT = attrB.x; vId = attrA.w;
    if (isOpaque)
    {
        vTexCoord = attrB.zw;
        vNormal = (kind < -1.5) ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, -1.0);
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

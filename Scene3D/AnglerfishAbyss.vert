#version 330 core
/**
 * @file AnglerfishAbyss.vert
 * @brief ANGLERFISH ABYSS: the Anglerfish model hangs in black water, sized
 * from its bounding sphere and turning slowly on time; the sky shell is the
 * abyss.  No audio in the geometry (rule V7d): the lamp does the reacting
 * in the fragment stage.
 */
in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float sizeP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out float vBg;

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    if (isBg)
    {
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vUV = vec2(0.0); vBg = 1.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }

    vec3 p = attrA.xyz - meshCenter;
    vec3 n = attrB.xyz;
    float rad = max(length(meshExtent), 1e-4);
    float size = 20.0 * (sizeP > 0.05 ? sizeP : 1.0) / rad;
    p *= size;

    // A slow drift and turn, as a fish hanging in still water.
    float ry = time * 0.12, rx = 0.15 * sin(time * 0.09);
    mat3 RY = mat3(cos(ry), 0.0, -sin(ry), 0.0, 1.0, 0.0, sin(ry), 0.0, cos(ry));
    mat3 RX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
    p = RY * RX * p;
    n = RY * RX * n;
    p.y += 1.5 * sin(time * 0.11);
    p.z += 40.0;

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(n);
    vPos = p;
    vBg = 0.0;
    vec3 vp = vec3(p.x - eyeOff, p.y, p.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

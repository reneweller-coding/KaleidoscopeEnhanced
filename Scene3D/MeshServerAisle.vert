#version 330 core
/**
 * @file MeshServerAisle.vert
 * @brief Vertex stage companion to MeshServerAisle.frag -- see that file's
 * header. ONE server rack drawn sixteen times (instances="16"): two rows of
 * eight down a cold aisle, their fronts turned to face it, receding toward
 * a vanishing point. The generator's front is +Z; a quarter turn either
 * way faces it into the aisle. The shell is drawn by instance 0 only.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform int   meshVertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float sizeP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vInst;

const float kGround = -16.0;
const float kHalfAisle = 15.0;

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    if (!isBg)
    {
        int side = inst - (inst / 2) * 2;
        int j = inst / 2;
        float sz = 11.0 * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        // +Z to +X for the left row, +Z to -X for the right row.
        mat3 R = (side == 0) ? mat3(0.0, 0.0, -1.0,   0.0, 1.0, 0.0,   1.0, 0.0, 0.0)
                             : mat3(0.0, 0.0, 1.0,    0.0, 1.0, 0.0,   -1.0, 0.0, 0.0);
        float x = (side == 0) ? -kHalfAisle : kHalfAisle;
        float z = 28.0 + float(j) * 15.0;
        world = R * local + vec3(x, kGround + meshExtent.y / mx * sz, z);
        n = normalize(R * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocal = vec3(0.0);
        if (inst > 0)
        {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            vNormal = n; vPos = world; vBg = 1.0;
            return;
        }
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (isBg) gl_Position.z = gl_Position.w * 0.999999;

    vNormal = n;
    vPos = world;
    vBg = isBg ? 1.0 : 0.0;
}

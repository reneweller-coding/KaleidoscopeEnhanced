#version 330 core
/**
 * @file MeshCoolingTowers.vert
 * @brief Vertex stage companion to MeshCoolingTowers.frag -- see that
 * file's header. ONE cooling-tower model drawn three times (instances="3"):
 * gl_InstanceID places each copy on the plant floor at a fixed spot the
 * fragment stage knows too (it paints each tower's plume above it on the
 * sky shell). The shell is drawn by instance 0 only; the other instances
 * collapse it to a point. Concrete does not move.
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

const float kGround = -22.0;

// The three towers' feet, shared with the fragment stage.
vec3 towerFoot(int i)
{
    if (i == 0) return vec3(-66.0, kGround, 165.0);
    if (i == 1) return vec3(  4.0, kGround, 148.0);
    return              vec3( 72.0, kGround, 172.0);
}

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    if (!isBg)
    {
        float sz = 30.0 * (sizeP > 0.01 ? sizeP : 1.0);   // half of the tower's height
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        // A different yaw per tower so the three do not read as one copy.
        float yaw = 3.14159265 + 1.1 * float(inst);
        float cy = cos(yaw), sy = sin(yaw);
        mat3 yawM = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
        world = yawM * local + towerFoot(inst) + vec3(0.0, meshExtent.y / mx * sz, 0.0);
        n = normalize(yawM * attrB.xyz);
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
            // One backdrop, not three.
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

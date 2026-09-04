#version 330 core
/**
 * @file MeshAqueduct.vert
 * @brief Vertex stage companion to MeshAqueduct.frag -- see that file's
 * header. ONE short aqueduct segment (two tiers of arches) drawn seven
 * times end to end (instances="7"), so the bridge strides across the
 * valley; gl_InstanceID is the segment's place along it. The row stands
 * on the valley floor, turned a little off square so the arches recede in
 * perspective. Stone does not move. The shell is drawn by instance 0 only.
 *
 * Why a segment: asked for "a complete bridge from end to end", the
 * generator produced a square arcade box. A compact segment it does well,
 * and instancing makes the length.
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
uniform float yawP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vInst;

const float kDist   = 92.0;
const float kGround = -14.0;

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    if (!isBg)
    {
        // Scale by HEIGHT: the segment stands 34 units tall whatever its
        // proportions, and its length follows from the model.
        float szY = 17.0 * (sizeP > 0.01 ? sizeP : 1.0);
        float s = szY / meshExtent.y;
        vec3 c  = attrA.xyz - meshCenter;
        vec3 local = c * s;
        float segLen = 2.0 * meshExtent.x * s * 0.985;     // a hair of overlap at the joints

        float yaw = 3.14159265 + 0.28 + yawP;
        float cy = cos(yaw), sy = sin(yaw);
        mat3 yawM = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);

        float along = (float(inst) - 0.5 * float(max(meshInstances, 1) - 1)) * segLen;
        vec3 row = yawM * vec3(along, 0.0, 0.0);
        world = yawM * local + row + vec3(0.0, kGround + szY, kDist);
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

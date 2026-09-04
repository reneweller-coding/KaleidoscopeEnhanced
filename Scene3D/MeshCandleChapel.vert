#version 330 core
/**
 * @file MeshCandleChapel.vert
 * @brief Vertex stage companion to MeshCandleChapel.frag -- see that file's
 * header. ONE candle drawn three hundred times (instances="300") on the
 * tiered stand of a dark chapel: ten rows of thirty, rising toward the back,
 * each candle its own height and a little off its grid point. Nothing here
 * moves -- the flames live in the fragment stage as light. The shell is
 * drawn by instance 0 only.
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
out float vHash;

const float kGround = -13.0;

float hash11(float p) { return fract(sin(p * 12.9898) * 43758.5453); }

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    float fi = float(inst);
    vHash = hash11(fi * 1.37 + 0.2);
    if (!isBg)
    {
        int row = inst / 30;
        int colI = inst - row * 30;
        float fr = float(row), fc = float(colI);
        float scale = 0.7 + 0.55 * hash11(fi * 3.1 + 1.0);
        float sz = 2.4 * scale * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;

        float yaw = hash11(fi * 7.7) * 6.2831853;
        float cy = cos(yaw), sy = sin(yaw);
        mat3 yawM = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);

        float x = (fc - 14.5) * (2.7 + fr * 0.28) + (hash11(fi * 5.3) - 0.5) * 1.2;
        float z = 26.0 + fr * 6.5 + (hash11(fi * 9.1) - 0.5) * 1.5;
        float y = kGround + fr * 1.7;
        world = yawM * local + vec3(x, y + meshExtent.y / mx * sz, z);
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

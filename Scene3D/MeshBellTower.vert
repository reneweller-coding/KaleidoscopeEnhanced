#version 330 core
/**
 * @file MeshBellTower.vert
 * @brief Vertex stage companion to MeshBellTower.frag -- see that file's
 * header. ONE bronze bell drawn four times (instances="4") in a row under
 * the belfry roof, each a different size, each swinging about its own yoke
 * axle with its own period -- the big bell slowest -- on time, with the
 * amplitude eased by the swell. Bells swing; that is what they are for.
 * The shell (the belfry) is drawn by instance 0 only.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioSwell;

uniform float sizeP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vInst;
out float vSwing;

const float kDist    = 42.0;
const float kPivotY  = 14.0;
const float kSpacing = 17.0;

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    vSwing = 0.0;
    if (!isBg)
    {
        float fi = float(inst);
        float scale = 1.0 - 0.13 * fi;
        float sz = 9.0 * scale * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        float top = meshExtent.y / mx * sz;
        local.y -= top;                                   // the axle at the top

        float swell = clamp(audioSwell, 0.0, 1.0);
        float period = 3.4 - 0.45 * fi;                   // the big bell swings slowest
        float s = sin(6.2831853 * time / period + fi * 1.9);
        float ang = 0.38 * (0.45 + 0.55 * swell) * s;
        vSwing = s;
        float ca = cos(ang), sa = sin(ang);
        mat3 rotX = mat3(1.0, 0.0, 0.0,   0.0, ca, sa,   0.0, -sa, ca);
        const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
        mat3 M = rotX * turnM;

        world = M * local + vec3((fi - 1.5) * kSpacing, kPivotY, kDist + 3.0 * fi);
        n = normalize(M * attrB.xyz);
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

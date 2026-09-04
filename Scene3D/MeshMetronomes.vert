#version 330 core
/**
 * @file MeshMetronomes.vert
 * @brief Vertex stage companion to MeshMetronomes.frag -- see that file's
 * header. Two models drawn instances="12" times: the metronome body
 * (model=) and, as its pendulum rod, the lab pendulum (model2=) turned
 * upside down so its brass sphere becomes the sliding weight. gl_InstanceID
 * places body and rod on a bench in two rows; every rod swings about the
 * pivot at the foot of its body at its own tempo, on time. The shell is
 * drawn by instance 0 only.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform int   mesh2VertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;
uniform vec3  meshExtent2;
uniform vec3  meshCenter2;

uniform float sizeP;
uniform float armP;       // rod length relative to the body height (default 0.75)
uniform float pivotP;     // pivot height as a fraction of the body height (default 0.22)
uniform float frontP;     // rod offset in front of the body as a fraction of its half-depth (default 1.2)

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vInst;
out float vArm;
out float vSwing;

const float kGround = -14.0;

float hash11(float p) { return fract(sin(p * 12.9898) * 43758.5453); }

void main()
{
    int inst = gl_InstanceID;
    bool isBody = gl_VertexID <  meshVertexCount;
    bool isArm  = gl_VertexID >= meshVertexCount && gl_VertexID < mesh2VertexCount;
    bool isBg   = gl_VertexID >= mesh2VertexCount;
    vec3 world, n;
    vInst = float(inst);
    vArm = isArm ? 1.0 : 0.0;
    vSwing = 0.0;

    if (isBg && inst > 0)
    {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        vNormal = attrB.xyz; vPos = attrA.xyz; vUV = vec2(0.0); vLocal = vec3(0.0); vBg = 1.0;
        return;
    }

    float fi = float(inst);
    int row = inst / 6;
    int j = inst - row * 6;
    float sz = 6.0 * (sizeP > 0.01 ? sizeP : 1.0);
    float bodyH = 2.0 * sz;
    vec3 pos = vec3((float(j) - 2.5) * 13.0 + float(row) * 6.5, kGround, 44.0 + float(row) * 16.0);
    const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);

    if (isBody)
    {
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        world = turnM * local + pos + vec3(0.0, meshExtent.y / mx * sz, 0.0);
        n = normalize(turnM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent;
    }
    else if (isArm)
    {
        float arm = (armP > 0.01 ? armP : 0.75);
        float szA = 0.5 * bodyH * arm;
        vec3 c  = attrA.xyz - meshCenter2;
        float mx = max(meshExtent2.x, max(meshExtent2.y, meshExtent2.z));
        vec3 local = c / mx * szA;
        // Upside down: the sphere up, the bracket at the pivot.
        const mat3 flipM = mat3(-1.0, 0.0, 0.0,   0.0, -1.0, 0.0,   0.0, 0.0, 1.0);
        local = flipM * local;
        local.y += meshExtent2.y / mx * szA;            // pivot at the bottom

        float bpm = 52.0 + 150.0 * hash11(fi * 2.17 + 0.4);
        float s = sin(6.2831853 * time * bpm / 60.0 + fi);
        vSwing = s;
        float ang = 0.40 * s;
        float ca = cos(ang), sa = sin(ang);
        mat3 rotZ = mat3(ca, sa, 0.0,   -sa, ca, 0.0,   0.0, 0.0, 1.0);

        float mxB = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        float depth = meshExtent.z / mxB * sz;
        float pivotY = (pivotP > 0.01 ? pivotP : 0.22) * bodyH;
        float front = (frontP > 0.01 ? frontP : 1.2);
        world = rotZ * local + pos + vec3(0.0, pivotY, -depth * front);
        n = normalize(rotZ * flipM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = c / meshExtent2;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocal = vec3(0.0);
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

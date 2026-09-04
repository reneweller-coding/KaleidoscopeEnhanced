#version 330 core
/**
 * @file MeshGearTrain.vert
 * @brief Vertex stage companion to MeshGearTrain.frag -- see that file's
 * header. ONE brass gear drawn seven times (instances="7") as a meshing
 * train across the frame, neighbours counter-rotating on a steady rate.
 * The gear's axis is the model's THINNEST extent, whichever axis the
 * generator put it on; that axis is turned to face the camera, and the
 * spin is about it. Steady on time, never on the beat integrator: a train
 * that speeds up on every kick reads as a glitch, not as music.
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

uniform float sizeP;
uniform float rateP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vInst;
out vec2  vCentre;   // the gear's centre in world xy, for the meshing-point sparks

const float kDist = 58.0;
const float kR    = 9.0;

vec2 gearCentre(int i)
{
    float fi = float(i) - 3.0;
    return vec2(fi * 15.8, (mod(float(i), 2.0) < 0.5 ? 4.5 : -4.5));
}

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    vCentre = gearCentre(inst);
    if (!isBg)
    {
        float sz = kR * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        vec3 e  = meshExtent;
        float mx = max(e.x, max(e.y, e.z));
        vec3 local = c / mx * sz;
        vec3 nl = attrB.xyz;

        // Axis to the camera: the thinnest extent.
        mat3 toZ;
        if (e.y <= e.x && e.y <= e.z)      toZ = mat3(1.0, 0.0, 0.0,   0.0, 0.0, 1.0,   0.0, -1.0, 0.0);
        else if (e.x <= e.y && e.x <= e.z) toZ = mat3(0.0, 0.0, 1.0,   0.0, 1.0, 0.0,   -1.0, 0.0, 0.0);
        else                               toZ = mat3(1.0);

        float dir = (mod(float(inst), 2.0) < 0.5) ? 1.0 : -1.0;
        float ang = dir * time * 0.45 * (rateP > 0.01 ? rateP : 1.0) + float(inst) * 0.13;
        float ca = cos(ang), sa = sin(ang);
        mat3 spin = mat3(ca, sa, 0.0,   -sa, ca, 0.0,   0.0, 0.0, 1.0);
        mat3 M = spin * toZ;

        world = M * local + vec3(vCentre, kDist);
        n = normalize(M * nl);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = toZ * (c / e);
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

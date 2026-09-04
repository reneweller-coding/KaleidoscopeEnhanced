#version 330 core
/**
 * @file MeshPendulumWave.vert
 * @brief Vertex stage companion to MeshPendulumWave.frag -- see that file's
 * header. ONE pendulum drawn twelve times (instances="12") in a row, each
 * swinging about its own pivot at the top of the frame with its own period:
 * the n-th makes n/8 more swings than the first per cycle, so the row
 * drifts from a line into a travelling wave, into two counter-waves, into
 * chaos and back into a line. The swings run on time (never on a beat
 * tracker, so no resync can jolt them); only the amplitude eases with the
 * swell.
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
uniform float cycleP;    // seconds per full pattern cycle (default 40)

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vInst;
out float vSwing;    // -1..1: where in its swing this pendulum is

const float kDist   = 70.0;
const float kPivotY = 26.0;
const float kSpacing = 8.8;

void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    vSwing = 0.0;
    if (!isBg)
    {
        float sz = 15.0 * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        float top = meshExtent.y / mx * sz;
        local.y -= top;                       // pivot at the bracket

        float swell = clamp(audioSwell, 0.0, 1.0);
        float cyc = (cycleP > 1.0 ? cycleP : 40.0);
        float f = (8.0 + float(inst)) / cyc;
        float s = sin(6.2831853 * f * time + 0.4);
        float amp = 0.34 * (0.65 + 0.35 * swell);
        float ang = amp * s;
        vSwing = s;
        float ca = cos(ang), sa = sin(ang);
        mat3 rotZ = mat3(ca, sa, 0.0,   -sa, ca, 0.0,   0.0, 0.0, 1.0);
        const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
        mat3 M = rotZ * turnM;

        float x = (float(inst) - 5.5) * kSpacing;
        world = M * local + vec3(x, kPivotY, kDist);
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

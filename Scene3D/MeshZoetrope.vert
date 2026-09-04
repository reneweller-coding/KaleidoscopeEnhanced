#version 330 core
/**
 * @file MeshZoetrope.vert
 * @brief Vertex stage companion to MeshZoetrope.frag -- see that file's
 * header. One model: the drum spins about its spindle on time, the base
 * does not. The split is a height in the model's own frame (splitP), tuned
 * once against the model: everything above it turns, everything below
 * stands still. A steady rate, never the beat integrator.
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
uniform float rateP;
uniform float splitP;    // normalised height (-1..1) above which the model is the drum

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;
out float vDrum;

const float kDist   = 50.0;
const float kGround = -20.0;

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vDrum = 0.0;
    if (!isBg)
    {
        float sz = 18.0 * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        vec3 nl = c / meshExtent;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;

        float split = (abs(splitP) > 0.001) ? splitP : -0.35;
        float drum = smoothstep(split - 0.03, split + 0.03, nl.y);
        vDrum = drum;
        float ang = time * 1.3 * (rateP > 0.01 ? rateP : 1.0) * drum;
        float ca = cos(ang), sa = sin(ang);
        mat3 spin = mat3(ca, 0.0, -sa,   0.0, 1.0, 0.0,   sa, 0.0, ca);

        world = spin * local + vec3(0.0, kGround + meshExtent.y / mx * sz, kDist);
        n = normalize(spin * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = nl;
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

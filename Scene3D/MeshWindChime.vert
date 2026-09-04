#version 330 core
/**
 * @file MeshWindChime.vert
 * @brief Vertex stage companion to MeshWindChime.frag -- see that file's
 * header. The chime hangs from its hook at the top of the frame and sways
 * as a whole in a slow breeze: a small rotation about the hook, on time,
 * its amplitude eased by the swell. The tubes themselves do not move when
 * they sound (a struck tube RINGS in light). Half turn for the generator's
 * +Z front.
 */

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform int   meshVertexCount;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float audioSwell;

uniform float sizeP;
uniform float swayP;

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;
out float vBg;

const float kDist = 52.0;
const float kTop  = 24.0;

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    if (!isBg)
    {
        float sz = 20.0 * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        float top = meshExtent.y / mx * sz;
        local.y -= top;                       // pivot at the hook

        float swell = clamp(audioSwell, 0.0, 1.0);
        float amp = (swayP > 0.01 ? swayP : 1.0) * (0.45 + 0.55 * swell);
        float ax = 0.07 * amp * sin(time * 0.61) + 0.02 * amp * sin(time * 1.37);
        float az = 0.05 * amp * sin(time * 0.83 + 1.0);
        float cx = cos(ax), sx = sin(ax), cz = cos(az), szz = sin(az);
        mat3 rotX = mat3(1.0, 0.0, 0.0,   0.0, cx, sx,   0.0, -sx, cx);
        mat3 rotZ = mat3(cz, szz, 0.0,   -szz, cz, 0.0,   0.0, 0.0, 1.0);
        const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
        mat3 M = rotX * rotZ * turnM;

        world = M * local + vec3(0.0, kTop, kDist);
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

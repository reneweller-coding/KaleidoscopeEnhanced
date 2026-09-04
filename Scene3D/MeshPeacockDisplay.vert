#version 330 core
/**
 * @file MeshPeacockDisplay.vert
 * @brief Vertex stage companion to MeshPeacockDisplay.frag -- see that
 * file's header. gl_VertexID picks the loaded bird (below meshVertexCount)
 * or the enclosing sky shell.
 *
 * The bird stands on the ground and turns slowly, as a displaying peacock
 * does, presenting the train; the train itself quivers -- a small
 * displacement along the vertex normal, on the train only, at a fixed rate,
 * with its AMPLITUDE on the slow swell. The train is picked out in the
 * model's own normalised frame: the ring of the fan away from the body,
 * excluding the rock it stands on.
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
uniform float yawP;      // a fixed viewing yaw (radians) on top of the slow turn

out vec2  vUV;
out vec3  vNormal;
out vec3  vPos;
out vec3  vLocal;    // object space, normalised to -1..1 per axis
out float vTrain;    // 1 on the fanned train, 0 on the body and the rock
out float vBg;

const float kDist   = 54.0;
const float kGround = -21.0;

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    if (!isBg)
    {
        float sz = 22.0 * (sizeP > 0.01 ? sizeP : 1.0);   // half of the longest axis, world units
        vec3 c  = attrA.xyz - meshCenter;
        vec3 nl = c / meshExtent;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;

        float train = smoothstep(0.30, 0.60, length(nl.xy)) * (1.0 - smoothstep(-0.65, -0.85, nl.y));
        vTrain = train;

        // The quiver: fixed rate, amplitude on the swell.
        float swell = clamp(audioSwell, 0.0, 1.0);
        float q = train * 0.22 * (0.3 + 0.7 * swell) * sin(time * 9.0 + nl.x * 7.0 + nl.y * 5.0);
        local += normalize(attrB.xyz) * q;

        // The slow turn, about the bird's own vertical, plus a fixed yaw.
        // The generator builds the model facing ITS camera, which is the
        // mesh's +Z -- and +Z here points away from ours, so without the
        // half turn the shot shows the back of the fan (first render did).
        float yaw = 3.14159265 + 0.30 * sin(time * 0.19) + yawP;
        float cy = cos(yaw), sy = sin(yaw);
        mat3 yawM = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);

        world = yawM * local + vec3(0.0, kGround + meshExtent.y / mx * sz, kDist);
        n = normalize(yawM * attrB.xyz);
        vUV = vec2(attrA.w, attrB.w);
        vLocal = nl;
    }
    else
    {
        world = attrA.xyz;
        n = attrB.xyz;
        vUV = vec2(0.0);
        vLocal = vec3(0.0);
        vTrain = 0.0;
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

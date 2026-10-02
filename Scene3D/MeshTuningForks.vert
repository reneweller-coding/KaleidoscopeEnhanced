#version 330 core
/**
 * @file MeshTuningForks.vert
 * @brief Vertex stage companion to MeshTuningForks.frag -- see that file's
 * header. ONE tuning fork drawn twelve times (instances="12"), one per
 * pitch class, in a row on the sounding board; gl_InstanceID is the class.
 * The forks do not move -- a fork that visibly vibrates is a jolt -- they
 * RING in light. The shell is drawn by instance 0 only.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform int   meshInstances;   ///< Number of mesh instances.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float sizeP;   ///< Size knob, 0..1.

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;   ///< Object-space position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).
out float vInst;

const float kDist   = 42.0;
const float kGround = -10.0;
const float kSpacing = 4.6;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);
    if (!isBg)
    {
        float sz = 8.0 * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        const mat3 turnM = mat3(-1.0, 0.0, 0.0,   0.0, 1.0, 0.0,   0.0, 0.0, -1.0);
        float x = (float(inst) - 5.5) * kSpacing;
        world = turnM * local + vec3(x, kGround + meshExtent.y / mx * sz, kDist);
        n = normalize(turnM * attrB.xyz);
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

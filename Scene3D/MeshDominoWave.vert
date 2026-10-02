#version 330 core
/**
 * @file MeshDominoWave.vert
 * @brief Vertex stage companion to MeshDominoWave.frag -- see that file's
 * header. ONE domino drawn 224 times (instances="224") in eight serpentine
 * lanes on a table, seen from a low angle, and the wave of toppling runs
 * along the serpentine on sceneProgress: each tile rotates about its
 * bottom edge in its lane's direction, on its own smooth curve, as the
 * front reaches it. The shell is drawn by instance 0 only.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform int   meshInstances;   ///< Number of mesh instances.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.
uniform float sceneProgress;   ///< Progress through this scene's solo time, 0..1.

uniform float sizeP;   ///< Size knob, 0..1.

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;   ///< Object-space position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).
out float vInst;
out float vFall;
out vec3  vFront;   ///< world position of the wave front, for the spotlight that follows it

const float kGround  = -8.0;
const int   kPerLane = 28;
const float kPitch   = 2.4;

vec3 tilePos(int k)
{
    int lane = k / kPerLane;
    int j = k - lane * kPerLane;
    float dirSign = (lane - (lane / 2) * 2 == 0) ? 1.0 : -1.0;
    float x = (float(j) - 13.5) * kPitch * dirSign;
    float z = 30.0 + float(lane) * 7.0;
    return vec3(x, kGround, z);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    int inst = gl_InstanceID;
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    vInst = float(inst);

    // The front, and its spotlight.
    float f = sceneProgress * (float(meshInstances) + 30.0) - 12.0;
    int fk = int(clamp(f, 0.0, float(meshInstances) - 1.0));
    vFront = tilePos(fk);
    vFall = 0.0;

    if (!isBg)
    {
        int lane = inst / kPerLane;
        float dirSign = (lane - (lane / 2) * 2 == 0) ? 1.0 : -1.0;
        float sz = 2.2 * (sizeP > 0.01 ? sizeP : 1.0);
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;
        local.y += meshExtent.y / mx * sz;               // pivot at the bottom edge

        // Broad face across the lane: +Z to +X (or -X).
        mat3 face = mat3(0.0, 0.0, -dirSign,   0.0, 1.0, 0.0,   dirSign, 0.0, 0.0);
        // The fall: a smooth curve from upright to leaning on the next tile.
        float fall = smoothstep(0.0, 6.0, f - float(inst));
        vFall = fall;
        float ang = -1.22 * fall * dirSign;
        float ca = cos(ang), sa = sin(ang);
        mat3 rotZ = mat3(ca, sa, 0.0,   -sa, ca, 0.0,   0.0, 0.0, 1.0);
        mat3 M = rotZ * face;

        world = M * local + tilePos(inst);
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

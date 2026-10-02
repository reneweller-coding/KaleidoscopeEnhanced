#version 330 core
/**
 * @file MeshPipeOrgan.vert
 * @brief Vertex stage companion to MeshPipeOrgan.frag -- see that file's
 * header. gl_VertexID picks the loaded organ (below meshVertexCount) or the
 * enclosing sky shell.
 *
 * The organ stands on the floor of the church and does not move: an organ
 * case is furniture, the camera's own rig sweep is all the motion the shot
 * needs, and the music lives entirely in its light. A fixed yaw (yawP)
 * turns the case a little off dead-on so the towers read in depth.
 */

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float yawP;

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;    ///< object space, normalised to -1..1 per axis
out float vBg;   ///< Background flag (from the vertex stage).

const float kDist   = 64.0;
const float kGround = -23.0;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    vec3 world, n;
    if (!isBg)
    {
        float sz = 22.0 * (sizeP > 0.01 ? sizeP : 1.0);   // half of the longest axis, world units
        vec3 c  = attrA.xyz - meshCenter;
        float mx = max(meshExtent.x, max(meshExtent.y, meshExtent.z));
        vec3 local = c / mx * sz;

        // The generator builds the model facing ITS camera, the mesh's +Z,
        // which points away from ours: the half turn brings the pipes to
        // the front (the first render showed the back panel).
        float yaw = 3.14159265 + yawP;
        float cy = cos(yaw), sy = sin(yaw);
        mat3 yawM = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);

        world = yawM * local + vec3(0.0, kGround + meshExtent.y / mx * sz, kDist);
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

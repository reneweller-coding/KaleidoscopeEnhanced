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

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float sizeP;   ///< Size knob, 0..1.
uniform float swayP;

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vLocal;   ///< Object-space position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).

const float kDist = 52.0;
const float kTop  = 24.0;

/// @brief Entry point of this shader stage (the file description says what it draws).
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

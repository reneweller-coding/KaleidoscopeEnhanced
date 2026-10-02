#version 330 core
/**
 * @file VoxelizedModel.vert
 * @brief VOXELIZED MODEL: the model turns slowly on the scene clock in
 * front of the camera; the fragment stage paints it as a voxel sculpture of
 * the photo whose resolution breathes on the swell.  Positions are never
 * quantised (that would pop): the voxel look lives entirely in the colour
 * and the lighting.  No camera motion.
 */
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform int   meshVertexCount;   ///< Vertices of the scene's mesh.
uniform vec3  meshExtent;   ///< Half size of the scene's mesh bounding box.
uniform vec3  meshCenter;   ///< Centre of the scene's mesh bounding box.

uniform float sizeP;   ///< Size knob, 0..1.
uniform float tiltP;   ///< Tilt knob, 0..1.

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vObj;        ///< object-space position, unit-scaled (for the voxel grid)
out vec3 vPos;   ///< Position (from the vertex stage).
out float vBg;   ///< Background flag (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    if (isBg)
    {
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vObj = w; vUV = vec2(0.0); vBg = 1.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }
    vec3 p = attrA.xyz - meshCenter;
    vec3 n = attrB.xyz;
    float rad = max(length(meshExtent), 1e-4);
    p /= rad;                                          // unit sphere
    vObj = p;
    float ry = sceneAdvance * 0.12 + sceneTime * 0.03;
    float rx = 0.15 + 0.2 * clamp(tiltP, 0.0, 1.0);
    mat3 RY = mat3(cos(ry), 0.0, -sin(ry), 0.0, 1.0, 0.0, sin(ry), 0.0, cos(ry));
    mat3 RX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
    p = RX * RY * p;
    n = RX * RY * n;
    float size = 6.5 * (sizeP > 0.05 ? sizeP : 1.0);
    vec3 world = p * size + vec3(0.0, 0.0, 12.0);
    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(n);
    vPos = world;
    vBg = 0.0;
    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

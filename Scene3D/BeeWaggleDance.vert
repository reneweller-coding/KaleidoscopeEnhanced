#version 330 core
/**
 * @file BeeWaggleDance.vert
 * @brief Vertex stage for BeeWaggleDance: world positions pass through
 * (camera at the origin, +z ahead); id, run intensity, kind and uv go to
 * the fragment stage.  No camera motion.
 */
layout(location = 0) in vec4 attrA;   ///< xyz = position, w = id (comb: cell size)
layout(location = 1) in vec4 attrB;   ///< x = run intensity, y = kind, zw = uv

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out vec3 vWorld;   ///< World position (from the vertex stage).
out float vKind;   ///< Element kind (from the vertex stage).
out float vRun;
out float vId;   ///< Instance or element id (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 vp = attrA.xyz;
    vTexCoord = attrB.zw;
    vKind = attrB.y;
    vRun = attrB.x;
    vId = attrA.w;
    vWorld = vp;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

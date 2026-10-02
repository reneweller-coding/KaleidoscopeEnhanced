#version 330 core
/**
 * @file LidarSweepPointCloud.vert
 * @brief Vertex stage for LidarSweepPointCloud: world positions pass
 * through (camera at the origin, +z ahead); lit (freshness), kind and the
 * photo uv go to the fragment stage.  No camera motion.
 */
layout(location = 0) in vec4 attrA;   ///< xyz = position, w = id
layout(location = 1) in vec4 attrB;   ///< x = lit, y = kind, zw = uv

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out vec3 vWorld;   ///< World position (from the vertex stage).
out float vKind;   ///< Element kind (from the vertex stage).
out float vLit;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 vp = attrA.xyz;
    vTexCoord = attrB.zw;
    vKind = attrB.y;
    vLit = attrB.x;
    vWorld = vp;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
/**
 * @file WhiteHoleFountain.vert
 * @brief Vertex stage for WhiteHoleFountain.comp/.frag: the camera sits in
 * front of the horizon and the tiles fly toward and past it.  Tiles carry
 * their photo window (attrB.zw) and life (attrB.x).  No camera motion.
 */
layout(location = 0) in vec4 attrA;   ///< xyz = position, w = id
layout(location = 1) in vec4 attrB;   ///< x = life, y = kind (-1 sky, 2 horizon, 0 tile), zw = photo uv

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out float vDepth;   ///< Depth (from the vertex stage).
out float vKind;   ///< Element kind (from the vertex stage).
out float vLife;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 vp = attrA.xyz;
    vTexCoord = attrB.zw;
    vKind = attrB.y;
    vLife = attrB.x;
    if (vKind >= 0.0) vp.z += 7.5;       // world: the horizon at z = 7.5, tiles fly toward z = 0
    else vp.z = 16.0;
    vDepth = vp.z;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

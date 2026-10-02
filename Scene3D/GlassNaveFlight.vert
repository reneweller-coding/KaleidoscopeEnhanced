#version 330 core
/**
 * @file GlassNaveFlight.vert
 * @brief Vertex stage for GlassNaveFlight.comp/.frag: passes stone in the
 * opaque pass and glass in the OIT pass (the other kind collapses), rebuilds
 * the face normal from the face code, and hands the pane's spectrum band on.
 * No camera motion here: the flight lives in the generator's bay phase.
 */
layout(location = 0) in vec4 attrA;   ///< xyz = position, w = band
layout(location = 1) in vec4 attrB;   ///< x = face code, y = kind (0 stone, 1 glass, 2 sky), zw = uv

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float oitPass;   ///< Order-independent transparency pass flag.

out vec3  vPos;   ///< Position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec2  vTexCoord;   ///< Texture coordinate (from the vertex stage).
out float vBand;
out float vKind;   ///< Element kind (from the vertex stage).
out float vFace;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float kind = attrB.y;
    bool wantGlass = (oitPass > 0.5);
    if ((kind > 0.5 && kind < 1.5) != wantGlass)
    {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vPos = vec3(0.0); vNormal = vec3(0.0, 0.0, 1.0); vTexCoord = vec2(0.0); vBand = 0.0; vKind = kind; vFace = 0.0;
        return;
    }
    float face = attrB.x;
    vec3 n = (face < 0.5) ? vec3(1.0, 0.0, 0.0) : (face < 1.5) ? vec3(-1.0, 0.0, 0.0) : (face < 2.5) ? vec3(0.0, 1.0, 0.0) : (face < 3.5) ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 0.0, -1.0);
    vec3 vp = attrA.xyz;
    vPos = vp;
    vNormal = n;
    vTexCoord = attrB.zw;
    vBand = attrA.w;
    vKind = kind;
    vFace = face;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

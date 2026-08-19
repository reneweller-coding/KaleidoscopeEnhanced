#version 330 core
/**
 * @file CosmicRayCherenkovAirShowerCascade.vert
 * @brief Vertex stage companion to CosmicRayCherenkovAirShowerCascade.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = depthNorm
// attrB.w   = cherenkovGlow
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

out vec3 vPos;
out float vDepth;
out float vGlow;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vDepth = attrA.w;
    vGlow = attrB.w;

    // Stereoscopic 3D camera projection (V3).  Tilt BEFORE the translate:
    // applied after it, the fixed tilt swung the scene centre down by
    // sin(tilt)*4.8 and pushed most of the cascade under the frame.
    vec3 vp = worldP;

    // Atmospheric perspective tilt looking up into shower cascade
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.8;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
/**
 * @file SuperfluidVortexRingPinchOff.vert
 * @brief Vertex stage companion to SuperfluidVortexRingPinchOff.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = depthNorm
// attrB.w   = pinchGlow
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

    // Stereoscopic 3D camera projection (V3)
    vec3 vp = worldP;
    vp.z += 4.5;
    vp.x -= eyeOff;

    // 3D rotation
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

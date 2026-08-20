#version 330 core
/**
 * @file CosmicRayCherenkovAirShowerCascade.vert
 * @brief Vertex stage companion to CosmicRayCherenkovAirShowerCascade.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = view-space pos (the generator lays the field out for 16:9),
// attrA.w   = depthNorm
// attrB.w   = cherenkovGlow
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

out vec3 vPos;
out float vDepth;
out float vGlow;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vDepth = attrA.w;
    vGlow = attrB.w;

    // The generator already places every cascade in FRUSTUM coordinates for a
    // 16:9 frame, so no tilt or translate is applied here -- the old fixed
    // 0.65 rad tilt would have swung the deeper layers of the field straight
    // out of the picture.  Only the aspect is compensated, so a wider or
    // narrower frame still gets an edge-to-edge sky.
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    vec3 vp = worldP;
    vp.x *= aspect / 1.7778;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}

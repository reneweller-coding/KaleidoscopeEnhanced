#version 330 core
/**
 * @file MagnetoRotationalHypernovaInstability.vert
 * @brief Vertex stage companion to MagnetoRotationalHypernovaInstability.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = fluxIdx
// attrB.w   = fieldEnergy
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

out vec3 vPos;
out float vFluxIdx;
out float vEnergy;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vFluxIdx = attrA.w;
    vEnergy = attrB.w;

    // Stereoscopic 3D camera projection (V3)
    vec3 vp = worldP;
    vp.z += 4.8;
    vp.x -= eyeOff;

    // Tilt to show polar jets
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

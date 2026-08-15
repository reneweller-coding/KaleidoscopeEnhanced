#version 330 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal; // species, bioGlow, scale

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioKick;

out vec3 vPos;
out float vSpecies;
out float vBioGlow;

void main() {
    vPos = inPos;
    vSpecies = inNormal.x;
    vBioGlow = inNormal.y;

    // Stereoscopic 3D camera projection
    vec3 vp = inPos;
    vp.z += 5.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

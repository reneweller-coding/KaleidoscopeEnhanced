#version 330 core
// attrA.xyz = world pos (baked by the compute generator), attrA.w = pulse
// attrB.w   = branchLevel (Scene3DShader.cpp GEOM_INDIRECT, 8-float layout)
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioKick;

out vec3 vPos;
out float vPulse;
out float vLevel;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vPulse = attrA.w;
    vLevel = attrB.w;

    // Stereoscopic 3D camera projection
    vec3 vp = worldP;
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

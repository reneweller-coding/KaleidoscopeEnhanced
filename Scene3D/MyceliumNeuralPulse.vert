#version 330 core
// attrA.xyz = world pos (baked by the compute generator), attrA.w = pulse
// attrB.w   = branchLevel (Scene3DShader.cpp GEOM_INDIRECT, 8-float layout)
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float audioAdvance;
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
    // ORBIT (user feedback): the camera circles the structure
    vec3 vp = worldP;
    float oyaw = time * 0.12 + audioAdvance * 0.07;
    float ocy = cos(oyaw), osy = sin(oyaw);
    vp.xz = mat2(ocy, -osy, osy, ocy) * vp.xz;
    float opit = -0.25 + 0.10 * sin(time * 0.11);
    float opc = cos(opit), ops = sin(opit);
    vp.yz = mat2(opc, -ops, ops, opc) * vp.yz;
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

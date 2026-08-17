#version 330 core
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioKick;

out vec3 vWorldPos;
out vec3 vNormal;
out float vVortexPhase;

void main() {
    vec3 pos = attrA.xyz;
    vWorldPos = pos;
    vNormal = attrB.xyz;
    vVortexPhase = attrB.w;

    vec4 viewPos = vec4(pos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gl_PointSize = clamp((22.0 / max(gl_Position.w, 0.4)) * (1.0 + audioKick * 1.5), 3.0, 40.0);
}

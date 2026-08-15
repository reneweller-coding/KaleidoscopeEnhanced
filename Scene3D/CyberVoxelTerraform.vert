#version 330 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec2 inTexCoord;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 vPos;
out vec3 vNormal;
out vec2 vUV;
out float vHeight;

void main() {
    // 70x70 grid coordinates
    float cubeID = floor(float(gl_VertexID) / 36.0);
    float gridX = mod(cubeID, 70.0);
    float gridZ = floor(cubeID / 70.0);

    vec2 gridUV = (vec2(gridX, gridZ) - vec2(35.0)) / 35.0;
    float dist = length(gridUV);

    // Audio-reactive cyber voxel elevation
    float t = time * 0.4 + audioAdvance * 0.2;
    float ripple = sin(dist * 12.0 - t * 3.0) * cos(dist * 6.0 + t);
    float pyramid = max(1.0 - max(abs(gridUV.x), abs(gridUV.y)) * 1.4, 0.0);

    // Kick shockwave ripple
    float shockwave = exp(-abs(dist - fract(time * 0.8) * 1.5) * 8.0) * audioKick * 2.0;

    float height = (pyramid * 1.8 + ripple * 0.6 + shockwave) * (0.8 + 0.6 * audioBass);

    // Position of cube instance
    vec3 cubeCenter = vec3(gridUV.x * 5.0, height - 1.2, gridUV.y * 5.0);

    // Local vertex of the cube (scaled)
    vec3 localPos = (inPos - vec3(0.0, 0.0, 0.0)) * vec3(0.06, 0.06 + height * 0.15, 0.06);
    vec3 pos = cubeCenter + localPos;

    vPos = pos;
    vNormal = inNormal;
    vUV = gridUV * 0.5 + 0.5;
    vHeight = height;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    // Camera tilted down towards voxel landscape
    float tiltAngle = 0.45;
    float cosT = cos(tiltAngle), sinT = sin(tiltAngle);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 6.5;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

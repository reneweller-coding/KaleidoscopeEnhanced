#version 330 core
/**
 * @file QuantumQubitArray.vert
 * @brief attrA.xyz = unit-cube corner (-0.5..0.5), attrA.w = cube ID, attrB = seeds
 * (Scene3DShader.cpp GEOM_CUBES) — normal looked up from gl_VertexID % 36 / 6.
 */
in vec4 attrA;
in vec4 attrB;

const vec3 CUBE_FACE_NORMALS[6] = vec3[6](
    vec3( 0.0,  0.0, -1.0), vec3( 0.0,  0.0,  1.0),
    vec3(-1.0,  0.0,  0.0), vec3( 1.0,  0.0,  0.0),
    vec3( 0.0,  1.0,  0.0), vec3( 0.0, -1.0,  0.0)
);

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
uniform float audioSpectrum[32];

out vec3 vPos;
out vec3 vNormal;
out vec2 vUV;
out float vQubitState;
out float vEnergy;

void main() {
    float cubeID = attrA.w;
    float gridX = mod(cubeID, 70.0);
    float gridZ = floor(cubeID / 70.0);

    vec2 gridUV = (vec2(gridX, gridZ) - vec2(35.0)) / 35.0;
    float dist = length(gridUV);

    // Spectrum band assignment
    int bandIdx = int(clamp(dist * 31.0, 0.0, 31.0));
    float bandVal = audioSpectrum[bandIdx];

    // Qubit superposition state & Bloch sphere angle theta
    float theta = (sin(gridX * 0.4 + time * 2.0) * cos(gridZ * 0.4 - audioAdvance * 0.5)) * 0.55;
    float phi = (gridUV.x * 3.0 + gridUV.y * 3.0 + audioPhase);

    // Gate flip transient on kick
    float gateFlip = exp(-abs(dist - fract(time * 0.9) * 1.4) * 6.0) * audioKick * 0.8;

    // Tower height
    float height = (0.2 + bandVal * 1.2 + abs(sin(theta)) * 0.5 + gateFlip * 0.6) * (0.7 + 0.5 * audioBass);

    // Local qubit cube rotation (Bloch sphere rotation around Y and X)
    vec3 localP = attrA.xyz;
    float rotA = theta + gateFlip;
    float cA = cos(rotA), sA = sin(rotA);
    localP.yz = vec2(localP.y * cA - localP.z * sA, localP.y * sA + localP.z * cA);

    // Scale cube into rectangular monolith
    localP *= vec3(0.055, 0.06 + height * 0.18, 0.055);

    vec3 cubeCenter = vec3(gridUV.x * 5.6, height * 0.5 - 1.0, gridUV.y * 5.6);
    vec3 pos = cubeCenter + localP;

    vPos = pos;
    vNormal = CUBE_FACE_NORMALS[int(mod(float(gl_VertexID), 36.0)) / 6];
    vUV = gridUV * 0.5 + 0.5;
    vQubitState = sin(theta * 2.0);
    vEnergy = bandVal + gateFlip;

    // Stereoscopic 3D camera projection
    // Closer than before: at 9.5 units the array filled half the frame (reported).
    vec3 vp = pos;
    vp.y -= 1.1;
    float tiltAngle = -0.78;
    float cosT = cos(tiltAngle), sinT = sin(tiltAngle);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 4.4;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

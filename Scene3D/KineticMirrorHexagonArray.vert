#version 330 core
// KineticMirrorHexagonArray.vert
// -----------------------------------------------------------------------
// 3,000 quads (geom="quads") forming a suspended kinetic mirror sculpture.
// Mirror plates ripple and tilt in 3D space, reflecting photo textures
// with specular glints and audio wave kinematics.
// -----------------------------------------------------------------------

layout(location = 0) in vec4 attrA; // xy = quad UV [0,1], w = quad ID [0..2999]
layout(location = 1) in vec4 attrB; // seeds

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float waveP;
uniform float tiltP;
uniform float speedP;
uniform float hueP;

out vec3 vNormal;
out vec2 vTexCoord;
out vec4 vColor;

void main() {
    float wav = (waveP > 0.0) ? waveP : 1.0;
    float tlt = (tiltP > 0.0) ? tiltP : 1.0;
    float spd = (speedP> 0.0) ? speedP: 1.0;

    float id = attrA.w;
    vec2 localUV = attrA.xy - vec2(0.5);
    vTexCoord = attrA.xy;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // Hexagonal ring lattice placement
    float totalQuads = 3000.0;
    float ringID = floor(sqrt(id * 0.5));
    float angleInRing = (id - 2.0 * ringID * ringID) * (6.2831853 / max(ringID * 4.0, 1.0));
    float ringRadius = ringID * 0.12 * (1.0 + 0.2 * audioSwell);

    vec3 centerPos = vec3(
        cos(angleInRing) * ringRadius,
        sin(angleInRing) * ringRadius,
        0.0
    );

    // Dynamic wave elevation traveling through kinetic array
    float waveDist = length(centerPos.xy);
    float heightWave = sin(waveDist * 4.0 - t * 3.0 + audioPhase) * (0.4 + 0.4 * audioBass) * wav;
    centerPos.z += heightWave;

    // Kinetic mirror tilt angle (mechanical wave machine)
    float tiltAngleX = cos(waveDist * 3.0 - t * 2.5) * 0.6 * tlt;
    float tiltAngleY = sin(waveDist * 3.0 - t * 2.5) * 0.6 * tlt;

    // 180° snap flip on kick
    float snapFlip = smoothstep(0.7, 1.0, sin(waveDist * 2.0 - time * 6.0)) * 3.14159 * audioKick;
    tiltAngleX += snapFlip;

    // Quad facet vertices
    float quadSize = 0.09;
    vec3 quadOffset = vec3(localUV.x * quadSize, localUV.y * quadSize, 0.0);

    // Rotate quad offset by tilt angles
    float cx = cos(tiltAngleX), sx = sin(tiltAngleX);
    float cy = cos(tiltAngleY), sy = sin(tiltAngleY);
    quadOffset.yz = vec2(quadOffset.y * cx - quadOffset.z * sx, quadOffset.y * sx + quadOffset.z * cx);
    quadOffset.xz = vec2(quadOffset.x * cy - quadOffset.z * sy, quadOffset.x * sy + quadOffset.z * cy);

    vec3 pos = centerPos + quadOffset;

    // Surface normal calculation
    vec3 localNormal = vec3(0.0, 0.0, 1.0);
    localNormal.yz = vec2(localNormal.y * cx - localNormal.z * sx, localNormal.y * sx + localNormal.z * cx);
    localNormal.xz = vec2(localNormal.x * cy - localNormal.z * sy, localNormal.x * sy + localNormal.z * cy);
    vNormal = normalize(localNormal);

    // Rim lighting & mirror chrome color
    vec3 chrome = vec3(0.8, 0.9, 1.0);
    vec3 neonEdge = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + ringID * 0.3 + audioPhase);
    vColor = vec4(mix(chrome, neonEdge, 0.3), 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

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

uniform float toroidP;
uniform float iscoP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out float vDoppler;

void main() {
    float trd = (toroidP > 0.0) ? toroidP : 1.0;
    float isc = (iscoP   > 0.0) ? iscoP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    // 220x120 grid coordinates in [-1, 1]
    vec2 gridUV = attrA.xy;
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Convert Cartesian grid to polar accretion disk coords (r, theta)
    float r = length(gridUV) * 4.5 * trd;
    float theta = atan(gridUV.y, gridUV.x);

    // Inner ISCO boundary plunge (r < 1.0 drops rapidly into singularity)
    float iscoRadius = 1.2 * isc;
    float iscoPlunge = smoothstep(iscoRadius, iscoRadius * 0.4, r) * -2.5;

    // Keplerian rotation velocity: v_phi ~ 1 / sqrt(r)
    float omega = (1.5 / max(sqrt(r), 0.5)) * t;
    float spiralTheta = theta - omega;

    // Toroidal disk height profile: h(r) = r * sin(spiralTheta * 2) * exp(-r * 0.5)
    float diskHeight = exp(-abs(r - 2.5) * 1.2) * (0.8 + 0.4 * sin(spiralTheta * 3.0 + t)) * (1.0 + 0.4 * audioBass);
    diskHeight += iscoPlunge;

    vec3 pos = vec3(gridUV.x * 3.5, diskHeight, gridUV.y * 3.5);
    vWorldPos = pos;

    // Relativistic Doppler beaming factor: approaching side (x > 0) is blue-shifted, receding side (x < 0) is red-shifted
    vDoppler = clamp(gridUV.x * (0.8 / max(sqrt(r), 0.6)), -1.0, 1.0);

    // Surface normal estimation
    vNormal = normalize(vec3(-gridUV.x * 0.3, 1.0, -gridUV.y * 0.3));

    vec4 viewPos = vec4(pos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

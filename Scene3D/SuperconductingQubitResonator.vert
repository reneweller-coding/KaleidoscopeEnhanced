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

uniform float qubitP;
uniform float meanderP;
uniform float widthP;
uniform float hueP;

out vec3 vWorldPos;
out vec2 vTexCoord;
out float vQubitIndex;

void main() {
    float qbt = (qubitP   > 0.0) ? qubitP   : 1.0;
    float mnd = (meanderP > 0.0) ? meanderP : 1.0;
    float wdp = (widthP   > 0.0) ? widthP   : 1.0;

    int ribbonIdx = int(attrB.x);
    float s = attrA.x;       // [0, 1] along resonator
    float side = attrA.y;    // -1 or +1
    vQubitIndex = float(ribbonIdx) / 20.0;
    vTexCoord = vec2(s * 8.0, side * 0.5 + 0.5);

    float t = time * 0.4 + audioAdvance * 0.2;

    // Resonator array layout: 20 parallel coplanar waveguides with meander turns
    float xBase = (float(ribbonIdx) - 10.0) * 0.35 * qbt;
    float yMeander = sin(s * 25.0 * mnd) * 0.25;
    float z = (s - 0.5) * 5.0;

    // Microwave standing wave voltage: V(s) = V_0 * cos(n * pi * s)
    float standingVoltage = cos(s * 12.566 - t * 4.0) * (0.08 + 0.04 * audioBass);

    vec3 p0 = vec3(xBase + yMeander, standingVoltage, z);

    // Tangent & Binormal
    vec3 tangent = normalize(vec3(cos(s * 25.0 * mnd) * 6.25, 0.0, 5.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)));

    float ribbonWidth = (0.035 + 0.015 * sin(s * 30.0 + t * 4.0)) * wdp * (1.0 + audioKick * 0.6);
    vec3 worldPos = p0 + binormal * (side * ribbonWidth);
    vWorldPos = worldPos;

    vec4 viewPos = vec4(worldPos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

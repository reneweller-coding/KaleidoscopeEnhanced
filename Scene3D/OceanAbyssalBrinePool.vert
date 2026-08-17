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

uniform float brineP;
uniform float haloclineP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;

void main() {
    float brn = (brineP      > 0.0) ? brineP      : 1.0;
    float hlc = (haloclineP  > 0.0) ? haloclineP  : 1.0;
    float spd = (speedP      > 0.0) ? speedP      : 1.0;

    vec2 gridUV = attrA.xy;
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Brine pool shoreline basin (bowl depression: r > 0.8 is underwater beach, r < 0.8 is dense brine pool)
    float r = length(gridUV) * 2.5;
    float basinDepth = smoothstep(1.5, 0.4, r) * -0.8 * brn;

    // Dense hypersaline internal waves on the brine pool surface
    float internalWave = sin(gridUV.x * 12.0 * hlc + t * 2.0) * cos(gridUV.y * 10.0 - t * 1.5) * 0.08 * (1.0 + audioBass * 0.6);

    float height = basinDepth + internalWave;
    vec3 pos = vec3(gridUV.x * 3.5, height, gridUV.y * 3.5);
    vWorldPos = pos;

    vNormal = normalize(vec3(-gridUV.x * 0.4, 1.0, -gridUV.y * 0.4));

    vec4 viewPos = vec4(pos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

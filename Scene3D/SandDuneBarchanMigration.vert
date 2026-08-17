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

uniform float duneP;
uniform float rippleP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;

void main() {
    float dne = (duneP   > 0.0) ? duneP   : 1.0;
    float rpl = (rippleP > 0.0) ? rippleP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    vec2 gridUV = attrA.xy; // [-1, 1]
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Barchan crescent dune profile: crescent horns pointing downwind
    vec2 p = gridUV * vec2(3.5, 3.5) + vec2(t * 0.4, 0.0);
    float crescentY = p.y - sin(p.x * 2.0) * 0.4;
    float duneHeight = max(0.0, sin(p.x * 2.0 * dne) * cos(crescentY * 2.0)) * 1.2 * (1.0 + 0.3 * audioBass);

    // Wind saltation ripples along the windward slope
    float ripples = sin(p.x * 35.0 * rpl + p.y * 15.0) * 0.04 * (1.0 + audioHigh * 0.8);
    duneHeight += ripples;

    vec3 pos = vec3(gridUV.x * 3.5, duneHeight - 0.5, gridUV.y * 3.5);
    vWorldPos = pos;

    // Normal estimation
    vNormal = normalize(vec3(-cos(p.x * 2.0) * 0.4, 1.0, -sin(crescentY * 2.0) * 0.4));

    vec4 viewPos = vec4(pos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

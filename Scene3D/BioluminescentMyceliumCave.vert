#version 330 core
// BioluminescentMyceliumCave.vert

layout(location = 0) in vec4 attrA; // xyz = pos, w = strandID
layout(location = 1) in vec4 attrB; // x = seed, y = u, zw = uv

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

uniform float hueP;

out vec4 vColor;
out vec2 vTexCoord;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec3 pos = attrA.xyz;
    float strandID = attrA.w;
    float u = attrB.y;
    vTexCoord = attrB.zw;

    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Action potential electrical wave propagating down the mycelium
    float pulse = fract(u * 2.0 - time * 2.0 - strandID * 0.1);
    float pulseGlow = exp(-pulse * 6.0) * (1.5 + audioKick * 3.0);

    // Bio-luminescence palette: Cave emerald green, bio-blue, spore gold
    vec3 bioEmerald = vec3(0.1, 0.95, 0.4);
    vec3 bioBlue    = vec3(0.05, 0.5, 1.0);
    vec3 sporeGold  = vec3(1.0, 0.9, 0.3);

    vec3 col = mix(bioEmerald, bioBlue, u);
    col = mix(col, sporeGold, pulseGlow * 0.5);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vColor = vec4(col * (0.8 + 0.6 * audioLevel + pulseGlow), 1.0);

    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

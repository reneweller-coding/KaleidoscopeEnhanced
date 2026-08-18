#version 330 core
/**
 * @file SupernovaRemnantNebula.vert
 * @brief Vertex stage companion to SupernovaRemnantNebula.frag -- see that file's header for
 * this scene's description.
 */
// SupernovaRemnantNebula.vert

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

    // Supernova emission lines: [SII] Red, H-alpha Crimson, [OIII] Emerald/Cyan
    vec3 sulfurRed   = vec3(0.95, 0.15, 0.05);
    vec3 oxygenCyan  = vec3(0.0, 0.85, 0.9);
    vec3 hydrogenPink = vec3(1.0, 0.3, 0.6);

    vec3 col = mix(sulfurRed, oxygenCyan, u);
    col = mix(col, hydrogenPink, sin(strandID * 0.4 + time) * 0.5 + 0.5);

    // Central pulsar flash
    float pulsarGlow = exp(-length(pos) * 1.5) * (audioKick * 2.5 + audioSubBass * 1.2);
    col += pulsarGlow * vec3(1.0, 0.95, 0.85);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vColor = vec4(col * (0.85 + 0.5 * audioLevel), 1.0);

    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
// PlasmaFilamentTornado.vert

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

out vec4 vColor;
out vec2 vTexCoord;

void main() {
    vec3 pos = attrA.xyz;
    float strandID = attrA.w;
    float u = attrB.y;
    vTexCoord = attrB.zw;

    // Relativistic plasma emission colors: Hot Cyan, Electric Violet, Blinding Core White
    vec3 plasmaCyan   = vec3(0.0, 0.85, 1.0);
    vec3 plasmaViolet = vec3(0.7, 0.15, 1.0);
    vec3 coreWhite    = vec3(1.0, 0.98, 0.95);

    vec3 col = mix(plasmaCyan, plasmaViolet, sin(strandID * 0.2 + time) * 0.5 + 0.5);
    col = mix(col, coreWhite, exp(-length(pos.xz) * 3.0) * (0.5 + 1.0 * audioKick));

    vColor = vec4(col * (0.8 + 0.6 * audioLevel), 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

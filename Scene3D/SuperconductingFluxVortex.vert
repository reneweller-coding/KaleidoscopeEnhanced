#version 330 core
// SuperconductingFluxVortex.vert

layout(location = 0) in vec4 attrA; // xyz = pos, w = vortexID
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
    float vortexID = attrA.w;
    float u = attrB.y;
    vTexCoord = attrB.zw;

    // 3D rotation of superconductor slab
    float rotY = time * 0.25 + audioPhase * 0.1;
    float cy = cos(rotY), sy = sin(rotY);
    pos.xz = vec2(pos.x * cy - pos.z * sy, pos.x * sy + pos.z * cy);

    // Superconducting quantum colors: Cyan (Flux line), Electric Violet (Cooper pairs), Neon Emerald
    vec3 fluxCyan     = vec3(0.0, 0.9, 1.0);
    vec3 cooperViolet = vec3(0.7, 0.15, 1.0);
    vec3 meissnerGreen= vec3(0.1, 1.0, 0.5);

    vec3 col = mix(fluxCyan, cooperViolet, sin(vortexID * 0.3 + time) * 0.5 + 0.5);
    col = mix(col, meissnerGreen, exp(-abs(pos.z) * 1.5) * (0.5 + 1.0 * audioKick));

    vColor = vec4(col * (0.8 + 0.6 * audioLevel), 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

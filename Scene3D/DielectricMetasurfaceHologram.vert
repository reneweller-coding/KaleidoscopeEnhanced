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

uniform float metaP;
uniform float phaseP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec2 vTexCoord;
out float vMetaPhase;

void main() {
    float mtp = (metaP  > 0.0) ? metaP  : 1.0;
    float phs = (phaseP > 0.0) ? phaseP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;

    int quadIndex = gl_InstanceID;
    vMetaPhase = float(quadIndex) / 3000.0;
    vec2 corner = attrA.xy;
    vTexCoord = corner * 0.5 + 0.5;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // 55x55 metasurface grid array with holographic Z-extrusion
    int row = quadIndex / 55;
    int col = quadIndex % 55;
    float x = (float(col) - 27.5) * 0.1 * mtp;
    float y = (float(row) - 27.5) * 0.1 * mtp;

    // Hologram phase shift modulation: phi(x, y) = 2*pi * (x^2 + y^2) / 2f
    float holoPhase = (x * x + y * y) * 1.5 * phs - t * 4.0;
    float z = sin(holoPhase) * 0.8 * (1.0 + 0.3 * audioBass);

    float cardScale = 0.045 * (1.0 + audioKick * 0.6);
    vec3 worldPos = vec3(x, y, z) + vec3(corner.x, corner.y, 0.0) * cardScale;
    vWorldPos = worldPos;

    vec4 viewPos = vec4(worldPos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

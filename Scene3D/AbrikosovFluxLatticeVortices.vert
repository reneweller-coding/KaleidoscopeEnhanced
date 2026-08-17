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

uniform float fluxP;
uniform float kelvinP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out float vVortexPhase;

void main() {
    float flx = (fluxP   > 0.0) ? fluxP   : 1.0;
    float klv = (kelvinP > 0.0) ? kelvinP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    int particleIdx = gl_VertexID;
    float pNorm = float(particleIdx) / 60000.0;
    vVortexPhase = pNorm;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    // 200 vortices each with 300 points along Z-axis
    int vortexID = particleIdx / 300;
    float zNorm = float(particleIdx % 300) / 300.0; // [0, 1]
    float z = (zNorm - 0.5) * 4.5;

    // Triangular Abrikosov lattice base coordinates (hexagonal packing)
    float row = float(vortexID / 14);
    float col = float(vortexID % 14);
    float hexX = (col + mod(row, 2.0) * 0.5 - 7.0) * 0.35 * flx;
    float hexY = (row - 7.0) * 0.303 * flx;

    // Helical Kelvin wave excitations along the vortex core: r_k(z, t)
    float kelvinWave = sin(z * 6.0 * klv - t * 5.0 + float(vortexID) * 0.5);
    float kelvinCos  = cos(z * 6.0 * klv - t * 5.0 + float(vortexID) * 0.5);
    float waveAmp = (0.06 + 0.04 * audioBass) * (1.0 + audioKick * 0.8);

    vec3 worldPos = vec3(hexX + kelvinWave * waveAmp, hexY + kelvinCos * waveAmp, z);
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view).
    // Without the push-back only the half of the lattice that happened to fall
    // beyond the near plane was ever visible.
    vec3 vp = worldPos;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point sprite size
    gl_PointSize = clamp((18.0 / max(gl_Position.w, 0.4)) * (1.0 + audioKick * 1.2), 2.0, 32.0);
}

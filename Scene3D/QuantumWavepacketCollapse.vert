#version 330 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 vPos;
out float vProb;
out float vPhase;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 19.19;
    p *= p + p;
    return fract(p);
}

void main() {
    float id = float(gl_VertexID);
    float seed = hash11(id);

    // Spherical coordinates of 3D quantum eigenstate harmonic oscillator
    float r = length(inPos) * 2.5;
    float theta = acos(clamp(inPos.z / max(r, 0.001), -1.0, 1.0));
    float phi = atan(inPos.y, inPos.x);

    // Superposition of spherical harmonics Y_lm and radial Laguerre modes
    float t = time * 0.5 + audioAdvance * 0.2;
    float mode1 = sin(r * 3.0 - t * 2.0) * cos(theta * 2.0);
    float mode2 = cos(r * 4.0 - t * 3.0 + phi * 3.0) * sin(theta * 3.0);
    float mode3 = sin(r * 6.0 - t * 4.0 - phi * 2.0);

    // Complex probability amplitude psi
    float psiRe = mode1 + mode2 * 0.7;
    float psiIm = mode3 + mode1 * 0.5;
    float prob = (psiRe * psiRe + psiIm * psiIm) * (0.8 + 0.4 * audioSwell);
    float qPhase = atan(psiIm, psiRe);

    // Beat transient triggers localized wavepacket collapse towards a nodal singularity
    vec3 collapseCenter = vec3(sin(t * 0.7) * 1.5, cos(t * 0.5) * 1.2, sin(t * 0.3) * 1.0);
    float collapseAmount = audioKick * 0.7;

    vec3 pos = mix(inPos * (1.5 + 0.8 * prob), collapseCenter + normalize(inPos - collapseCenter) * (0.3 + 0.5 * seed), collapseAmount);

    vPos = pos;
    vProb = prob;
    vPhase = qPhase;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gl_PointSize = clamp((2.5 + 4.0 * prob + audioKick * 6.0) * (6.0 / vp.z), 1.0, 32.0);
}

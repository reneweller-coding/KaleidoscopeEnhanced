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

uniform float nP;
uniform float lensP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out float vPhaseVelocity;

void main() {
    float nVal = (nP     > 0.0) ? nP     : 1.0;
    float lns  = (lensP  > 0.0) ? lensP  : 1.0;
    float spd  = (speedP > 0.0) ? speedP : 1.0;

    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;   // [-1,1]
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    // Interface at gridUV.y = 0: positive index region (y > 0), negative index metamaterial (y < 0)
    float isNegative = (gridUV.y < 0.0) ? -1.0 : 1.0;
    vPhaseVelocity = isNegative;

    // Backwards phase velocity in negative index medium: k_y flips sign!
    float kx = gridUV.x * 12.0 * lns;
    float ky = abs(gridUV.y) * 12.0 * nVal;
    float wavePhase = (isNegative > 0.0) ? (kx + ky - t * 4.0) : (kx - ky - t * 4.0);

    // Negative refraction superlens focusing peak at y = -0.5
    float superlensFocus = exp(-length(vec2(gridUV.x * 2.0, gridUV.y + 0.5)) * 6.0);

    float height = sin(wavePhase) * 0.35 * (1.0 + 0.3 * audioBass) + superlensFocus * (0.6 + audioKick * 0.8);
    vec3 pos = vec3(gridUV.x * 3.5, height, gridUV.y * 3.5);
    vWorldPos = pos;

    vNormal = normalize(vec3(-cos(wavePhase) * 0.4, 1.0, -isNegative * sin(wavePhase) * 0.4));

    // Camera transform: this surface lies in the XZ plane, so pitch it down
    // first (otherwise it is seen edge-on), then push away along +z and negate
    // -- projM expects NEGATIVE view-space z (clip-w = -z_view).
    vec3 vp = pos;
    vp.y -= 1.3;
    float camTilt = -0.45;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

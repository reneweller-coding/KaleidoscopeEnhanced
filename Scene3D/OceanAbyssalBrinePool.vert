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

    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;   // [-1,1]
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

    // Camera: slow ORBIT around the brine basin (yaw), then pitch DOWN onto
    // it (negative tilt — the old +0.45 tipped the pool into a ceiling seen
    // from below), then push away along +z and negate -- projM expects
    // NEGATIVE view-space z (clip-w = -z_view).
    vec3 vp = pos;
    float yaw = time * 0.12 * spd + audioAdvance * 0.06;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    vp.y -= 1.4;
    float camTilt = -0.5;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

#version 330 core
// HolographicLaserDiffractionGrid.vert — 3,000 spatial light modulator (SLM)
// holographic cards reconstructing 3D Fourier optical diffraction patterns.
//   attrA.xy = corner u/v (0..1), attrA.w = quad index
//   attrB    = per-quad seeds

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioCentroid;
uniform float audioSwell;
uniform float audioHigh;

uniform float gratingP;
uniform float depthP;
uniform float speedP;
uniform float hueP;

out vec4 vCol;
out vec2 vUV;
out vec3 vNormal;
out vec3 vWorldPos;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float qi = attrA.w;
    vec2 corner = attrA.xy - 0.5; // -0.5..0.5
    vec4 seeds = attrB;

    float grt = (gratingP > 0.0) ? gratingP : 1.0;
    float dpt = (depthP   > 0.0) ? depthP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    float t = time * 0.4 * spd + audioAdvance * 0.15;

    // 3D cylindrical holographic array
    float ringIdx = floor(qi / 300.0); // 10 rings
    float slotIdx = mod(qi, 300.0);

    float angle = (slotIdx / 300.0) * 6.2831853 + time * 0.2 * ((mod(ringIdx, 2.0) > 0.5) ? 1.0 : -1.0);
    float radius = (4.0 + ringIdx * 1.5) * grt + audioSwell * 1.8;
    float y = (ringIdx - 5.0) * 1.6 * dpt + sin(angle * 4.0 + t) * 0.6;

    vec3 centerPos = vec3(cos(angle) * radius, y, sin(angle) * radius);

    // Kick laser burst expansion
    centerPos += normalize(centerPos) * audioKick * 1.8;

    // Card orientation: tangent to ring
    float yaw = angle + 1.5708;
    mat3 rotY = mat3(cos(yaw), 0.0, sin(yaw), 0.0, 1.0, 0.0, -sin(yaw), 0.0, cos(yaw));

    vec3 cardSize = vec3(0.65, 0.65, 0.0);
    vec3 localPos = rotY * vec3(corner.x * cardSize.x, corner.y * cardSize.y, 0.0);
    vec3 worldP = centerPos + localPos;

    // Camera space
    vec3 camPos = vec3(0.0, 3.0, -18.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = attrA.xy;
    vNormal = rotY * vec3(0.0, 0.0, 1.0);
    vWorldPos = worldP;

    // Holographic laser diffraction palette (laser red, neon emerald, optical violet)
    vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + angle * 2.0 + ringIdx * 0.5 + audioPhase);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (0.85 + 0.5 * audioHigh), 1.0);
}

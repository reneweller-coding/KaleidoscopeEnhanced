#version 330 core
// MoireHyperInterference.vert — 220x120 heightfield grid undulating
// with optical Moiré superlattices and dynamic interference zone plates.
//   attrA.xy = grid UV (0..1), attrA.zw = quad index

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioHigh;

uniform float freqP;
uniform float depthP;
uniform float speedP;
uniform float hueP;

out vec4 vCol;
out vec2 vUV;
out vec3 vNormal;
out float vInterference;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec2 gridUV = attrA.xy; // 0..1

    float frq = (freqP  > 0.0) ? freqP  : 1.0;
    float dpt = (depthP > 0.0) ? depthP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    float x = (gridUV.x - 0.5) * 20.0;
    float z = (gridUV.y - 0.5) * 20.0;

    float t = time * 0.35 * spd + audioAdvance * 0.15;

    // Dual rotating high-frequency optical grating grids
    float a1 = t * 0.3;
    float a2 = -t * 0.25;

    vec2 p1 = vec2(cos(a1) * x - sin(a1) * z, sin(a1) * x + cos(a1) * z) * frq;
    vec2 p2 = vec2(cos(a2) * x - sin(a2) * z, sin(a2) * x + cos(a2) * z) * (frq * 1.05);

    float g1 = sin(p1.x * 6.0) * sin(p1.y * 6.0);
    float g2 = sin(p2.x * 6.0) * sin(p2.y * 6.0);

    // Moiré superlattice beat frequency
    float moire = g1 * g2;
    float y = moire * 1.8 * dpt * (1.0 + 0.3 * audioBass);

    // Kick elevation
    y += audioKick * 1.5 * abs(moire);

    vec3 worldP = vec3(x, y, z);

    // Camera space
    vec3 camPos = vec3(0.0, 6.0, -16.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = gridUV;
    vInterference = abs(moire);
    vNormal = normalize(vec3(-sin(p1.x) * 0.5, 1.0, -cos(p2.y) * 0.5));

    // Holographic rainbow interference palette
    vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + moire * 5.0 + t + audioPhase);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (0.8 + 0.6 * audioHigh), 1.0);
}

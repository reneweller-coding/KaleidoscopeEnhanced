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

uniform float torusP;
uniform float linkP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out float vIndex;

void main() {
    float trs = (torusP > 0.0) ? torusP : 1.0;
    float lnk = (linkP  > 0.0) ? linkP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;

    // The engine draws NON-instanced (glDrawArrays), so gl_InstanceID is
    // always 0 -- every unit would collapse onto one spot.  Scene3DShader
    // packs the per-unit index into attrA.w instead (see buildGeometry).
    int cubeIndex = int(attrA.w);
    vIndex = float(cubeIndex) / 4900.0;

    // Cube corner local vertex
    vec3 cubeCorner = attrA.xyz;
    vNormal = attrB.xyz;
    vTexCoord = attrA.xy * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // 4D Clifford Torus parameters: (u, v) on S3
    float u = float(cubeIndex % 70) / 70.0 * 6.2831853;
    float v = float(cubeIndex / 70) / 70.0 * 6.2831853;

    // 4D coordinates on S3: (cos u, sin u, cos v, sin v) / sqrt(2)
    float rot4D = t * 0.5 * lnk;
    vec4 p4D = vec4(cos(u), sin(u), cos(v + rot4D), sin(v + rot4D)) * 0.7071;

    // Stereographic projection from 4D to 3D: P_3D = (x, y, z) / (1 - w)
    float denom = max(1.0 - p4D.w * 0.65, 0.2);
    vec3 torusCenter = p4D.xyz / denom * 2.8 * trs;

    // Cube size audio scaling
    float cubeScale = (0.045 + 0.03 * sin(u * 3.0 + t * 2.0)) * (1.0 + audioKick * 0.8);
    vec3 worldPos = torusCenter + cubeCorner * cubeScale;
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    vec3 vp = worldPos;
    vp.z += 9.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

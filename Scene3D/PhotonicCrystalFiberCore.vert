#version 330 core
/**
 * @file PhotonicCrystalFiberCore.vert
 * @brief Vertex stage companion to PhotonicCrystalFiberCore.frag -- see that file's header for
 * this scene's description.
 */
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

uniform float pcfP;
uniform float coreP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out float vCoreDist;

void main() {
    float pcf = (pcfP  > 0.0) ? pcfP  : 1.0;
    float cor = (coreP > 0.0) ? coreP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;

    // The engine draws NON-instanced (glDrawArrays), so gl_InstanceID is
    // always 0 -- every unit would collapse onto one spot.  Scene3DShader
    // packs the per-unit index into attrA.w instead (see buildGeometry).
    int cubeIndex = int(attrA.w);
    vec3 cubeCorner = attrA.xyz;
    vNormal = attrB.xyz;
    vTexCoord = attrA.xy * 0.5 + 0.5;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // 70x70 hexagonal honeycomb lattice array
    int row = cubeIndex / 70;
    int col = cubeIndex % 70;
    float x = (float(col) - 35.0 + mod(float(row), 2.0) * 0.5) * 0.08 * pcf;
    float y = (float(row) - 35.0) * 0.06928 * pcf;

    // Hollow core radius (central air hole)
    float r = length(vec2(x, y));
    vCoreDist = r;
    float isHollow = smoothstep(0.3 * cor, 0.45 * cor, r);

    // Z-axis longitudinal wave
    float z = (float(cubeIndex % 20) / 20.0 - 0.5) * 4.0;
    float pulse = sin(z * 8.0 - t * 6.0) * (0.04 + 0.03 * audioBass);

    float cubeScale = 0.035 * isHollow * (1.0 + audioKick * 0.5);
    vec3 worldPos = vec3(x, y + pulse, z) + cubeCorner * cubeScale;
    vWorldPos = worldPos;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    // Gentle roll around the fiber axis (flight is carried by the light
    // pulses racing down the core, see the frag)
    vec3 vp = worldPos;
    float fro = time * 0.06;
    vp.xy = mat2(cos(fro), -sin(fro), sin(fro), cos(fro)) * vp.xy;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

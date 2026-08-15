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
out float vNodalDist;
out float vPlateEnergy;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 113.17;
    p *= p + p;
    return fract(p);
}

void main() {
    float id = float(gl_VertexID);
    float seedX = hash11(id);
    float seedY = hash11(id + 5000.0);

    // Initial random position on square plate [-1, 1]
    vec2 p = vec2(seedX * 2.0 - 1.0, seedY * 2.0 - 1.0);

    // Chladni modal numbers (m, n) driven by spectrum / audio frequencies
    float m = 3.0 + floor(mod(audioAdvance * 0.5 + audioMid * 4.0, 5.0));
    float n = 2.0 + floor(mod(audioAdvance * 0.3 + audioBass * 3.0, 4.0));

    float pi = 3.14159265;
    // Chladni vibration amplitude function
    float w = sin(n * pi * p.x * 0.5) * sin(m * pi * p.y * 0.5) - sin(m * pi * p.x * 0.5) * sin(n * pi * p.y * 0.5);

    // Gradient of vibration field: particles drift down the gradient towards w = 0 (nodal lines)
    float eps = 0.01;
    float wX = (sin(n * pi * (p.x + eps) * 0.5) * sin(m * pi * p.y * 0.5) - sin(m * pi * (p.x + eps) * 0.5) * sin(n * pi * p.y * 0.5) - w) / eps;
    float wY = (sin(n * pi * p.x * 0.5) * sin(m * pi * (p.y + eps) * 0.5) - sin(m * pi * p.x * 0.5) * sin(n * pi * (p.y + eps) * 0.5) - w) / eps;
    vec2 gradW = vec2(wX, wY);

    // Dynamic displacement towards nodal lines
    float drift = 0.4 * (1.0 - 0.5 * audioKick);
    vec2 nodalPos = p - gradW * w * drift;

    // Bounce height on beat kicks
    float bounce = abs(w) * (0.2 + 0.8 * audioKick) * (0.8 + 0.4 * audioBass);

    vec3 pos = vec3(nodalPos.x * 3.0, bounce - 0.8, nodalPos.y * 3.0);

    vPos = pos;
    vNodalDist = abs(w);
    vPlateEnergy = (1.0 - abs(w)) * (1.0 + audioKick * 2.0);

    // Stereoscopic 3D camera projection with downward plate angle
    vec3 vp = pos;
    float tilt = 0.45;
    float cosT = cos(tilt), sinT = sin(tilt);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 5.2;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gl_PointSize = clamp((2.5 + 3.5 * vPlateEnergy) * (5.5 / rotatedVP.z), 1.0, 32.0);
}

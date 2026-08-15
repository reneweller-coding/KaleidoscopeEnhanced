#version 330 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec2 inTexCoord;

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
out vec2 vUV;
out float vRadiation;
out float vBeamID;

void main() {
    float ribbonID = floor(float(gl_VertexID) / 1200.0);
    float tAlong = inTexCoord.x * 6.2831853; // Angle around storage ring

    // Storage ring radius
    float R0 = 3.2;

    // Periodic undulator wiggling magnets
    float wiggles = 24.0;
    float wiggleAmp = (0.15 + 0.1 * audioBass) * sin(tAlong * wiggles);

    float ringAngle = tAlong + time * 0.5 + audioAdvance * 0.3;
    float r = R0 + wiggleAmp;

    // Electron orbit coordinates
    vec3 orbitCenter = vec3(r * cos(ringAngle), sin(tAlong * 3.0 + ribbonID) * 0.2, r * sin(ringAngle));

    // Relativistic synchrotron radiation beam emission
    float radiation = abs(cos(tAlong * wiggles)) * (1.0 + audioKick * 3.0);

    // Ribbon cross-section width
    vec3 tangent = normalize(vec3(-sin(ringAngle), 0.0, cos(ringAngle)));
    vec3 normal = vec3(0.0, 1.0, 0.0);

    float width = (0.05 + 0.03 * radiation) * (1.0 + audioSwell * 0.5);
    vec3 pos = orbitCenter + normal * (inTexCoord.y - 0.5) * width;

    vPos = pos;
    vUV = inTexCoord;
    vRadiation = radiation;
    vBeamID = ribbonID / 20.0;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

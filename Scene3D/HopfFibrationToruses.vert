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
out float vFiberID;
out float vEnergy;

void main() {
    float ribbonID = floor(float(gl_VertexID) / 1200.0);
    float tAlong = inTexCoord.x * 6.2831853; // Angle along fiber circle

    // 4D Hopf Fibration parameterization
    // Each fiber is defined by two angles eta (torus radius) and xi (torus angle)
    float eta = (ribbonID / 20.0) * 1.5707963; // 0..pi/2
    float xi = (ribbonID / 20.0) * 6.2831853 + time * 0.2 + audioAdvance * 0.1;

    // 4D Clifford rotation driven by audio
    float t4D = time * 0.4 + audioAdvance * 0.2;
    float psi = tAlong + t4D;
    float phi = xi + t4D * 0.5;

    // Coordinates on 4D 3-sphere S3
    float x1 = cos(psi) * sin(eta);
    float x2 = sin(psi) * sin(eta);
    float x3 = cos(phi) * cos(eta);
    float x4 = sin(phi) * cos(eta);

    // Conformal stereographic projection from S3 to R3
    float denom = max(1.0 - x4 * 0.7, 0.2);
    vec3 hopfR3 = vec3(x1, x2, x3) / denom * 2.2;

    // Ribbon width offset
    vec3 tangent = normalize(vec3(-sin(psi) * sin(eta), cos(psi) * sin(eta), 0.0));
    vec3 normal4D = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    float ribbonWidth = (0.04 + 0.02 * sin(tAlong * 4.0)) * (1.0 + audioKick * 0.5);

    vec3 pos = hopfR3 + normal4D * (inTexCoord.y - 0.5) * ribbonWidth;

    vPos = pos;
    vUV = inTexCoord;
    vFiberID = ribbonID / 20.0;
    vEnergy = (0.8 + 0.4 * sin(tAlong * 8.0 - time * 6.0)) * (1.0 + audioKick * 2.0);

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

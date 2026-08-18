#version 330 core
/**
 * @file StellarNurseryCollapse.vert
 * @brief attrA.xyz = 0.0, attrA.w = point ID (0..59999), attrB = seeds (GEOM_POINTS).
 */
in vec4 attrA;
in vec4 attrB;

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
out float vTemp;
out float vSeed;
out float vRadius;

void main() {
    float id = attrA.w;
    vec4 seed = attrB;

    // Distribute particles into disk + spherical halo + bipolar jets
    float isJet = step(0.92, seed.x); // 8% of particles in jets
    float isHalo = step(0.70, seed.x) * (1.0 - isJet); // 22% in halo
    float isDisk = 1.0 - isJet - isHalo; // 70% in accretion disk

    // Radius from center
    float r = pow(seed.y, 1.8) * 4.5 + 0.15;
    
    // Keplerian orbital rotation
    float omega = sqrt(2.0 / (r * r * r + 0.2)) * (time * 0.4 + audioAdvance * 0.2);
    float angle = seed.z * 6.28318 + omega;

    // Spiral density wave perturbation
    float spiral = sin(angle * 2.0 - r * 3.5 + audioPhase * 0.5) * 0.2;
    r += spiral * isDisk;

    // Gravitational collapse compression on bass
    r *= (1.0 - 0.25 * audioBass);

    vec3 pos = vec3(0.0);

    if (isDisk > 0.5) {
        // Flat disk with slight vertical flaring
        float h = (seed.w - 0.5) * (0.1 + r * 0.08);
        pos = vec3(cos(angle) * r, h, sin(angle) * r);
    } else if (isHalo > 0.5) {
        // Spherical outer cloud
        float phi = seed.z * 6.28318;
        float theta = acos(clamp(seed.w * 2.0 - 1.0, -1.0, 1.0));
        float rHalo = seed.y * 5.5 + 1.0;
        pos = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi)) * rHalo;
    } else {
        // Bipolar relativistic plasma jets
        float jetSign = (seed.w > 0.5) ? 1.0 : -1.0;
        float jetH = (seed.y * 4.0 + 0.5) * jetSign;
        float jetR = (0.05 + 0.08 * abs(jetH)) * (0.5 + 0.5 * seed.z);
        float jetPhi = angle * 2.0;
        pos = vec3(cos(jetPhi) * jetR, jetH * (1.0 + 0.5 * audioKick), sin(jetPhi) * jetR);
    }

    // Temperature (core is ultra-hot white-blue, outer disk is reddish-orange)
    float temp = clamp(1.0 - (r / 5.0), 0.0, 1.0);
    if (isJet > 0.5) temp = 1.0 + audioKick * 0.8;

    vPos = pos;
    vTemp = temp;
    vSeed = seed.x;
    vRadius = r;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    float tiltAngle = 0.45;
    float cosT = cos(tiltAngle), sinT = sin(tiltAngle);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 6.5;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Dynamic point size (larger near core and during beat hits)
    float pSize = (1.5 + temp * 4.0 + 3.0 * audioKick * step(0.8, temp)) * (1.0 + 0.5 * audioSwell);
    gl_PointSize = clamp(pSize * (6.5 / rotatedVP.z), 1.0, 48.0);
}

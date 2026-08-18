#version 330 core
// attrA.x = t along ribbon (0..1), attrA.y = side (-1..+1), attrA.w = ribbon
// id, attrB = per-ribbon seeds (Scene3DShader.cpp GEOM_RIBBON).
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
out vec2 vUV;
out float vRadiation;
out float vBeamID;

void main() {
    float ribbonID = attrA.w;
    float tAlong = attrA.x * 6.2831853; // Angle around storage ring

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
    float radiation = abs(cos(tAlong * wiggles)) * (1.0 + audioKick * 0.7);

    // Ribbon cross-section width
    vec3 tangent = normalize(vec3(-sin(ringAngle), 0.0, cos(ringAngle)));
    vec3 normal = vec3(0.0, 1.0, 0.0);

    float width = (0.05 + 0.03 * radiation) * (1.0 + audioSwell * 0.5);
    vec3 pos = orbitCenter + normal * (attrA.y * 0.5) * width;

    // Half the ribbons are TANGENTIAL RADIATION JETS: light thrown off
    // along the tangent wherever the beam is bent — that IS synchrotron
    // radiation, and it is what ties the picture to the name.
    if (ribbonID >= 10.0)
    {
        float srcA = (ribbonID - 10.0) * 0.628318 + time * 0.5 + audioAdvance * 0.3;
        vec3 src = vec3(R0 * cos(srcA), 0.0, R0 * sin(srcA));
        vec3 jt  = normalize(vec3(-sin(srcA), 0.0, cos(srcA)));
        float lt = attrA.x;
        pos = src + jt * lt * 3.4;
        pos.y += (attrA.y * 0.5) * (0.04 + lt * 0.45);   // the fan opens up
        radiation = (1.0 - lt * 0.65) * (1.8 + audioKick * 0.8);
    }

    vPos = pos;
    vUV = vec2(attrA.x, attrA.y * 0.5 + 0.5);
    vRadiation = radiation;
    vBeamID = ribbonID / 20.0;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    // Orbit + pitch: the storage ring was seen edge-on as a thin band
    float yaw = time * 0.11 + audioAdvance * 0.05;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    float pit = -0.55 + 0.10 * sin(time * 0.13);
    float cp = cos(pit), sp = sin(pit);
    vp.yz = mat2(cp, -sp, sp, cp) * vp.yz;
    vp.y += 1.3;
    vp.z += 5.0;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

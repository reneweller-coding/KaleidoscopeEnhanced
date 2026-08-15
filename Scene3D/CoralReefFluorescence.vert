#version 330 core
// attrA.xy = grid uv (0..1), attrB = per-cell seeds (Scene3DShader.cpp GEOM_GRID)
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
out vec3 vNormal;
out vec2 vUV;
out float vFluorescence;

void main() {
    vec2 gridUV = attrA.xy;
    vec2 p = gridUV * 12.0;

    float t = time * 0.4 + audioAdvance * 0.2;

    // Multi-octave organic coral colony shapes (Brain coral + staghorn ridges)
    float ridge1 = sin(p.x * 2.0 + sin(p.y * 3.0)) * cos(p.y * 2.0);
    float ridge2 = sin(p.x * 4.0 - p.y * 4.0 + t) * 0.4;
    float polyp = sin(p.x * 12.0) * cos(p.y * 12.0) * 0.15;

    // Rhythmic underwater ocean current sea fan sway
    float sway = sin(gridUV.x * 6.0 + t * 2.0) * 0.3 * (0.8 + 0.5 * audioBass);

    float height = (ridge1 + ridge2 + polyp + sway) * (0.8 + 0.4 * audioSwell);

    vec3 pos = vec3((gridUV.x - 0.5) * 6.0, height - 0.8, (gridUV.y - 0.5) * 5.0);

    // Dynamic normal calculation
    float eps = 0.05;
    float hL = sin((p.x - eps) * 2.0 + sin(p.y * 3.0)) * cos(p.y * 2.0);
    float hR = sin((p.x + eps) * 2.0 + sin(p.y * 3.0)) * cos(p.y * 2.0);
    float hD = sin(p.x * 2.0 + sin((p.y - eps) * 3.0)) * cos((p.y - eps) * 2.0);
    float hU = sin(p.x * 2.0 + sin((p.y + eps) * 3.0)) * cos((p.y + eps) * 2.0);
    vec3 n = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

    // Ultraviolet fluorescence emission intensity
    float fluor = (polyp * 3.0 + 0.5) * (1.0 + audioKick * 2.5);

    vPos = pos;
    vNormal = n;
    vUV = gridUV;
    vFluorescence = fluor;

    // Stereoscopic 3D camera projection with downward tilt
    vec3 vp = pos;
    float tilt = 0.45;
    float cosT = cos(tilt), sinT = sin(tilt);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 5.2;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

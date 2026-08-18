#version 330 core
/**
 * @file ChiralLiquidCrystalCholesteric.vert
 * @brief Vertex stage companion to ChiralLiquidCrystalCholesteric.frag -- see that file's header for
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

uniform float pitchP;
uniform float twistP;
uniform float widthP;
uniform float hueP;

out vec3 vWorldPos;
out vec2 vTexCoord;
out float vHelixPhase;

void main() {
    float ptc = (pitchP > 0.0) ? pitchP : 1.0;
    float tws = (twistP > 0.0) ? twistP : 1.0;
    float wdp = (widthP > 0.0) ? widthP : 1.0;

    // GEOM_RIBBON packs the ribbon index into attrA.w; attrB.x is a random
    // hash01 in [0,1), so int(attrB.x) was always 0 and all 20 ribbons
    // collapsed onto ribbon 0 (see Scene3DShader::buildGeometry).
    int ribbonIdx = int(attrA.w);
    float s = attrA.x;       // [0, 1] along ribbon
    float side = attrA.y;    // -1 or +1
    vHelixPhase = float(ribbonIdx) / 20.0;
    vTexCoord = vec2(s * 6.0, side * 0.5 + 0.5);

    float t = time * 0.4 + audioAdvance * 0.2;

    // 20 helical cholesteric molecular director ribbons
    float xBase = (float(ribbonIdx) - 10.0) * 0.35;
    float z = (s - 0.5) * 7.5;

    // Helical molecular twist along Z axis: director n(z) = (cos(qz), sin(qz), 0)
    float qz = z * 4.0 * ptc * tws + t * 2.0;
    float helixX = cos(qz) * 0.3;
    float helixY = sin(qz) * 0.3;

    vec3 p0 = vec3(xBase + helixX, helixY, z);

    // Tangent & Binormal
    vec3 tangent = normalize(vec3(-sin(qz) * 1.2, cos(qz) * 1.2, 5.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)));

    float ribbonWidth = (0.045 + 0.02 * sin(s * 20.0 + t * 3.0)) * wdp * (1.0 + audioKick * 0.7);
    vec3 worldPos = p0 + binormal * (side * ribbonWidth);
    vWorldPos = worldPos;

    // Camera: the helices run along z — seen end-on they were just a row of
    // circles.  Orbit AROUND the bundle so the cholesteric twist shows from
    // the side, with a gentle pitch.
    vec3 vp = worldPos;
    float yaw = 1.25 + time * 0.12 + audioAdvance * 0.06;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    float pit = -0.35 + 0.10 * sin(time * 0.17);
    float cp = cos(pit), sp = sin(pit);
    vp.yz = mat2(cp, -sp, sp, cp) * vp.yz;
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

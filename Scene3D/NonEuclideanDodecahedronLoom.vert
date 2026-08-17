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

uniform float dodecaP;
uniform float loomP;
uniform float widthP;
uniform float hueP;

out vec3 vWorldPos;
out vec2 vTexCoord;
out float vRibbonIndex;

void main() {
    float ddc = (dodecaP > 0.0) ? dodecaP : 1.0;
    float lmp = (loomP   > 0.0) ? loomP   : 1.0;
    float wdp = (widthP  > 0.0) ? widthP  : 1.0;

    int ribbonIdx = int(attrB.x);
    float s = attrA.x;       // [0, 1] along ribbon
    float side = attrA.y;    // -1 or +1 for ribbon width
    vRibbonIndex = float(ribbonIdx) / 20.0;
    vTexCoord = vec2(s * 4.0, side * 0.5 + 0.5);

    float t = time * 0.4 + audioAdvance * 0.2;

    // 20 Dodecahedral vertex orientations
    float phi = 1.6180339887; // Golden ratio
    float theta = float(ribbonIdx) * 0.314159265;
    float u = s * 6.2831853 * lmp + t * 0.5;

    // Hyperbolic dodecahedron geodesic curve
    vec3 p0 = vec3(
        sin(u * 2.0 + theta) * 1.5,
        cos(u * 3.0 + theta * phi) * 1.5,
        sin(u * 1.0 + theta * 2.0) * 1.5
    ) * ddc;

    // Tangent and normal for ribbon width
    vec3 tangent = normalize(vec3(
        2.0 * cos(u * 2.0 + theta),
        -3.0 * sin(u * 3.0 + theta * phi),
        cos(u * 1.0 + theta * 2.0)
    ));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)));

    float ribbonWidth = (0.045 + 0.02 * sin(s * 15.0 + t * 3.0)) * wdp * (1.0 + audioKick * 0.7);
    vec3 worldPos = p0 + binormal * (side * ribbonWidth);
    vWorldPos = worldPos;

    vec4 viewPos = vec4(worldPos, 1.0);
    gl_Position = projM * viewPos;
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}

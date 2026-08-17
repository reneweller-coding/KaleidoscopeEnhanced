#version 330 core
// CosmicStringHyperspaceWeb.vert — 20 hyper-dimensional cosmic strings
// spanning a 3D web with standing Kelvin wave vibrations and metric deficit angles.
//   attrA.x = t along ribbon, attrA.y = side (-1/+1), attrA.w = ribbon index
//   attrB   = per-ribbon seeds

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioHigh;

uniform float tensionP;
uniform float waveP;
uniform float widthP;
uniform float hueP;

out vec4  vCol;
out float vSide;
out float vLength;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float t    = attrA.x; // 0..1 along ribbon
    float side = attrA.y; // -1..+1
    float ri   = attrA.w; // 0..19

    float tns = (tensionP > 0.0) ? tensionP : 1.0;
    float wav = (waveP    > 0.0) ? waveP    : 1.0;
    float wid = (widthP   > 0.0) ? widthP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    const float L = 160.0;
    float camZ = time * 7.0 + audioAdvance * 15.0;
    float zRel = t * L;
    float zAbs = zRel + camZ;

    // Web node positions
    float nodeAngle = (ri / 20.0) * 6.2831853;
    float webRadius = 7.0 + 3.0 * sin(ri * 1.7 + zAbs * 0.03) + audioSwell * 2.5;

    // Standing Kelvin wave oscillations along strings
    float wave1 = sin(zAbs * 0.08 * tns + time * 3.0) * cos(ri * 1.5) * 1.8 * wav;
    float wave2 = cos(zAbs * 0.06 * tns - time * 2.5) * sin(ri * 2.1) * 1.8 * wav;
    float kickJolt = sin(zAbs * 0.15 - time * 8.0) * audioKick * 2.2;

    vec3 centerPos = vec3(
        cos(nodeAngle) * webRadius + wave1,
        sin(nodeAngle) * webRadius + wave2 + kickJolt,
        zRel
    );

    vec3 radialDir = normalize(vec3(cos(nodeAngle), sin(nodeAngle), 0.0));
    vec3 tangentDir = vec3(-radialDir.y, radialDir.x, 0.0);

    float ribbonWidth = (0.35 * wid) * (1.0 + 0.3 * audioKick);
    vec3 worldP = centerPos + tangentDir * (side * ribbonWidth);

    // Camera space
    vec3 camPos = vec3(0.0, 0.0, 0.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSide = side;
    vLength = t;

    // Relativistic light packet traveling down cosmic string
    float packet = fract(zAbs * 0.04 - time * 4.0 - ri * 0.15);
    float packetGlow = exp(-packet * 8.0) * 2.5;

    // Cosmic string palette: Gravitational electric blue / violet / white
    vec3 col = mix(vec3(0.1, 0.5, 1.0), vec3(0.9, 0.2, 0.8), sin(ri * 0.5 + time) * 0.5 + 0.5);
    col = mix(col, vec3(1.0, 0.95, 0.8), packetGlow * 0.6);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (1.0 + packetGlow + audioHigh * 0.8), 1.0);
}

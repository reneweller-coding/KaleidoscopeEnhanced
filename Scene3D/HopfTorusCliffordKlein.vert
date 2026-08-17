#version 330 core
// HopfTorusCliffordKlein.vert — 20 interlocking Villarceau circles and
// Clifford tori stereographically projected from 4D space into 3D.
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

uniform float fiberP;
uniform float radiusP;
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
    float t    = attrA.x; // 0..1 along circular ribbon
    float side = attrA.y; // -1..+1
    float ri   = attrA.w; // 0..19

    float fbr = (fiberP  > 0.0) ? fiberP  : 1.0;
    float rad = (radiusP > 0.0) ? radiusP : 1.0;
    float wid = (widthP  > 0.0) ? widthP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    float theta = t * 6.2831853;
    float phi = (ri / 20.0) * 6.2831853 * fbr + time * 0.4 + audioAdvance * 0.1;

    // 4D Hopf fibration parameterization on S^3
    float eta = 0.785398 + 0.3 * sin(time * 0.5 + ri * 0.4); // pi/4
    vec4 q = vec4(
        cos(eta) * cos(theta + phi),
        cos(eta) * sin(theta + phi),
        sin(eta) * cos(theta - phi),
        sin(eta) * sin(theta - phi)
    );

    // Stereographic projection from S^3 to R^3: (x, y, z) / (1 - w)
    float denom = max(1.0 - q.w * 0.8, 0.2);
    vec3 centerPos = (q.xyz / denom) * (3.5 * rad + audioSwell * 1.5);

    // Dynamic kick burst
    centerPos += normalize(centerPos) * audioKick * 1.5;

    // Ribbon normal and tangent vectors
    float thetaNext = theta + 0.05;
    vec4 qNext = vec4(
        cos(eta) * cos(thetaNext + phi),
        cos(eta) * sin(thetaNext + phi),
        sin(eta) * cos(thetaNext - phi),
        sin(eta) * sin(thetaNext - phi)
    );
    vec3 centerNext = (qNext.xyz / max(1.0 - qNext.w * 0.8, 0.2)) * (3.5 * rad + audioSwell * 1.5);

    vec3 tangent = normalize(centerNext - centerPos);
    vec3 binormal = normalize(cross(tangent, normalize(centerPos)));

    float ribbonWidth = (0.28 * wid) * (1.0 + 0.3 * audioKick);
    vec3 worldP = centerPos + binormal * (side * ribbonWidth);

    // Camera space
    vec3 camPos = vec3(0.0, 0.0, -10.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSide = side;
    vLength = t;

    // Hopf fiber iridescence palette
    vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + ri * 0.35 + theta * 0.5 + time * 0.5);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (0.9 + 0.5 * audioHigh), 1.0);
}

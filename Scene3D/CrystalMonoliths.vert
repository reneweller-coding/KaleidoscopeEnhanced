#version 330 core
// CrystalMonoliths.vert — 3,000 obsidian and prismatic glass monoliths orbiting
// in 3D spiral formations, projecting photo textures with chromatic dispersion.
//   attrA.xy = corner u/v (0..1), attrA.w = quad index
//   attrB    = per-quad seeds
// True stereo: eyeOff shifts view; convergence re-centres after proj.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioCentroid;
uniform float audioSwell;
uniform float audioHigh;

uniform float orbitP;
uniform float scatterP;
uniform float glowP;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;

out vec4 vCol;
out vec2 vUV;
out vec3 vNormal;
out vec3 vWorldPos;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float qi = attrA.w;
    vec2 corner = attrA.xy - 0.5; // -0.5..0.5
    vec4 seeds = attrB;

    float orb  = (orbitP   > 0.0) ? orbitP   : 1.0;
    float sct  = (scatterP > 0.0) ? scatterP : 1.0;
    float glw  = (glowP    > 0.0) ? glowP    : 1.0;
    float hue  = (hueP     > 0.0) ? hueP     : 0.0;

    // Orbiting concentric rings of monoliths
    float ringIdx = floor(qi / 300.0); // 10 rings of 300 monoliths
    float slotIdx = mod(qi, 300.0);

    float ringRadius = (3.5 + ringIdx * 2.2) * orb + audioSwell * 2.0;
    float ringSpeed = (1.2 / (1.0 + ringIdx * 0.4)) * ((mod(ringIdx, 2.0) > 0.5) ? 1.0 : -1.0);
    
    float orbitAngle = (slotIdx / 300.0) * 6.2831853 + time * ringSpeed * 0.4 + audioAdvance * 0.1;
    
    // Monolith center position
    vec3 monolithCenter = vec3(
        cos(orbitAngle) * ringRadius,
        sin(orbitAngle * 2.0 + ringIdx) * 1.5 + (seeds.y - 0.5) * 3.0 * sct,
        sin(orbitAngle) * ringRadius
    );

    // Dynamic kick expansion & tumble
    monolithCenter += normalize(monolithCenter) * audioKick * 2.0;

    // Monolith orientation: tall vertical slabs facing slightly inward & tumbling
    float yaw = orbitAngle + 1.5708 + seeds.z * 0.8;
    float pitch = sin(time * 2.0 + seeds.x * 6.28) * 0.3 * (1.0 + audioKick);
    float roll = cos(time * 1.5 + seeds.y * 6.28) * 0.2;

    mat3 rotY = mat3(cos(yaw), 0.0, sin(yaw), 0.0, 1.0, 0.0, -sin(yaw), 0.0, cos(yaw));
    mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cos(pitch), -sin(pitch), 0.0, sin(pitch), cos(pitch));
    mat3 rotZ = mat3(cos(roll), -sin(roll), 0.0, sin(roll), cos(roll), 0.0, 0.0, 0.0, 1.0);
    mat3 rotMat = rotY * rotX * rotZ;

    // Monolith dimensions: tall rectangular prism card
    vec3 cardSize = vec3(0.65, 2.2, 0.08);
    vec3 localPos = rotMat * (vec3(corner.x, corner.y, 0.0) * cardSize);

    vec3 worldP = monolithCenter + localPos;

    // Camera
    float camDist = 24.0 - audioSwell * 4.0;
    float camAngle = time * 0.15 + audioAdvance * 0.05;
    vec3 camPos = vec3(sin(camAngle) * camDist, 10.0 + 4.0 * sin(time * 0.18), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = worldP - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = attrA.xy;
    vNormal = rotMat * vec3(0.0, 0.0, 1.0);
    vWorldPos = worldP;

    // Prismatic color gradient
    vec3 col = imgPalette(0.35 * ringIdx / 10.0) * 1.4;
    col = mix(col, vec3(1.0, 0.9, 0.3), seeds.w);

    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col, 1.0);
}

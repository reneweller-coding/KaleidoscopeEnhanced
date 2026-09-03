#version 330 core
/**
 * @file CyberRibbonHighway.vert
 * @brief Vertex stage companion to CyberRibbonHighway.frag -- see that file's header for
 * this scene's description.
 */
// CyberRibbonHighway.vert — 20 intertwined neon hyper-loop highway ribbons
// spiraling through 3D space with high-speed pulse packets and lane markings.
//   attrA.x = t along ribbon, attrA.y = side (-1/+1), attrA.w = ribbon index
//   attrB   = per-ribbon seeds
// True stereo: eyeOff shifts view; convergence re-centres after proj.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBarPhase;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioHigh;

uniform float speedP;
uniform float twistP;
uniform float widthP;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4  vCol;
out float vSide;
out float vLength;

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
    float t    = attrA.x; // 0..1 along ribbon
    float side = attrA.y; // -1..+1
    float ri   = attrA.w; // 0..19

    float spd = (speedP > 0.0) ? speedP : 1.0;
    float tws = (twistP > 0.0) ? twistP : 1.0;
    float wid = (widthP > 0.0) ? widthP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    const float L = 180.0;
    float camZ = time * 8.0 * spd + audioAdvance * 18.0;
    float zRel = t * L;
    float zAbs = zRel + camZ;

    // Highway 3D spline curvature
    vec2 centerWeave = vec2(
        sin(zAbs * 0.018 + 1.2) * 12.0 + sin(zAbs * 0.008) * 8.0,
        cos(zAbs * 0.015) * 8.0 + cos(zAbs * 0.006 + 1.0) * 6.0
    );

    // Multi-lane orbital angle around highway core
    float laneAngle = (ri / 20.0) * 6.2831853 + zAbs * (0.025 * tws) + sin(zAbs * 0.005 + time * 0.5) * 1.5;
    
    // Ribbon radius from highway center
    float radius = 5.5 + 1.5 * sin(ri * 1.3 + zAbs * 0.02) + audioSwell * 2.0;
    // (kick radius pulse removed, V7d)

    vec3 centerPos = vec3(centerWeave.x, centerWeave.y, zRel);
    vec3 radialDir = vec3(cos(laneAngle), sin(laneAngle), 0.0);
    vec3 tangentDir = vec3(-sin(laneAngle), cos(laneAngle), 0.0);

    // Ribbon width & banking
    float ribbonWidth = (0.45 * wid) * (1.0 + 0.3 * audioKick);
    vec3 worldP = centerPos + radialDir * radius + tangentDir * (side * ribbonWidth);

    // Camera space
    vec3 camTarget = vec3(
        sin((camZ + 25.0) * 0.018 + 1.2) * 12.0,
        cos((camZ + 25.0) * 0.015) * 8.0,
        25.0
    );
    vec3 camPos = vec3(
        sin(camZ * 0.018 + 1.2) * 12.0,
        cos(camZ * 0.015) * 8.0,
        0.0
    );

    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSide = side;
    vLength = t;

    // Highway neon pulse packets traveling down the lanes
    float pulse = fract(zAbs * 0.05 - time * 3.0 * spd - ri * 0.1);
    float pulseGlow = exp(-pulse * 6.0) * 2.0;

    // Color gradient across ribbons: Cyberpunk teal, neon magenta, electric yellow
    vec3 ribbonCol = imgPalette((ri * 0.6 + time) * 0.159) * 1.5;
    ribbonCol = mix(ribbonCol, vec3(1.0, 0.9, 0.1), pulseGlow * 0.5);

    if (hue > 0.001) ribbonCol = hueRot(ribbonCol, hue);

    vCol = vec4(ribbonCol * (1.0 + pulseGlow + audioHigh * 0.8), 1.0);
}

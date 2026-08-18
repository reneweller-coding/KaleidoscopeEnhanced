#version 330 core
/**
 * @file KelvinHelmholtzCloudWaves.vert
 * @brief Vertex stage companion to KelvinHelmholtzCloudWaves.frag -- see that file's header for
 * this scene's description.
 */
// KelvinHelmholtzCloudWaves.vert — 220x120 heightfield atmospheric shear billows
// and rolling breaking cloud waves illuminated by dramatic sunset backlighting.
//   attrA.xy = grid UV (0..1), attrA.zw = quad index

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

uniform float billowP;
uniform float shearP;
uniform float speedP;
uniform float hueP;
uniform float audioLevel;

out vec4 vCol;
out vec2 vUV;
out vec3 vNormal;
out float vBillow;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec2 gridUV = attrA.xy; // 0..1

    float blw = (billowP > 0.0) ? billowP : 1.0;
    float shr = (shearP  > 0.0) ? shearP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    float x = (gridUV.x - 0.5) * 22.0;
    float z = (gridUV.y - 0.5) * 22.0;

    float t = time * 0.35 * spd + audioAdvance * 0.15;

    // Kelvin-Helmholtz cat's-eye shear vortex equation
    float k = 0.4 * shr;
    float phase = x * k - t * 2.5;

    // Rolling wave crest
    float billowWave = sin(phase) * (1.0 + 0.5 * cos(z * 0.3));
    float billowCrest = exp(-pow(sin(phase * 0.5), 2.0) * 6.0);
    float y = (billowWave * 0.8 + billowCrest * 1.8) * blw * (1.0 + 0.3 * audioBass);

    // Lateral curl
    x += cos(phase) * 0.6 * billowCrest;

    // Kick puff
    y += audioKick * 1.5 * billowCrest;

    vec3 worldP = vec3(x, y, z);

    // Camera space
    vec3 camPos = vec3(0.0, 4.5, -16.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = gridUV;
    vBillow = billowCrest;
    vNormal = normalize(vec3(-cos(phase) * 0.6, 1.0, -sin(z * 0.3) * 0.3));

    // Sunset amber, dusk indigo, cloud white palette
    vec3 duskIndigo = vec3(0.08, 0.06, 0.16);
    vec3 sunsetAmber = vec3(1.0, 0.65, 0.25);
    vec3 cloudWhite = vec3(0.95, 0.9, 0.85);

    vec3 col = mix(duskIndigo, sunsetAmber, vBillow);
    col = mix(col, cloudWhite, clamp(y * 0.3, 0.0, 1.0));

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (0.8 + 0.5 * audioLevel), 1.0);
}

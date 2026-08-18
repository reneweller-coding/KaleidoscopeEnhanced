#version 330 core
/**
 * @file BioluminescentBreakingWave.vert
 * @brief Vertex stage companion to BioluminescentBreakingWave.frag -- see that file's header for
 * this scene's description.
 */
// BioluminescentBreakingWave.vert — 220x120 heightfield breaking ocean wave
// with Gerstner wave harmonics and dinoflagellate bioluminescent crest emission.
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

uniform float waveHeightP;
uniform float steepnessP;
uniform float speedP;
uniform float hueP;

out vec4 vCol;
out vec2 vUV;
out vec3 vNormal;
out float vBioGlow;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec2 gridUV = attrA.xy; // 0..1

    float hgt = (waveHeightP > 0.0) ? waveHeightP : 1.0;
    float stp = (steepnessP  > 0.0) ? steepnessP  : 1.0;
    float spd = (speedP      > 0.0) ? speedP      : 1.0;
    float hue = (hueP        > 0.0) ? hueP        : 0.0;

    // Grid world range: X in [-12, 12], Z in [0, 24]
    float x0 = (gridUV.x - 0.5) * 24.0;
    float z0 = gridUV.y * 24.0;

    float t = time * 0.45 * spd + audioAdvance * 0.2;

    // Primary breaking wave (Gerstner harmonic with steep crest)
    float k = 0.72;
    float phase = z0 * k - t * 3.0;
    float crestProfile = exp(-pow(sin(phase * 0.5), 2.0) * 8.0 * stp);
    // Break the crest into patches along x — a real breaker foams in cells,
    // not as one full-width neon bar.
    crestProfile *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(x0 * 0.7 + phase * 0.9), 2.0);

    // Wave curling forward as it breaks
    float dx = sin(phase) * 0.8 * stp;
    float dy = (cos(phase) + crestProfile * 2.0) * (0.85 * hgt + 0.35 * audioBass);
    float dz = -sin(phase) * 1.2 * stp;

    // Cross-swell ripples
    float ripple = sin(x0 * 1.5 + z0 * 0.8 + t * 4.0) * 0.15 * (1.0 + audioHigh);

    vec3 worldP = vec3(x0 + dx, dy + ripple, z0 + dz);

    // Kick breaker explosion
    worldP.y += audioKick * 0.8 * crestProfile;

    // Camera space
    vec3 camPos = vec3(0.0, 6.5, -9.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = gridUV;
    vBioGlow = crestProfile * (1.0 + audioKick * 0.8);

    // Normal approximation
    vNormal = normalize(vec3(-dx * 0.5, 1.0, -dz * 0.8));

    // Ocean deep navy / bioluminescent cyan palette
    vec3 deepOcean = vec3(0.02, 0.05, 0.12);
    vec3 bioCyan   = vec3(0.0, 0.95, 1.0);
    vec3 col = mix(deepOcean, bioCyan, clamp(pow(vBioGlow, 1.7) * 0.7, 0.0, 1.0));

    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col, 1.0);
}

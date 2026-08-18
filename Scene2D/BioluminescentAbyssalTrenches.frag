#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentAbyssalTrenches.frag
 * @brief BIOLUMINESCENT ABYSSAL TRENCHES: 100% viewport-filling deep-sea Hadal
 * zone (11,000m depth). Volumetric raymarched hydrothermal spires, flashing
 * siphonophore colonies, pyrosome light tubes, marine snow, and deep-sea
 * photo refraction across turbulent oceanic thermal boundary layers.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

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

uniform float trenchP;
uniform float bioP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

void main() {
    float trn = (trenchP > 0.0) ? trenchP : 1.0;
    float bio = (bioP    > 0.0) ? bioP    : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Deep ocean perspective coordinates
    float depthZ = (1.0 / (abs(uv.y + 0.6) + 0.1)) * (0.8 + 0.3 * audioSwell);
    vec2 oceanicUV = vec2(uv.x * depthZ * 0.4, depthZ + t * 1.5);

    // Oceanic thermal boundary refraction waves
    float thermalWave = sin(uv.x * 10.0 + sin(uv.y * 8.0 + t) * 2.0);
    vec2 refractedUV = uv * 0.6 + vec2(0.5) + vec2(cos(thermalWave), sin(thermalWave)) * 0.03;
    vec3 photoOcean = img(fract(refractedUV));

    // Hydrothermal crystal vent spires
    float spireCoord = abs(fract(oceanicUV.x * 0.5) - 0.5) * 2.0;
    float spireHeight = exp(-spireCoord * 12.0 * trn);

    // Bioluminescent siphonophore tentacles & pulsing pyrosomes
    float siphonophore = sin(uv.x * 25.0 + t * 4.0) * cos(uv.y * 30.0 - t * 3.0);
    float bioGlow = exp(-abs(siphonophore) * 8.0) * (0.8 + 1.2 * audioHigh) * bio;

    // Luciferin synchronized flash pulses on kicks
    float luciferinPulse = sin(length(uv) * 12.0 - time * 6.0);
    float bioFlash = exp(-abs(luciferinPulse) * 6.0) * (audioKick * 2.5 + audioSubBass * 1.2);

    // Marine snow particles drifting in the current
    vec2 snowGrid = floor(uv * 35.0 + vec2(t * 0.5, t * 2.0));
    float snowHash = hash21(snowGrid);
    float snowParticle = step(0.96, snowHash) * (0.5 + 1.0 * audioMid);

    // Deep-sea color palette: Abyssal Navy, Luciferin Cyan, Siphonophore Emerald, Mineral Vent Amber
    vec3 abyssalNavy = vec3(0.01, 0.03, 0.08);
    vec3 bioCyan     = vec3(0.0, 0.9, 1.0) * 2.0;
    vec3 bioEmerald  = vec3(0.1, 1.0, 0.6) * 1.8;
    vec3 ventAmber   = vec3(1.0, 0.5, 0.1) * 2.2;

    vec3 col = mix(abyssalNavy, photoOcean * 0.5, 0.6 + 0.4 * audioLevel);
    col += mix(bioCyan, bioEmerald, sin(t + uv.y * 4.0) * 0.5 + 0.5) * (bioGlow + bioFlash);
    col += ventAmber * spireHeight * (0.6 + 1.2 * audioBass);
    col += vec3(0.8, 0.95, 1.0) * snowParticle;

    // Atmospheric deep-sea absorption falloff
    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9));
    col += vec3(0.01, 0.03, 0.06) * audioSwell;

    fragColor = vec4(col, 1.0);
}

#version 330 core
in vec3 vPos;
in float vSpecies;
in float vBioGlow;

out vec4 fragColor;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Deep sea organism colors based on species
    vec3 col = vec3(0.0);
    if (vSpecies < 0.35) {
        // Hydrothermal smoker mineral sulfur particles (orange/gold)
        col = mix(vec3(1.0, 0.4, 0.05), vec3(1.0, 0.9, 0.2), vBioGlow);
    } else if (vSpecies < 0.7) {
        // Bioluminescent siphonophore organisms (electric cyan/azure)
        col = mix(vec3(0.0, 0.6, 1.0), vec3(0.2, 1.0, 0.8), vBioGlow);
    } else {
        // Deep-sea tube worm hemoglobin plume tips (crimson/magenta)
        col = mix(vec3(0.9, 0.05, 0.3), vec3(1.0, 0.3, 0.8), vBioGlow);
    }

    col *= (0.8 + 0.6 * vBioGlow) * (1.0 + audioKick * 2.5) * glw;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

#version 330 core
out vec4 fragColor;

in vec3 vPos;
in float vCirc;
in float vRingID;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float vortexP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP    > 0.0) ? glowP    : 1.0;
    float vtx = (vortexP  > 0.0) ? vortexP  : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    // Quantum circulation colors (deep ocean blue to electric cyan/emerald)
    vec3 blueCirc = vec3(0.05, 0.35, 1.0);
    vec3 greenCirc = vec3(0.10, 1.00, 0.75);
    vec3 vortexCol = mix(blueCirc, greenCirc, fract(vRingID * 0.2 + time * 0.3));

    // Circulation pulse wave
    float pulse = sin(vCirc * 10.0 - time * 8.0) * 0.5 + 0.5;
    vec3 coreGlow = mix(vortexCol, vec3(1.0), pulse * 0.7);

    // Photo reflection mapping
    vec2 photoUV = vPos.xy * 0.15 + 0.5;
    vec3 photoCol = img(fract(photoUV));

    vec3 col = (coreGlow * 2.2 + photoCol * 0.4) * (0.8 + 1.2 * audioKick) * vtx * glw;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}

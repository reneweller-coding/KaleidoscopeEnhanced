#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in float vPhaseVelocity;

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

uniform float nP;
uniform float lensP;
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

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping onto metamaterial grid
    vec3 photo = img(vTexCoord);

    // Negative refraction colors: Positive medium (Teal/Emerald), Negative Metamaterial (Violet/Gold)
    vec3 positiveCol = vec3(0.1, 0.9, 0.6);
    vec3 negativeCol = vec3(0.9, 0.2, 0.8);
    vec3 metaColor = (vPhaseVelocity > 0.0) ? positiveCol : negativeCol;

    // Superlens focal spot glow
    float focusGlow = exp(-length(vWorldPos.xy - vec2(0.0, 0.5)) * 4.0) * (1.0 + audioKick * 3.0);

    vec3 col = mix(photo, metaColor, 0.45);
    col += focusGlow * vec3(1.0, 0.98, 0.85) * 2.0;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

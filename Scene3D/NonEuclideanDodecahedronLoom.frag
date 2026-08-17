#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec2 vTexCoord;
in float vRibbonIndex;

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

uniform float dodecaP;
uniform float loomP;
uniform float widthP;
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

    // Photo texture mapping along ribbon length
    vec3 photo = img(fract(vTexCoord));

    // Sacred dodecahedral color palette
    vec3 ribbonColor = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + vRibbonIndex * 6.28 + audioPhase);

    // Glowing edges across the ribbon
    float edgeGlow = pow(abs(vTexCoord.y - 0.5) * 2.0, 3.0);

    vec3 col = mix(photo, ribbonColor, 0.45);
    col += edgeGlow * vec3(1.0, 0.9, 0.4) * (1.0 + audioKick * 2.5);

    // Distance fog
    float dist = length(vWorldPos);
    col = mix(col, vec3(0.02, 0.02, 0.05), 1.0 - exp(-dist * 0.2));

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

#version 430 core
in vec3 tePos;
in vec3 teNormal;
in vec2 teUV;
in float teAurora;

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
uniform float auroraP;
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
    float glw = (glowP   > 0.0) ? glowP   : 1.0;
    float aur = (auroraP > 0.0) ? auroraP : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    float canalDist = abs(teUV.x - 0.5);
    float isWater = 1.0 - smoothstep(0.12, 0.18, canalDist);

    // Mountain rock & snow shading
    vec3 rockCol = vec3(0.04, 0.05, 0.08);
    vec3 snowCol = vec3(0.7, 0.8, 0.95);
    float snowMask = smoothstep(0.5, 1.8, tePos.y);
    vec3 mountainCol = mix(rockCol, snowCol, snowMask);

    // Volumetric Aurora Borealis curtain colors in sky
    vec3 auroraGreen = vec3(0.1, 1.0, 0.4);
    vec3 auroraViolet = vec3(0.8, 0.2, 1.0);
    vec3 skyAurora = mix(auroraGreen, auroraViolet, sin(teUV.y * 8.0 + time) * 0.5 + 0.5);
    skyAurora *= teAurora * aur * (0.8 + 0.5 * audioSwell);

    // Fjord mirror water reflection
    vec3 waterReflect = skyAurora * 0.8 + img(teUV) * 0.25;
    vec3 fjordCol = mix(mountainCol, waterReflect, isWater);

    // Sky glow integration
    vec3 col = fjordCol + skyAurora * (1.0 - isWater) * 0.5;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 1.0);
}

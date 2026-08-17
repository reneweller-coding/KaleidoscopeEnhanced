#version 330 core
out vec4 fragColor;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;

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

uniform float brineP;
uniform float haloclineP;
uniform float speedP;
uniform float hueP;
uniform float time;

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

    // Photo texture mapping onto deep-sea water surface
    vec3 photo = img(vTexCoord);

    // Deep abyssal cyan & brine shimmering gold palette
    vec3 deepWater = vec3(0.01, 0.1, 0.25);
    vec3 brineGold  = vec3(0.1, 0.75, 0.85);
    vec3 haloclineRefract = vec3(0.3, 0.95, 1.0);

    float r = length(vWorldPos.xz);
    float isBrine = smoothstep(1.8, 0.6, r);

    // Halocline shimmering waves
    float shimmer = pow(abs(sin(vTexCoord.x * 25.0 + vTexCoord.y * 25.0 + time * 3.0)), 6.0);

    vec3 waterCol = mix(deepWater, brineGold, isBrine);
    vec3 col = mix(photo * 0.8, waterCol, 0.5);
    col += shimmer * haloclineRefract * (1.0 + audioKick * 2.5);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}

#version 330 core
in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vFluorescence;

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
uniform float fluorP;
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
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float flr = (fluorP > 0.0) ? fluorP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Diffuse lighting in deep ocean
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;

    // Base photo texture
    vec3 photo = img(vUV);

    // Fluorescent Green/Pink/Orange protein emission colors (GFP / RFP)
    vec3 gfpColor = mix(vec3(0.0, 1.0, 0.5), vec3(1.0, 0.1, 0.6), sin(vUV.x * 10.0 + vUV.y * 8.0) * 0.5 + 0.5);
    vec3 fluorGlow = gfpColor * max(vFluorescence, 0.0) * flr;

    // Deep ocean blue ambient
    vec3 oceanAmbient = vec3(0.02, 0.06, 0.18);

    vec3 col = mix(oceanAmbient, photo, 0.35) * diff + fluorGlow * 1.5;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 1.0);
}

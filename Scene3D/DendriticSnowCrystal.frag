#version 330 core
out vec4 fragColor;

in vec3 vPos;
in float vRefract;
in float vSector;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float iceP;
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
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float ice = (iceP  > 0.0) ? iceP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Prismatic ice dispersion colors
    vec3 iceCore = vec3(0.85, 0.95, 1.0); // Crystalline white/cyan
    vec3 rainbowFacet = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + vRefract * 6.28318 + time);

    // Photo reflection through ice crystal prism
    vec2 photoUV = vPos.xy * 0.2 + 0.5;
    vec3 photoCol = img(fract(photoUV));

    // Sparkling specular glints
    float sparkle = pow(fract(sin(dot(vPos.xy, vec2(12.9898, 78.233)) + time * 4.0) * 43758.5453), 16.0);
    vec3 glintCol = vec3(1.0) * sparkle * (1.5 + 3.0 * audioKick);

    vec3 col = (mix(iceCore, rainbowFacet, 0.4) * photoCol * 1.8 + glintCol) * ice * glw;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}

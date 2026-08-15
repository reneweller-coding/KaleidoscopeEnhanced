#version 330 core
out vec4 fragColor;

in vec3 vPos;
in float vHeat;
in float vBoltID;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float arcP;
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
    float arc = (arcP  > 0.0) ? arcP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Ionized gas plasma colors
    vec3 coreHot = vec3(1.0, 0.95, 1.0);  // Ultra-hot white core
    vec3 coronaCyan = vec3(0.1, 0.7, 1.0); // High-voltage cyan corona
    vec3 coronaViolet = vec3(0.7, 0.1, 1.0); // Nitrogen ionization violet

    vec3 plasmaCol = mix(coronaViolet, coronaCyan, fract(vBoltID * 0.15 + time * 0.5));
    plasmaCol = mix(plasmaCol, coreHot, clamp(vHeat - 0.5, 0.0, 1.0));

    // Photo reflection modulation
    vec2 photoUV = vPos.xy * 0.2 + 0.5;
    vec3 photoCol = img(fract(photoUV));

    vec3 col = (plasmaCol * 2.5 + photoCol * 0.3) * (0.8 + 1.2 * vHeat) * arc * glw;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}

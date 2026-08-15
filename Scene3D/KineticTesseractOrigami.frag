#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vFoldAngle;

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
uniform float foldP;
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
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Origami facet boundary border lines
    vec2 p = abs(vUV - vec2(0.5));
    float edge = step(0.44, max(p.x, p.y));

    // Stored kaleidoscope photo texture
    vec3 photo = img(vUV);

    // Iridescent origami paper sheen
    vec3 paperIrid = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + vFoldAngle * 4.0 + audioPhase);

    // Glowing crease lines on beat kicks
    vec3 creaseNeon = vec3(1.0, 0.8, 0.2) * edge * (1.0 + audioKick * 3.0);

    vec3 col = mix(photo, paperIrid, 0.3) * (0.8 + 0.4 * audioSwell) + creaseNeon;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 1.0);
}

#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vSide;
in float vLength;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

void main() {
    vec2 uv = vec2(vSide * 0.5 + 0.5, fract(vLength * 4.0 + time * 0.2));
    vec3 photo = (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;

    float edge = smoothstep(0.7, 0.98, abs(vSide));
    vec3 col = mix(vCol.rgb * 0.55, photo * 1.35, 0.65);
    col += edge * vCol.rgb * 1.6;

    fragColor = vec4(col, 1.0);
}

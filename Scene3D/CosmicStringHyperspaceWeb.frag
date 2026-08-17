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

    // String edge glow & core beam
    float edge = smoothstep(0.7, 0.98, abs(vSide));
    float core = exp(-abs(vSide) * 12.0);

    vec3 col = mix(vCol.rgb * 0.6, photo * 1.4, 0.6);
    col += edge * vCol.rgb * 1.5;
    col += core * vec3(1.0, 1.0, 1.0) * 1.8;

    fragColor = vec4(col, 1.0);
}

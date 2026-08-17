#version 330 core
out vec4 fragColor;

in vec4 vColor;
in vec2 vTexCoord;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vTexCoord) + (1.0 - interpolation) * texture(tex1, vTexCoord)).rgb;
    float filamentEdge = exp(-abs(vTexCoord.x - 0.5) * 8.0);

    vec3 col = mix(vColor.rgb * 0.5, photo * 1.3, 0.6);
    col += filamentEdge * vColor.rgb * 1.5;

    fragColor = vec4(col, 1.0);
}

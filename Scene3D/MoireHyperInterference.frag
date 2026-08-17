#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in float vInterference;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 lightDir = normalize(vec3(0.4, 0.9, -0.5));
    vec3 n = normalize(vNormal);
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), 24.0);

    vec3 col = mix(vCol.rgb * 0.45, photo * 1.3, 0.6);
    col += vInterference * vec3(1.0, 0.9, 0.3) * 1.2;
    col += spec * vec3(1.0, 1.0, 1.0);

    fragColor = vec4(col, 1.0);
}

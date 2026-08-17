#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in float vBillow;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 lightDir = normalize(vec3(0.5, 0.7, -0.4));
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, lightDir), 0.0);

    vec3 col = mix(vCol.rgb, photo * 1.25, 0.45);
    col = col * (0.4 + 0.6 * diff) + vBillow * vec3(1.0, 0.8, 0.4) * 0.8;

    fragColor = vec4(col, 1.0);
}

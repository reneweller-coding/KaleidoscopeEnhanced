#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in float vBioGlow;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Specular water reflection
    vec3 lightDir = normalize(vec3(0.3, 0.9, -0.4));
    vec3 n = normalize(vNormal);
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), 32.0);

    vec3 col = mix(vCol.rgb, photo * 1.2, 0.45);
    col += vBioGlow * vec3(0.1, 0.95, 1.0) * 2.0;
    col += spec * vec3(0.9, 0.95, 1.0);

    fragColor = vec4(col, 1.0);
}

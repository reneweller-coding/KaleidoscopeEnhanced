#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Specular highlight on resonant voxel cube
    vec3 lightDir = normalize(vec3(0.5, 0.9, -0.4));
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), vec3(0, 0, 1)), 0.0), 16.0);

    vec3 col = mix(vCol.rgb * 0.4, photo * 1.3, 0.7);
    col = col * (0.4 + 0.6 * diff) + spec * vec3(1.0, 0.98, 0.9);

    fragColor = vec4(col, 1.0);
}

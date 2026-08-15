#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec3 vNormal;
in vec3 vWorld;

void main() {
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.6));
    float diff = max(dot(n, lightDir), 0.0) * 0.5 + 0.5;

    // Specular highlight
    vec3 viewDir = normalize(-vWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 16.0);

    vec3 col = vCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);
    fragColor = vec4(col, 1.0);
}

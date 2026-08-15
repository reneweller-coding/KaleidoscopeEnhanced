#version 330 core
out vec4 fragColor;

in vec3  gNormal;
in vec3  gWorld;
in vec4  gCol;
in vec3  gBary;

void main() {
    vec3 n = normalize(gNormal);
    vec3 lightDir = normalize(vec3(0.6, 0.9, -0.4));
    float diff = max(dot(n, lightDir), 0.0) * 0.7 + 0.3;

    // Specular highlight
    vec3 viewDir = normalize(-gWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0);

    // Shard faceted wireframe edge line
    float minBary = min(min(gBary.x, gBary.y), gBary.z);
    float edgeGlow = smoothstep(0.08, 0.0, minBary);

    vec3 col = gCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);
    col += edgeGlow * gCol.rgb * 2.0;

    fragColor = vec4(col, 1.0);
}

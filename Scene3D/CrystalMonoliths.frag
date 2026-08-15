#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;
in vec3 vNormal;
in vec3 vWorldPos;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

void main() {
    // Glass refraction photo mapping
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    // Prismatic facet border glow
    vec2 edge = smoothstep(0.42, 0.49, abs(vUV - 0.5));
    float edgeGlow = max(edge.x, edge.y);

    // Specular glass reflection
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.5, 0.9, -0.6));
    vec3 viewDir = normalize(-vWorldPos);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0);

    vec3 col = mix(vCol.rgb * 0.4, photo * 1.5, 0.7);
    col += edgeGlow * vCol.rgb * 2.0;
    col += spec * vec3(1.0, 1.0, 1.0);

    fragColor = vec4(col, 1.0);
}

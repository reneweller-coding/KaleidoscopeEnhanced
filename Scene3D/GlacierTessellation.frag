#version 400 core
out vec4 fragColor;

in vec3 vNormal;
in vec3 vWorld;
in vec2 vUV;
in float vCrevasse;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));
    float diff = max(dot(n, lightDir), 0.0);

    // Specular frost
    vec3 viewDir = normalize(-vWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0);

    // Subsurface scattering ice blue
    vec3 iceCore = vec3(0.05, 0.6, 0.95);
    vec3 iceSurface = vec3(0.85, 0.95, 1.0);
    vec3 iceCol = mix(iceCore, iceSurface, diff * 0.7 + 0.3);

    // Glowing cyan/ultraviolet crevasses
    vec3 crevasseCol = vec3(0.0, 1.0, 0.9) * vCrevasse * 2.5;

    // Sample active photo texture
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 col = iceCol + spec * vec3(1.0, 1.0, 1.0) * 0.8 + crevasseCol;
    col += photo * 0.25;

    // Fog into distance
    float dist = length(vWorld);
    float fog = 1.0 - exp(-dist * 0.008);
    vec3 fogCol = vec3(0.02, 0.08, 0.15);
    col = mix(col, fogCol, fog);

    float h = (hueP > 0.0) ? hueP : 0.0;
    if (h > 0.001) col = hueRot(col, h);

    fragColor = vec4(col, 1.0);
}

#version 430 core
out vec4 fragColor;

in vec3 tePos;
in vec3 teNormal;
in vec2 teUV;
in float teCrystal;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float crystalP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP     > 0.0) ? glowP     : 1.0;
    float cry = (crystalP  > 0.0) ? crystalP  : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec3 n = normalize(teNormal);
    vec3 lightPos = vec3(0.0, 0.0, 0.0); // Lantern in cavern center
    vec3 l = normalize(lightPos - tePos);
    vec3 viewDir = normalize(vec3(0.0, 0.0, 6.5) - tePos);

    float diff = max(dot(n, l), 0.0);
    vec3 ref = reflect(-l, n);
    float spec = pow(max(dot(ref, viewDir), 0.0), 32.0);

    // Amethyst / quartz crystal coloring
    vec3 amethyst = vec3(0.6, 0.2, 0.9);
    vec3 quartz = vec3(0.1, 0.8, 0.95);
    vec3 crystalBase = mix(amethyst, quartz, sin(tePos.z * 0.5 + time) * 0.5 + 0.5);

    // Rock substrate photo texturing
    vec3 rockPhoto = img(fract(teUV * 3.0));
    vec3 rockBase = vec3(0.08, 0.06, 0.10) * rockPhoto;

    // Faceted crystal emission & subsurface scattering
    float crystalMask = smoothstep(0.2, 0.8, teCrystal);
    vec3 emission = crystalBase * crystalMask * (1.2 + 2.0 * audioKick) * cry * glw;

    // Specular reflections on crystalline facets
    vec3 col = mix(rockBase, crystalBase * 0.5, crystalMask) * (diff * 0.8 + 0.2);
    col += vec3(1.0) * spec * (0.5 + crystalMask * 1.5);
    col += emission;

    // Distance depth fog
    float dist = length(tePos - vec3(0.0, 0.0, 6.5));
    col = mix(col, vec3(0.02, 0.01, 0.04), 1.0 - exp(-dist * 0.08));

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}

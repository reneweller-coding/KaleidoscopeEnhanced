#version 330 core
out vec4 fragColor;

in vec3 vPos;
in vec3 vNormal;
in vec2 vUV;
in float vCrest;
in float vHeight;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float bioP;
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
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float bio = (bioP  > 0.0) ? bioP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(vec3(0.0, 2.0, 5.0) - vPos);
    vec3 lightDir = normalize(vec3(0.4, 0.8, -0.6));

    // Deep ocean water shading
    vec3 deepWater = vec3(0.01, 0.03, 0.08);
    vec3 shallowWater = vec3(0.02, 0.12, 0.22);
    vec3 waterBase = mix(deepWater, shallowWater, clamp(vHeight + 0.5, 0.0, 1.0));

    // Fresnel reflection of photo sky
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);
    vec3 ref = reflect(-viewDir, n);
    vec2 skyUV = ref.xz * 0.2 + 0.5;
    vec3 photoSky = img(fract(skyUV));

    // Specular highlight from moonlight
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfVec), 0.0), 64.0);

    // Bioluminescent dinoflagellate blue-cyan glow on wave crests
    float bioIntensity = smoothstep(0.4, 1.6, vCrest);
    vec3 bioGlowCol = mix(vec3(0.0, 0.8, 1.0), vec3(0.1, 1.0, 0.6), sin(vPos.x * 2.0 + time * 3.0) * 0.5 + 0.5);
    vec3 bioEmission = bioGlowCol * bioIntensity * (1.5 + 3.0 * audioKick) * bio * glw;

    // Subsurface scattering glow
    float sss = smoothstep(-0.2, 0.8, vHeight) * (1.0 - n.y);
    vec3 sssCol = vec3(0.05, 0.35, 0.45) * sss;

    vec3 col = waterBase + photoSky * fresnel * 0.8 + vec3(1.0) * spec * 0.9 + bioEmission + sssCol;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}

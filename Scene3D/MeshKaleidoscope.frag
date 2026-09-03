#version 330 core
out vec4 fragColor;
/**
 * @file MeshKaleidoscope.frag
 * @brief Fragment stage for MeshKaleidoscope: the twelve copies of the model
 * lit by one key light plus a rim that is the palette's colour, alternating
 * copies tinted warm/cool so the mirror symmetry reads; the sky shell is a
 * dark velvet with the photo as a soft glow behind the wreath.
 *
 * Audio Reactivity: audioKick flashes the rim; audioSwell brightens the key;
 *                   audioChromaHue drives the tint via the palette.
 */
uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;
in float vCopy;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (vBg > 0.5)
    {
        // Velvet backdrop: the photo as a soft, dark glow around the axis.
        vec3 d = normalize(vPos);
        float axis = exp(-(d.x * d.x + d.y * d.y) * 3.0);
        vec3 col = imgPalette(hue * 0.159 + 0.6) * 0.04 + img(clamp(d.xy * 0.4 + 0.5, 0.0, 1.0)) * 0.12 * axis;
        fragColor = vec4(col, 1.0);
        return;
    }

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.6;
    if (texMeshMaterialLayers >= 2) roughness = texture(texMeshMaterial, vec3(vUV, 1.0)).g;

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    vec3 lightDir = normalize(vec3(0.3, 0.7, -0.6));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(64.0, 6.0, roughness));

    float expose = materialExposure(texMeshMaterial);
    vec3 col = base.rgb * expose * (0.5 + diff * (1.2 + 0.5 * audioSwell) + fill * 0.35);
    col += vec3(1.0) * spec * 0.5;
    // Alternating copies warm/cool, so the mirror symmetry reads.
    float odd = mod(vCopy, 2.0);
    vec3 tint = mix(imgPalette(hue * 0.159 + 0.1), imgPalette(hue * 0.159 + 0.6), odd);
    col = mix(col, col * tint * 2.0, 0.35);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += tint * fresnel * (0.2 + 0.4 * audioSwell + 0.8 * audioKick);
    col *= 0.8 + 0.4 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

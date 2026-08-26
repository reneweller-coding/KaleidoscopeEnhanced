#version 330 core
out vec4 fragColor;
/**
 * @file SensorStation.frag
 * @brief GEOM="MESH" STATION FAMILY: science/sensor/comms hulls (relay
 * stations, laboratories, terraforming observers, comms arrays, deep-space
 * probes). Cool cyan tech light plus a slow scanning band that sweeps along
 * the hull's own local axis (in OBJECT space, so it reads as the station's
 * instrument scanning rather than a shadow tied to world position).
 *   audioSwell   -> key-light + scan-band intensity
 *   audioKick    -> a brief scan-band flare, like a returned ping
 *   audioAdvance -> tumble speed (vertex stage)
 *   audioChromaHue-> palette follows the musical key
 *
 * Per-instance: sizeP (relative scale), scanP (scan speed).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float hueP;
uniform float scanP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in vec3 vLocalPos;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    return img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float sp  = (scanP > 0.01 ? scanP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.5, metallic = 0.35;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    vec3 lightDir = normalize(vec3(0.2, 0.6, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(50.0, 8.0, roughness));
    vec3 specColor = mix(vec3(0.85, 0.95, 1.0), base.rgb, metallic);

    // A cool, slightly blue-shifted key -- clean instrumentation rather
    // than a warm inhabited hull.
    vec3 col = base.rgb * vec3(0.85, 0.95, 1.05) * (0.5 + diff * (1.3 + 0.4 * audioSwell) + fill * 0.3);
    col += specColor * spec * (0.5 + 0.6 * (1.0 - roughness));

    // Scan band: a thin bright stripe travels along the hull's own LOCAL
    // z-axis over time (object space, so it tracks the station's own
    // geometry through the tumble instead of sliding across world-space).
    float band = fract(vLocalPos.z * 1.3 - time * 0.25 * sp);
    float scan = smoothstep(0.0, 0.04, band) * (1.0 - smoothstep(0.04, 0.09, band));
    vec3 scanColor = mix(vec3(0.3, 0.9, 1.0), imgPalette(0.55), 0.15);
    col += scanColor * scan * (0.5 + 0.6 * audioSwell + 0.9 * audioKick);

    // Modest rim so silhouettes separate from black without dominating.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.4, 0.8, 1.0) * fresnel * (0.12 + 0.25 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    float dist = length(vPos);
    float fogAmt = clamp((dist - 100.0) / 160.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

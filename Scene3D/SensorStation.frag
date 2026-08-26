#version 330 core
out vec4 fragColor;
/**
 * @file SensorStation.frag
 * @brief GEOM="MESH" STATION FAMILY: science/sensor/comms hulls (relay
 * stations, laboratories, terraforming observers, comms arrays, deep-space
 * probes), watching over a colorful deep-space nebula painted onto the sky
 * shell Scene3DShader::buildGeometry() appends after the loaded mesh (see
 * SensorStation.vert) -- vBg selects shell vs. hull. Cool cyan tech light
 * plus a slow scanning band that sweeps along the hull's own local axis (in
 * OBJECT space, so it reads as the station's instrument scanning rather
 * than a shadow tied to world position); no photo-tinting on the hull
 * itself -- the nebula carries the color.
 *   audioSwell   -> key-light + scan-band intensity
 *   audioKick    -> a brief scan-band flare, like a returned ping
 *   audioAdvance -> tumble speed (vertex stage)
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

uniform float hueP;
uniform float scanP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in vec3 vLocalPos;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// ---- Sky shell: shared hash/noise/fbm + a cool nebula ----
float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0,0.0,0.0)), n100 = hash13(i + vec3(1.0,0.0,0.0));
    float n010 = hash13(i + vec3(0.0,1.0,0.0)), n110 = hash13(i + vec3(1.0,1.0,0.0));
    float n001 = hash13(i + vec3(0.0,0.0,1.0)), n101 = hash13(i + vec3(1.0,0.0,1.0));
    float n011 = hash13(i + vec3(0.0,1.0,1.0)), n111 = hash13(i + vec3(1.0,1.0,1.0));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float starsField(vec3 dir, float density) {
    float h = hash13(floor(dir * 500.0));
    return smoothstep(1.0 - density, 1.0, h);
}
vec3 renderSky(vec3 dir)
{
    // A cool cyan/violet nebula -- the "watching the cosmos" backdrop this
    // family's own instruments are actually pointed at.
    float n1 = fbm(dir * 2.4 + vec3(0.0, 0.0, time * 0.004));
    float n2 = fbm(dir * 6.0 - vec3(time * 0.002, 0.0, 0.0));
    vec3 tintA = vec3(0.10, 0.35, 0.55), tintB = vec3(0.35, 0.15, 0.55);
    vec3 cloud = mix(tintA, tintB, smoothstep(0.3, 0.7, n2)) * smoothstep(0.3, 0.8, n1);
    return cloud * 0.9 + vec3(1.0) * starsField(dir, 0.002);
}

void main()
{
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

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
    col += vec3(0.3, 0.9, 1.0) * scan * (0.5 + 0.6 * audioSwell + 0.9 * audioKick);

    // Modest fixed rim so silhouettes separate from black without
    // dominating -- the nebula outside now carries the color variety.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.4, 0.8, 1.0) * fresnel * (0.12 + 0.25 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file ExoticStation.frag
 * @brief GEOM="MESH" STATION FAMILY: the five one-off stations that don't
 * fit the other families (agri-biosphere, neutral diplomatic seat, solar
 * collector, luxury border post, smuggler hideout), each shown against its
 * own backdrop painted onto the sky shell Scene3DShader::buildGeometry()
 * appends after the loaded mesh (see ExoticStation.vert) -- vBg selects
 * shell vs. hull. Unlike the other families, these five are meant to look
 * DELIBERATELY different from each other -- tintP is a fixed per-instance
 * accent hue (independent of the per-activation hueP drift below) that
 * colors BOTH the hull's own small accent glow and the backdrop, bgTypeP
 * picks which of three backdrop styles (0=nebula, 1=asteroid field,
 * 2=starfield with a bright nearby star/sun), and glowP is each instance's
 * own accent brightness, so one shader covers a glowing green greenhouse, a
 * gold pagoda and a barely-lit smuggler's den without five separate files.
 *   audioSwell   -> key-light + accent-glow strength
 *   audioKick    -> accent-glow flicker
 *   audioAdvance -> tumble speed (vertex stage)
 *
 * Per-instance: sizeP (relative scale), tintP (fixed accent hue, radians),
 *               glowP (accent brightness -- turn this low for something
 *               meant to look dim/covert), bgTypeP (0/1/2, see above).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float tintP;
uniform float glowP;
uniform float bgTypeP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// ---- Sky shell: shared hash/noise/fbm + three backdrop styles, all tinted
// by this instance's own accentColor so the environment and the hull's
// accent glow read as one coherent identity. ----
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
vec3 renderSky(vec3 dir, vec3 tint, float bgType)
{
    if (bgType < 0.5)   // nebula
    {
        float n1 = fbm(dir * 2.2 + vec3(time * 0.005, 0.0, 0.0));
        float n2 = fbm(dir * 5.0 - vec3(0.0, 0.0, time * 0.003));
        vec3 cloud = mix(tint * 0.12, tint * 1.3, smoothstep(0.35, 0.75, n1)) * (0.5 + 0.6 * n2);
        return cloud + vec3(1.0) * starsField(dir, 0.0018);
    }
    else if (bgType < 1.5)   // asteroid field -- a hidden, covert backdrop
    {
        float haze = fbm(dir * 1.6);
        vec3 col = tint * 0.05 * haze;
        float rocks = smoothstep(0.56, 0.63, fbm(dir * 9.0));
        col += tint * 0.3 * rocks;
        return col + vec3(1.0) * starsField(dir, 0.001) * (1.0 - rocks);
    }
    else   // starfield with a bright nearby star -- for the solar collector
    {
        vec3 sunDir = normalize(vec3(-0.3, 0.15, 1.0));
        float d = max(dot(dir, sunDir), 0.0);
        vec3 sun = tint * pow(d, 400.0) * 8.0 + tint * pow(d, 8.0) * 0.6;
        return vec3(0.01) + sun + vec3(1.0) * starsField(dir, 0.0015);
    }
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float tint = tintP;                          // 0 is a valid, meaningful hue -- no fallback
    float gp   = (glowP > 0.01 ? glowP : 1.0);
    vec3 accentColor = hsv2rgb(vec3(tint / 6.2831853, 0.55, 1.0));

    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos), accentColor, bgTypeP), 1.0);
        return;
    }

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.55, metallic = 0.25;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    vec3 lightDir = normalize(vec3(0.35, 0.55, -0.55));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(50.0, 8.0, roughness));
    vec3 specColor = mix(vec3(1.0), base.rgb, metallic);

    vec3 col = base.rgb * (0.5 + diff * (1.3 + 0.4 * audioSwell) + fill * 0.3);
    col += specColor * spec * (0.5 + 0.6 * (1.0 - roughness));

    // The one deliberately shared trick: the accent color comes from
    // tintP, so each instance's XML entry picks its own signature color
    // (greenhouse green, gold, muted grey, ...) without touching this file.
    // It rides the same "bright baked patches glow" idea as the other
    // families' window/vent/docking accents.
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float accentMask = smoothstep(0.18, 0.45, luma);
    col += accentColor * accentMask * gp * (0.4 + 0.5 * audioSwell) * (0.85 + 0.3 * audioKick);

    // Fixed accentColor rim -- tintP is this instance's whole identity, so
    // the hull's own rim stays that color rather than picking up whatever
    // the backdrop happens to be doing at that exact pixel.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += accentColor * fresnel * (0.1 + 0.2 * audioSwell) * gp;

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

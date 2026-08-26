#version 330 core
out vec4 fragColor;
/**
 * @file ExoticStation.frag
 * @brief GEOM="MESH" STATION FAMILY: the five one-off stations that don't
 * fit the other families (agri-biosphere, neutral diplomatic seat, solar
 * collector, luxury border post, smuggler hideout). Unlike the other
 * families, these five are meant to look DELIBERATELY different from each
 * other -- tintP is a fixed per-instance accent hue (independent of the
 * per-activation hueP drift below), and glowP is each instance's own accent
 * brightness, so one shader can be a glowing green greenhouse, a warm gold
 * pagoda, and a barely-lit smuggler's den without three separate files.
 *   audioSwell   -> key-light + accent-glow strength
 *   audioKick    -> accent-glow flicker
 *   audioAdvance -> tumble speed (vertex stage)
 *   audioChromaHue-> palette follows the musical key
 *
 * Per-instance: sizeP (relative scale), tintP (fixed accent hue, radians),
 *               glowP (accent brightness -- turn this low for something
 *               meant to look dim/covert).
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
uniform float tintP;
uniform float glowP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;

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

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float tint = tintP;                          // 0 is a valid, meaningful hue -- no fallback
    float gp   = (glowP > 0.01 ? glowP : 1.0);

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
    // tintP, an HSV hue turned into RGB, so each instance's XML entry picks
    // its own signature color (greenhouse green, gold, muted grey, ...)
    // without touching this file. It rides the same "bright baked patches
    // glow" idea as the other families' window/vent/docking accents.
    vec3 accentColor = hsv2rgb(vec3(tint / 6.2831853, 0.55, 1.0));
    // Threshold sits low for the same reason as every other family's
    // highlight mask in this batch: the baked albedo runs uniformly dark,
    // so a band tuned for a normal-brightness texture never fires (see
    // IndustrialStation.frag's vent-mask note for the measurement).
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float accentMask = smoothstep(0.18, 0.45, luma);
    col += accentColor * accentMask * gp * (0.4 + 0.5 * audioSwell) * (0.85 + 0.3 * audioKick);

    // accentColor dominates here too, same reasoning as every other family
    // in this batch: tintP is this instance's whole identity, and a
    // strongly-tinted background photo must not be allowed to override it.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(accentColor, imgPalette(0.5), 0.2) * fresnel * (0.1 + 0.2 * audioSwell) * gp;

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    float dist = length(vPos);
    float fogAmt = clamp((dist - 105.0) / 160.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

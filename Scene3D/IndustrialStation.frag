#version 330 core
out vec4 fragColor;
/**
 * @file IndustrialStation.frag
 * @brief GEOM="MESH" STATION FAMILY: mining/refinery/salvage hulls (asteroid
 * refineries, mining cores, fuel depots, ice processors, scrap yards). Dim,
 * grimy ambient light plus a warm furnace/vent glow that flickers with the
 * beat, standing in for open smelting/venting machinery.
 *   audioKick    -> furnace-glow flare
 *   audioSwell   -> ambient light level (never fully bright -- this is a
 *                   working yard, not a showroom)
 *   audioAdvance -> tumble speed (vertex stage)
 *   audioChromaHue-> palette follows the musical key
 *
 * Per-instance: sizeP (relative scale), glowP (furnace-glow intensity).
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

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float gp  = (glowP > 0.01 ? glowP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.75, metallic = 0.5;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // A dim, cold ambient wash -- this yard runs on its own furnace glow,
    // not daylight.
    vec3 lightDir = normalize(vec3(0.3, 0.55, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.4 + 0.4 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(30.0, 6.0, roughness));
    vec3 specColor = mix(vec3(0.9), base.rgb, metallic);

    vec3 col = base.rgb * (0.32 + diff * (1.1 + 0.35 * audioSwell) + fill * 0.22);
    col += specColor * spec * (0.45 + 0.5 * (1.0 - roughness));

    // Furnace/vent glow: dark patches of the baked albedo (vents, exposed
    // machinery, shadowed gaps) flare orange on the beat -- an open
    // smelting process reacting to the music, not a lit window.
    // These industrial hulls' baked albedo runs uniformly dark (measured on
    // AsteroidRefinery's own texture: 90% of its pixels fall under luma
    // 0.19) -- a threshold tuned for a normal-brightness texture would treat
    // nearly the WHOLE surface as "vent", not just the genuinely darkest
    // gaps, and the flare below would read as an all-over glow instead of a
    // handful of hot spots.
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float ventMask = 1.0 - smoothstep(0.03, 0.12, luma);
    float flare = 0.15 + 0.25 * sin(time * 3.0) + 0.7 * audioKick;
    col += vec3(1.0, 0.42, 0.08) * ventMask * max(flare, 0.0) * gp * (0.4 + 0.3 * audioSwell);

    // A cool rim so the hull still separates from pure black -- kept
    // modest, this is an accent, not a wash (see Spaceship.frag's own note
    // on why that balance matters for a dark albedo). Mostly a fixed cool
    // tint rather than pure imgPalette(), for the same reason the vent
    // flare above stays a fixed orange: a strongly-tinted background photo
    // can otherwise overrule this family's own signature color.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(vec3(0.6, 0.7, 0.8), imgPalette(0.4), 0.2) * fresnel * (0.08 + 0.15 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    float dist = length(vPos);
    float fogAmt = clamp((dist - 100.0) / 150.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

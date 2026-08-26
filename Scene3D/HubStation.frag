#version 330 core
out vec4 fragColor;
/**
 * @file HubStation.frag
 * @brief GEOM="MESH" STATION FAMILY: civilian/trade hubs (cargo docks,
 * merchanter outposts, shipyards, quarantine posts, trade promenades).
 * Warm, brighter key light plus busy amber docking-light speckle across the
 * hull's darker baked patches -- a hub that's alive with traffic, not a
 * single glow but many small ones.
 *   audioSwell   -> key-light strength, docking-light brightness
 *   audioKick    -> docking-light twinkle
 *   audioAdvance -> tumble speed (vertex stage)
 *   audioChromaHue-> palette follows the musical key
 *
 * Per-instance: sizeP (relative scale), busyP (docking-light density).
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
uniform float busyP;

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

// Cheap per-cell hash for the docking-light speckle -- a fixed grid in UV
// space, not tied to any particular mesh's UV layout details.
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 78.233);
    return fract(p.x * p.y);
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float bp  = (busyP > 0.01 ? busyP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.6, metallic = 0.25;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    vec3 lightDir = normalize(vec3(0.4, 0.6, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.55 + 0.45 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(40.0, 6.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic);

    // Brighter overall than the other families -- this is a lit,
    // populated hub, not deep infrastructure or a warship.
    vec3 col = base.rgb * (0.6 + diff * (1.3 + 0.4 * audioSwell) + fill * 0.4);
    col += specColor * spec * (0.5 + 0.55 * (1.0 - roughness));

    // Docking-light speckle: many small twinkling points across a coarse UV
    // grid, gated to the hull's darker patches (structure/shadow, not the
    // bright hazard-marking patches RingStation's window-glow already
    // covers for that use). Each cell gets its own on/off + twinkle phase.
    float lumaCell = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    // step()'s threshold is 1-density, so at busyP=1.4 the ORIGINAL 0.35
    // factor lit ~49% of all cells at once -- read as a uniform wash
    // instead of scattered points (found by rendering: the whole hull
    // read as one flat glowing color). 0.12 keeps even the busiest
    // instance under ~17%.
    vec2 grid = vUV * 40.0;
    vec2 cell = floor(grid);
    float r = hash21(cell);
    float lit = step(1.0 - 0.12 * bp, r);
    float twinkle = 0.5 + 0.5 * sin(time * (2.0 + r * 6.0) + r * 30.0);
    float darkMask = 1.0 - smoothstep(0.15, 0.45, lumaCell);
    // Mostly the fixed warm amber -- imgPalette() can otherwise overrule a
    // family's whole signature color when the loaded photo has a strong
    // cast of its own (a galaxy/nebula photo pushed an earlier version of
    // this all the way to teal-green, drowning out "warm hub lights").
    vec3 lightColor = mix(vec3(1.0, 0.75, 0.4), imgPalette(0.85), 0.15);
    col += lightColor * lit * darkMask * twinkle * (0.5 + 0.4 * audioSwell + 0.4 * audioKick);

    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(vec3(1.0, 0.8, 0.5), imgPalette(0.3), 0.2) * fresnel * (0.08 + 0.15 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    float dist = length(vPos);
    float fogAmt = clamp((dist - 105.0) / 160.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

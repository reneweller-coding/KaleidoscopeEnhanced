#version 330 core
out vec4 fragColor;
/**
 * @file RingStation.frag
 * @brief GEOM="MESH" STATION FAMILY: wheel/ring/torus-shaped stations (spin-
 * gravity habitats, research rings, jump-gate anchors, megastructure hubs).
 * A cool distant starlight key, plus a self-illumination trick standing in
 * for lit windows -- there is no separate emissive map, so bright patches of
 * the baked albedo (window strips, warning markings) are treated as if lit
 * from within, which is what those patches usually ARE in a baked texture.
 *   audioAdvance -> spin speed (vertex stage)
 *   audioSwell   -> key-light strength, window-glow brightness
 *   audioKick    -> window-glow flicker
 *   audioChromaHue-> palette follows the musical key
 *
 * Per-instance (config attributes, all optional, sane defaults):
 *   sizeP  relative scale
 *   spinP  relative spin speed
 *   windowP window-glow intensity
 * Per-activation variety:
 *   hueP float palette offset (0..6.28)
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
uniform float windowP;

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
    float wp  = (windowP > 0.01 ? windowP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    // This pass draws opaque/depth-tested with GL_BLEND off (see
    // Scene3DShader::draw()'s GEOM_MESH branch) -- a partial alpha can't
    // fade, so treat the opacity map as a cutout mask (docking grates,
    // antenna lattices) instead of silently ignoring it.
    if (base.a < 0.1) discard;
    float roughness = 0.6, metallic = 0.3;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // A cold, distant star -- these hulls read as far-out infrastructure,
    // not something basking in a nearby sun.
    vec3 lightDir = normalize(vec3(0.3, 0.5, -0.6));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(48.0, 6.0, roughness));
    vec3 specColor = mix(vec3(0.9, 0.95, 1.0), base.rgb, metallic);

    // Same balance lesson learned building the first mesh scene (Spaceship):
    // this hull's baked albedo is dark by design, so the ambient/diffuse
    // floor has to be generous or every additive accent below reads as if
    // it's the whole surface's color instead of a highlight on top of it.
    vec3 col = base.rgb * (0.5 + diff * (1.3 + 0.5 * audioSwell) + fill * 0.3);
    col += specColor * spec * (0.5 + 0.6 * (1.0 - roughness));

    // Faux window glow: the brightest patches of the baked albedo (window
    // strips, hazard markings) are treated as self-lit rather than merely
    // well-illuminated -- there is no separate emissive map to sample.
    // These hulls' baked albedo runs uniformly dark (measured directly on
    // this batch of station textures), so the highlight threshold sits well
    // below what a normal-brightness texture would need -- otherwise
    // "brightest patches" never fires at all and the window glow never
    // shows (see IndustrialStation.frag's vent-mask note for the same
    // measurement, the other direction: over- rather than under-firing).
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float windowMask = smoothstep(0.25, 0.55, luma);
    // Mostly the fixed warm window color -- a strongly-tinted background
    // photo (e.g. a galaxy/nebula shot) can otherwise push imgPalette()'s
    // contribution far enough to overrule the family's own signature color.
    vec3 windowColor = mix(vec3(1.0, 0.85, 0.55), imgPalette(0.6), 0.15);
    col += windowColor * windowMask * wp * (0.4 + 0.4 * audioSwell) * (0.85 + 0.3 * audioKick);

    // A soft cool starlight rim, kept modest -- an edge accent, not a wash.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(vec3(0.7, 0.85, 1.0), imgPalette(0.15), 0.2) * fresnel * (0.1 + 0.2 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Fade into the black of space with distance from the camera.
    float dist = length(vPos);
    float fogAmt = clamp((dist - 110.0) / 170.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

#version 330 core
out vec4 fragColor;
/**
 * @file FortressStation.frag
 * @brief GEOM="MESH" STATION FAMILY: armored/military hulls (bastions,
 * citadels, border patrol posts, defense platforms, fortified outposts).
 * Harsh single-source key light (a searchlight/beacon, not a soft star) plus
 * a pulsing red alarm-strobe accent on the hull's brightest baked markings.
 *   audioKick    -> alarm-strobe flashes
 *   audioSwell   -> key-light intensity
 *   audioAdvance -> tumble speed (vertex stage)
 *   audioChromaHue-> palette follows the musical key (tints the key light)
 *
 * Per-instance: sizeP (relative scale), alarmP (strobe intensity).
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
uniform float alarmP;

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
    float ap  = (alarmP > 0.01 ? alarmP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.55, metallic = 0.4;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // Harsh, hard-edged key light -- a searchlight raking across armor
    // plating, not a soft ambient star. Tinted faintly by the musical key
    // via imgPalette so it isn't a flatly generic white beam.
    vec3 lightDir = normalize(vec3(0.55, 0.35, -0.55));
    float diff = pow(max(dot(n, lightDir), 0.0), 1.4);
    float fill = 0.35 + 0.35 * dot(n, vec3(0.0, 1.0, 0.0));
    vec3 keyTint = mix(vec3(1.0), imgPalette(0.05), 0.25);

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(40.0, 8.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.9, 0.85), base.rgb, metallic);

    // Dark by design (see RingStation/Spaceship's own notes on this) --
    // enough ambient floor to actually see the armor plating, but dimmer
    // overall than the civilian families: this hull is meant to look grim.
    vec3 col = base.rgb * keyTint * (0.35 + diff * (1.5 + 0.5 * audioSwell) + fill * 0.25);
    col += specColor * spec * (0.55 + 0.7 * (1.0 - roughness));

    // Alarm strobe: the hull's own brightest baked markings (hazard
    // stripes, running lights) pulse red on the beat instead of glowing
    // steadily -- a fortress under readiness, not asleep.
    // Threshold sits low because this batch's baked albedo runs uniformly
    // dark (see IndustrialStation.frag's vent-mask note) -- a 0.4-0.8 band
    // tuned for a normal-brightness texture would never fire on these hulls.
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float markingMask = smoothstep(0.22, 0.5, luma);
    float pulse = 0.5 + 0.5 * sin(time * 6.0 + audioAdvance * 2.0);
    float strobe = markingMask * (pulse * 0.4 + audioKick * 0.8) * ap;
    col += vec3(1.0, 0.12, 0.08) * strobe;

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    float dist = length(vPos);
    float fogAmt = clamp((dist - 105.0) / 160.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

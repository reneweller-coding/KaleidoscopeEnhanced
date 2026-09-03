#version 330 core
out vec4 fragColor;
/**
 * @file ShipShadowPlay.frag
 * @brief Fragment stage for ShipShadowPlay: the wall (sky shell's back face)
 * is lit by the two coloured lamps; the ship itself is a dim silhouette; the
 * two projected copies are flat shadows in the complementary colour of the
 * lamp that casts them (where a red lamp's shadow falls, only the blue lamp
 * lights the wall), overlapping to dark.
 *
 * Audio Reactivity: audioKick brightens lamp A, audioSnare lamp B (light);
 *                   audioSwell warms both; audioLevel is the wall level.
 */
uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSnare;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;
in float vKind;

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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    // Lamps: mostly steady (a whole wall flickering on every hit is a strobe),
    // a quarter of their light follows the instruments.
    vec3 lampA = (imgPalette(hue * 0.159 + 0.05) * 1.6 + 0.3) * (0.85 + 0.25 * audioKick)  * (0.8 + 0.3 * audioSwell);
    vec3 lampB = (imgPalette(hue * 0.159 + 0.55) * 1.6 + 0.3) * (0.85 + 0.25 * audioSnare) * (0.8 + 0.3 * audioSwell);

    if (vBg > 0.5)
    {
        // The wall: the shell's far face, lit by both lamps (a wide soft
        // pool each), the photo faint as its plaster; everything else dark.
        vec3 d = normalize(vPos);
        float wall = smoothstep(0.55, 0.8, d.z);
        vec2 uv = d.xy / max(d.z, 0.3) * 0.5 + 0.5;
        vec3 plaster = img(clamp(uv, 0.0, 1.0)) * 0.3 + 0.45;
        float poolA = exp(-dot(d.xy - vec2(-0.2, 0.1), d.xy - vec2(-0.2, 0.1)) * 2.5);
        float poolB = exp(-dot(d.xy - vec2(0.2, 0.08), d.xy - vec2(0.2, 0.08)) * 2.5);
        vec3 col = plaster * (lampA * poolA + lampB * poolB) * 0.9 * wall * (0.8 + 0.4 * audioLevel);
        col += imgPalette(hue * 0.159 + 0.6) * 0.015;
        fragColor = vec4(col, 1.0);
        return;
    }

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    vec3 col;
    if (vKind < 0.5)
    {
        // The ship: nearly a silhouette, a little rim from each lamp.
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(-vPos);
        float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        col = base.rgb * 0.12 + (lampA + lampB) * fres * 0.45;
    }
    else
    {
        // A shadow: where lamp k is blocked, the wall keeps only the OTHER
        // lamp's light -- a coloured shadow, dark where both overlap.
        vec3 other = (vKind < 1.5) ? lampB : lampA;
        // Coloured shadow: the wall under it keeps only the other lamp.
        vec3 plaster = vec3(0.6);
        col = plaster * other * 0.9 * (0.8 + 0.4 * audioLevel);
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}

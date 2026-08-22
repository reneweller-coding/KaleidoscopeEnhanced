#version 330 core
out vec4 fragColor;
/**
 * @file SubglacialVolcanicPillowLava.frag
 * @brief SUBGLACIAL VOLCANIC PILLOW LAVA: 220x120 heightfield grid of basaltic pillow lava
 * extruding under glacial ice sheets. Glassy quenching basalt crust, incandescent magma
 * fissure glows, hydrothermal steam cavitation, and photo texturing.
 *   audioAdvance -> drives subglacial lava lobe extrusion & spreading
 *   audioKick    -> fractures glassy basalt crust with molten magma flashes
 *   audioSwell   -> widens incandescent fissure thickness & thermal luminance
 *   audioCentroid-> shifts magma thermal emission spectra (amber to gold)
 *
 * Per-activation variety:
 *   pillowScaleP float pillow lava lobe packing density     (2.5..6.0)
 *   lavaHeatP    float incandescent fissure magma luminance (0.8..2.5)
 *   crustGlowP   float glassy basalt crust specular sheen   (0.6..2.0)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vHeat;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float lavaHeatP;
uniform float crustGlowP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 16.0) * (crustGlowP > 0.01 ? crustGlowP : 1.0);

    // Molten lava fissure color
    vec3 hotLava = vec3(1.0, 0.4, 0.05);
    vec3 lavaCol = palTint(hotLava, vHeat * 0.3 + audioCentroid, 0.22);

    vec3 photo = img(vUV);

    // Dark glassy quench crust -- the old palette-bright crust plus a
    // white specular read as cow-hide spots, not subglacial basalt.
    vec3 crust = vCol * 0.20 * (0.55 + 0.45 * photo) * (0.35 + 0.65 * diff);
    crust = mix(crust, vec3(0.05, 0.07, 0.10), 0.35);
    vec3 col = crust;
    col += vec3(0.55, 0.75, 1.0) * spec * 0.35;
    col += lavaCol * vHeat * (lavaHeatP > 0.01 ? lavaHeatP : 1.5) * 3.2;
    col *= (0.85 + 0.35 * audioSwell);
    col += lavaCol * (audioKick * 0.35);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

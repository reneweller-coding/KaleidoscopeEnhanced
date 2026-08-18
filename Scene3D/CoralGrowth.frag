#version 330 core
out vec4 fragColor;
// CoralGrowth.frag — living tissue over a calcified core.
// Age is the useful signal here: the old interior is bleached and hard, the
// young tips are pigmented and translucent.  Colouring by age rather than by
// position is what makes the growth legible — you can see where the colony has
// been and where it is going.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vAge;        // 1 = oldest branches, 0 = newest tips
in float vHeight;

/**
 * @file CoralGrowth.frag
 * @brief Lighting for a growing coral colony: bleached, hard old wood in the
 * interior giving way to pigmented, translucent young tips at the growing
 * edge, wrapped in a cold underwater volume.
 *
 * Colour is driven by growth age (vAge/vHeight) rather than position, with
 * hue taken from a photo-palette arc (imgPalette, keyed by audioChromaHue and
 * audioAdvance, saturation shaped by audioValence). audioKick and audioLevel
 * pump the fluorescent glow of the newest tips, audioHigh adds a tight
 * specular highlight, audioAmbient brightens the cool counter-light and the
 * depth fog, and audioBeat plus audioSubBass give the final image a soft
 * overall pulse.
 */

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float hueP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L  = normalize(vec3(0.35, 0.80, -0.48));
    vec3 L2 = normalize(vec3(-0.6, -0.25, -0.65));

    float tip = 1.0 - vAge;

    // Old wood bleached, young tips pigmented.
    float hue = fract(0.90 + 0.30 * (hueP - 0.5) + 0.12 * vHeight
                      + 0.05 * sin(audioChromaHue));
    vec3 flesh = hue2rgb(hue);
    vec3 base = mix(vec3(0.55, 0.52, 0.47), flesh, clamp(tip * 1.5, 0.0, 1.0));

    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);
    vec3 col = base * (0.16 + 0.75 * diff + 0.40 * wrap * wrap);

    // Cool underwater bounce from below.
    col += base * vec3(0.30, 0.55, 0.80) * max(dot(n, L2), 0.0) * 0.55
         * (0.5 + 0.8 * audioAmbient);

    // The tips glow: living polyps fluoresce, and it is what makes the growing
    // edge visible against the mass behind it.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    col += flesh * pow(tip, 2.2) * (0.5 + 1.6 * glowP)
         * (0.35 + 0.45 * audioKick + 0.35 * audioLevel);
    col += hue2rgb(fract(hue + 0.45)) * fres * (0.25 + 0.7 * glowP);

    vec3 H = normalize(L + V);
    col += vec3(0.9, 0.97, 1.0) * pow(max(dot(n, H), 0.0), 55.0)
         * (0.3 + 1.5 * audioHigh);

    // Water: everything sits in a cold volume that darkens with depth.
    vec3 water = vec3(0.02, 0.06, 0.10) * (1.0 + 0.7 * audioAmbient);
    col = mix(water, col, clamp(0.35 + 0.65 * vHeight, 0.0, 1.0));

    col *= 1.0 + 0.18 * audioBeat + 0.14 * audioSubBass;
    col = col / (1.0 + col * 0.36);
    fragColor = vec4(col, interpolation);
}

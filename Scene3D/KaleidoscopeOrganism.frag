#version 330 core
out vec4 fragColor;
// KaleidoscopeOrganism.frag — crystalline bioluminescence, coloured by which
// mirror-wedge a fragment belongs to so the kaleidoscope's own symmetry is
// visible in the palette, not just the silhouette.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vAge;        // 1 = oldest branches, 0 = newest tips
in float vDepth;

/**
 * @file KaleidoscopeOrganism.frag
 * @brief Lighting for the growing, mirror-replicated DLA organism from KaleidoscopeOrganism.comp:
 * crystalline/bioluminescent rather than coral-organic, with hue shifted per angular wedge
 * (derived from vObj's own azimuth) so the mirror-kaleidoscope symmetry the generator built into
 * the geometry is reinforced by colour, not left for the silhouette alone to carry.
 *
 * Colour is imgPalette-driven (photo-arc, key-locked via audioChromaHue), tip glow pumped by
 * audioKick/audioLevel, a tight specular highlight from audioHigh, and a cool ambient fill from
 * audioAmbient. audioBeat/audioSubBass give the whole image a soft overall pulse.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;
uniform float audioAdvance;
uniform float audioValence;

uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L  = normalize(vec3(0.35, 0.80, -0.48));
    vec3 L2 = normalize(vec3(-0.6, -0.25, -0.65));

    float tip = 1.0 - vAge;

    // Wedge hue: the azimuth around Y reveals which of the NFOLD mirror
    // copies this fragment belongs to, so colour reinforces the symmetry.
    float wedgeHue = atan(vObj.z, vObj.x) / 6.2831853;
    float hue = fract(0.5 + wedgeHue + 0.3 * (hueP - 0.5) + 0.10 * vDepth);
    vec3 flesh = imgPalette(hue) * 1.4;
    vec3 base = mix(vec3(0.10, 0.11, 0.16), flesh, clamp(tip * 1.4 + 0.25, 0.0, 1.0));

    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);
    vec3 col = base * (0.14 + 0.7 * diff + 0.45 * wrap * wrap);

    col += base * vec3(0.35, 0.45, 0.85) * max(dot(n, L2), 0.0) * 0.5
         * (0.5 + 0.8 * audioAmbient);

    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    col += flesh * pow(tip, 2.0) * (0.6 + 1.6 * glowP)
         * (0.35 + 0.5 * audioKick + 0.35 * audioLevel);
    col += imgPalette(fract(hue + 0.45)) * fres * (0.3 + 0.75 * glowP);

    vec3 H = normalize(L + V);
    col += vec3(0.9, 0.95, 1.0) * pow(max(dot(n, H), 0.0), 55.0)
         * (0.35 + 1.4 * audioHigh);

    vec3 space = vec3(0.02, 0.02, 0.05) * (1.0 + 0.6 * audioAmbient);
    col = mix(space, col, clamp(0.4 + 0.6 * (1.0 - vDepth * 0.4), 0.0, 1.0));

    col *= 1.0 + 0.2 * audioBeat + 0.15 * audioSubBass;
    col = col / (1.0 + col * 0.34);
    fragColor = vec4(col, interpolation);
}

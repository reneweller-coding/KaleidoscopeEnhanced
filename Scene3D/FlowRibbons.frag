#version 330 core
out vec4 fragColor;
// FlowRibbons.frag — thin, two-sided, iridescent.
// A ribbon has no inside, so both faces are lit; and because its normal swings
// through a full turn as it twists, the strongest cue in the whole image is the
// FLASH each ribbon gives when its face swings toward the eye.  Everything here
// is built to make that flash count.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vAlong;
in float vRnd;
in float vDist;

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

uniform float camHP;
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
    // Two-sided: a ribbon is a surface with no volume, so the far face is just
    // as real as the near one.
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.45, 0.72, -0.52));

    // Hue by ribbon, so the flow separates into distinguishable strands rather
    // than a single coloured fog.
    float hue = fract(0.55 + 0.42 * hueP + 0.5 * vRnd + 0.06 * sin(audioChromaHue));
    vec3 tint = hue2rgb(hue);

    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);
    vec3 col = tint * (0.18 + 0.55 * diff + 0.35 * wrap * wrap);

    // The flash: a tight specular that only fires when the twisting face
    // happens to catch the light.
    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.97, 0.92) * pow(max(dot(n, H), 0.0), 90.0)
         * (0.8 + 2.4 * audioHigh) * (0.5 + glowP);

    // Iridescence: the hue shifts with the viewing angle, the way a thin film
    // does.  It is what stops a mass of ribbons reading as coloured plastic.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    col += hue2rgb(fract(hue + 0.35 + 0.25 * fres)) * fres
         * (0.4 + 1.1 * glowP) * (0.5 + 0.9 * audioLevel);

    // A pulse travelling along each ribbon on the kick.
    float pulse = fract(vAlong * 1.5 - time * 0.5 - vRnd * 3.0);
    col += tint * pow(max(1.0 - abs(pulse - 0.5) * 6.0, 0.0), 3.0)
         * (0.2 + 1.4 * audioKick);

    col += tint * 0.12 * audioAmbient;

    // Haze into the distance so the slab has depth.
    float haze = clamp(vDist / 30.0, 0.0, 1.0);
    col = mix(col, vec3(0.03, 0.04, 0.07), pow(haze, 1.6) * 0.85);

    col *= 1.0 + 0.20 * audioBeat + 0.15 * audioSubBass;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}

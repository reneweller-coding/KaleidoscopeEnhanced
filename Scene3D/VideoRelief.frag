#version 330 core
out vec4 fragColor;
// VideoRelief.frag — light the terrain, but keep the picture readable.
// The temptation is to shade it like rock, which buries the source; the image
// has to stay the dominant term and the lighting has to sit on top of it, so
// the relief reads as the picture standing up rather than as a landscape that
// happens to be coloured.

in vec2  vUv;
in vec3  vNormal;
in vec3  vView;
in float vHeight;

/**
 * @file VideoRelief.frag
 * @brief Lights the image-as-terrain relief built in VideoRelief.vert (the
 * slideshow photo's luminance raised into height) while keeping the source
 * picture itself the dominant term, so the result reads as the photo
 * standing up rather than a shaded landscape.
 *
 * audioHigh sharpens a specular highlight; audioKick and audioChromaHue
 * drive a rim-light wash along the ridge lines, coloured from the rotating
 * photo-arc palette; audioBeat and audioSubBass pulse overall exposure;
 * audioAmbient adds a flat fill from the source image; and inkP (a preset)
 * controls how strongly the directional lighting is allowed to bite into
 * the picture versus leaving it untouched.
 */

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float inkP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;         // preset: how much the lighting is allowed to bite

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

    vec3 L  = normalize(vec3(-0.55, 0.68, -0.48));
    vec3 L2 = normalize(vec3(0.62, 0.22, -0.75));

    vec3 src = img(vUv);

    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);
    float bite = clamp(inkP, 0.0, 1.5);

    // The picture, relit.  Mixing toward 1 rather than multiplying keeps the
    // shading from crushing the darker parts of the source to nothing.
    vec3 col = src * mix(vec3(1.0), vec3(0.30 + 1.25 * diff + 0.35 * wrap * wrap), bite);

    col += src * max(dot(n, L2), 0.0) * vec3(0.30, 0.42, 0.62) * 0.35;

    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.97, 0.92) * pow(max(dot(n, H), 0.0), 45.0)
         * (0.35 + 1.6 * audioHigh) * (0.4 + 0.9 * glowP);

    // The high ground catches a rim; it is the ridge line of the picture.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.2);
    col += hue2rgb(fract(0.12 + 0.5 * vHeight + 0.06 * sin(audioChromaHue)))
         * fres * (0.25 + 0.7 * glowP) * (0.4 + 1.0 * audioKick);

    col += src * 0.18 * audioAmbient;
    col *= 1.0 + 0.16 * audioBeat + 0.12 * audioSubBass;
    col = col / (1.0 + col * 0.22);
    fragColor = vec4(col, interpolation);
}

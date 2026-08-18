#version 330 core
out vec4 fragColor;
// SpectrumFilter.frag — the picture seen through the SONG's own EQ curve.
// Blend/CfxFFT*.comp transform the photo's luminance, weight each spatial
// frequency by the matching audio band and transform back: bass dissolves the
// image into broad shapes, hi-hats cut its edges back in.
//
// texFFT: R = filtered luma, G = |filtered - original| (where the filter is
// working hardest), B = original luma.

uniform sampler2D tex0;
uniform sampler2D texFFT;        // <- requests the FFT pass
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;

uniform float mixP;              // how much of the filtered luma to take
uniform float glowP;
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

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    vec3 photo = texture(tex0, uv).rgb;
    vec4 fft   = texture(texFFT, uv);

    float lf = fft.r;            // filtered luminance
    float work = fft.g;          // how much this region was changed
    float l0 = max(fft.b, 1e-4); // original luminance

    // Re-light the ORIGINAL colours with the filtered luminance: the picture
    // keeps its palette and only its structure is rewritten by the music.
    float ratio = clamp(lf / l0, 0.0, 4.0);
    vec3 col = photo * mix(1.0, ratio, 0.55 + 0.45 * mixP) * 1.6;

    // Where the filter is doing the most work, glow in the chroma colour —
    // this is the visible trace of the spectrum acting on the image.
    vec3 tint = imgPalette(0.0) * 1.35;
    col += tint * work * (0.8 + 2.2 * glowP) * (0.5 + audioBeat);

    // Sub-bass pushes a soft bloom (the low bands are the coarse structure).
    vec3 soft = vec3(0.0);
    float r = 0.004 + 0.014 * audioSubBass;
    for (int i = 0; i < 6; ++i)
    {
        float t = float(i) * 1.0472;
        soft += texture(texFFT, uv + vec2(cos(t), sin(t)) * r).rrr;
    }
    col += photo * (soft / 6.0) * 0.30 * audioSubBass;

    // Treble sharpens: unsharp mask against the filtered luma.
    float hi = lf - (soft.r / 6.0);
    col += vec3(hi) * audioHigh * 1.1;

    col *= 1.0 + 0.20 * audioKick;
    col = col / (1.0 + col * 0.25);
    fragColor = vec4(col, interpolation);
}

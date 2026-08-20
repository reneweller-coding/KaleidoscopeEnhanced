#version 330 core
out vec4 fragColor;
/**
 * @file Halftone.frag
 * @brief Renders the photograph as a genuine four-colour halftone print: separate CMYK screens, each rotated to its own classic press angle (15, 75, 0 and 45 degrees) so the dot grids never form a moire.
 *
 * The image is converted to CMYK with under-colour removal, then each channel is screened independently before being recombined subtractively onto a warm paper tint. audioKick coarsens the screen frequency and widens a colour-press-style plate misregistration, audioSubBass adds to that misregistration slip, audioAdvance slowly drifts the screen angles so the moire pattern never settles, audioChromaHue nudges the paper's tint through a bounded hue rotation, and audioBeat with audioLevel lift the overall exposure.
 */
// Halftone.frag — the photograph as a four-colour print screen.
// -----------------------------------------------------------------------
// Real halftone printing separates an image into cyan, magenta, yellow and
// black, and screens each separation on its own grid ROTATED to a different
// angle: 15, 75, 0 and 45 degrees.  Those particular angles are not a style
// choice — they are the ones that keep the four dot grids from lining up into
// a moire pattern, which is what happens the moment two screens share an angle.
//
// So the effect is built the way a press does it: convert to CMYK, screen each
// channel separately at its own angle, then recombine subtractively.  Screening
// the RGB channels instead would give three grids that fight each other and a
// picture that looks like a bug rather than like print.
// -----------------------------------------------------------------------

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioAdvance;
uniform float audioChromaHue;

uniform float dotP;         // preset: screen frequency
uniform float inkP;         // preset: ink density
uniform float slipP;        // preset: registration error

// One separation: sample the channel on a grid rotated by 'ang', and return how
// much of this pixel the dot covers.
float screenDot(vec2 p, float ang, float value, float freq)
{
    float c = cos(ang), s = sin(ang);
    vec2 rp = mat2(c, -s, s, c) * p * freq;

    // Distance from the cell's centre, against a radius that grows with the
    // ink value.  sqrt because dot AREA should follow the value, not its
    // radius — without it the midtones come out far too dark.
    //
    // The constant is 1/sqrt(pi) = 0.564, not an eyeballed 0.72: at 0.72 a
    // full-value dot has area pi*0.72^2 = 1.63, i.e. 163% of its own cell, so
    // all four separations reached total coverage well before the picture was
    // actually solid and every one of them subtracted at once.  That is what
    // drove the frame to mean luma 0.034 with the leftovers reading as pure
    // press primaries.  At 0.564 coverage equals the ink value exactly, which
    // is what a press actually does.
    vec2 cell = fract(rp) - 0.5;
    float r = sqrt(clamp(value, 0.0, 1.0)) * 0.564;
    float d = length(cell);

    // Antialias against the actual pixel footprint, so the screen stays clean
    // when the frequency is high rather than dissolving into noise.
    float aa = fwidth(d) + 1e-4;
    return smoothstep(r + aa, r - aa, d);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Screen frequency in dots across the frame; the kick coarsens it briefly,
    // the way a press dropping to a coarser screen would.
    float freq = (36.0 + 150.0 * dotP) * (1.0 - 0.22 * audioKick);

    // Misregistration: the plates drift apart on the beat, which is the single
    // most recognisable failure mode of colour printing.
    float slip = slipP * (0.0016 + 0.010 * audioKick + 0.004 * audioSubBass);
    vec2 s1 = vec2( slip, 0.0);
    vec2 s2 = vec2(-slip * 0.6,  slip * 0.8);
    vec2 s3 = vec2( slip * 0.3, -slip * 0.9);

    vec3 rgbC = texture(tex0, uv + s1).rgb;
    vec3 rgbM = texture(tex0, uv + s2).rgb;
    vec3 rgbY = texture(tex0, uv + s3).rgb;
    vec3 rgbK = texture(tex0, uv).rgb;

    // RGB -> CMYK.  K is pulled out first (under-colour removal), which is what
    // gives print its deep blacks instead of a muddy three-ink overlap.
    float kC = 1.0 - max(max(rgbK.r, rgbK.g), rgbK.b);
    // inkP runs to 1.0, so the old expression reached 1.65 — every separation
    // clamped to full value across most of the picture, which is the second
    // half of the black-frame problem above.  Bounded to a range a press could
    // actually hold.
    float ink = clamp(0.55 + 0.55 * inkP, 0.40, 1.10);
    float c = (1.0 - rgbC.r - kC) / max(1.0 - kC, 1e-3);
    float m = (1.0 - rgbM.g - kC) / max(1.0 - kC, 1e-3);
    float y = (1.0 - rgbY.b - kC) / max(1.0 - kC, 1e-3);
    c = clamp(c * ink, 0.0, 1.0);
    m = clamp(m * ink, 0.0, 1.0);
    y = clamp(y * ink, 0.0, 1.0);
    float k = clamp(kC * ink, 0.0, 1.0);

    // The classic screen angles, drifting very slowly so the moire never
    // settles into one fixed pattern.
    float drift = 0.035 * sin(audioAdvance * 0.06);
    float dc = screenDot(p, radians(15.0) + drift, c, freq);
    float dm = screenDot(p, radians(75.0) - drift, m, freq);
    float dy = screenDot(p, radians(0.0),          y, freq);
    float dk = screenDot(p, radians(45.0) + drift * 0.5, k, freq);

    // Subtractive recombination: each ink SUBTRACTS its complement.
    //
    // Real process inks are not the ideal block dyes these coefficients assumed:
    // at 0.92 a single cyan dot took green and blue to zero and left pure
    // saturated red-free cyan behind, so every isolated dot in the picture read
    // as a press primary at HSV saturation 0.9+.  Real cyan, magenta and yellow
    // all pass a fraction of the light they nominally stop, and modelling that
    // is what makes a print look printed rather than like a colour-bar chart.
    // Black keeps most of its density — that is the ink that actually carries
    // the drawing.
    // Each ink absorbs ONE primary: cyan takes red, magenta takes green,
    // yellow takes blue.  The old vectors were the inks' complements --
    // vec3(0,1,1) for cyan -- so the cyan plate was subtracting green and blue
    // and printing RED, and every separation came out as the opposite of what
    // it separated.  That is why single dots read as screaming complementary
    // primaries and why two-ink overprints drove a whole channel to zero:
    // cyan + magenta annihilated blue instead of producing it.  With the
    // correct assignment an overprint is the colour it should be, and no
    // combination can exceed 1 - density in saturation.
    vec3 col = vec3(1.0);
    col -= vec3(1.0, 0.0, 0.0) * dc * 0.72;
    col -= vec3(0.0, 1.0, 0.0) * dm * 0.72;
    col -= vec3(0.0, 0.0, 1.0) * dy * 0.68;
    col -= vec3(1.0) * dk * 0.88;
    col = clamp(col, 0.0, 1.0);

    // Paper: not pure white, and slightly warm.  Uncoated stock rather than
    // bleached, so a mostly-unprinted area sits inside the catalogue's exposure
    // band instead of glaring next to the scenes around it.
    vec3 paper = vec3(0.72, 0.705, 0.665);
    col *= paper;

    // A whisper of harmonic tint in the paper stock itself.
    float hr = 0.05 * sin(audioChromaHue);
    col.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rb;

    col *= 0.92 + 0.16 * audioBeat + 0.10 * audioLevel;
    fragColor = vec4(col, interpolation);
}

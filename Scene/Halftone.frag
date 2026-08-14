#version 330 core
out vec4 fragColor;
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
    vec2 cell = fract(rp) - 0.5;
    float r = sqrt(clamp(value, 0.0, 1.0)) * 0.72;
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
    float ink = 0.55 + 1.1 * inkP;
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
    vec3 col = vec3(1.0);
    col -= vec3(0.0, 1.0, 1.0) * dc * 0.92;
    col -= vec3(1.0, 0.0, 1.0) * dm * 0.92;
    col -= vec3(1.0, 1.0, 0.0) * dy * 0.88;
    col -= vec3(1.0) * dk * 0.95;
    col = clamp(col, 0.0, 1.0);

    // Paper: not pure white, and slightly warm.
    vec3 paper = vec3(0.96, 0.945, 0.90);
    col *= paper;

    // A whisper of harmonic tint in the paper stock itself.
    float hr = 0.05 * sin(audioChromaHue);
    col.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rb;

    col *= 0.92 + 0.16 * audioBeat + 0.10 * audioLevel;
    fragColor = vec4(col, interpolation);
}

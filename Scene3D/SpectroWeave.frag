#version 330 core
out vec4 fragColor;
// SpectroWeave.frag — each strand carries its band's own colour, so the
// spectrum is legible as hue across the bundle while the loud bands are also
// the fat, bright ones.  Two independent cues for the same fact is what makes
// a data image readable rather than merely pretty.

in vec3  vWorld;
in vec3  vNormal;
in vec3  vView;
in float vEnergy;
in float vBand;
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

uniform float glowP;
uniform float thickP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.42, 0.66, -0.62));

    // Hue by band: bass deep red, treble through to violet.
    float hue = fract(0.00 + 0.72 * vBand + 0.06 * sin(audioChromaHue));
    vec3 tint = hue2rgb(hue);

    float diff = max(dot(n, L), 0.0);
    vec3 col = tint * (0.10 + 0.45 * diff);

    // A tube's core-and-halo: brightest where it faces the eye.
    float face = clamp(dot(n, V), 0.0, 1.0);
    float core = pow(face, 1.8);

    float e = clamp(vEnergy * 1.4, 0.0, 1.4);
    col += tint * e * (1.4 + 2.6 * glowP) * (0.35 + 0.9 * core);
    col += vec3(1.0) * pow(core, 7.0) * e * 0.65;

    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, H), 0.0), 60.0)
         * (0.4 + 1.8 * audioHigh);

    col += tint * 0.10 * audioAmbient;

    // Haze down the bundle so the far end recedes instead of piling up.
    float haze = clamp(vDist / 150.0, 0.0, 1.0);
    col = mix(col, vec3(0.02, 0.025, 0.05), pow(haze, 1.5) * 0.9);

    col *= 1.0 + 0.22 * audioBeat + 0.16 * audioSubBass + 0.15 * audioKick;
    col = col / (1.0 + col * 0.24);
    fragColor = vec4(col, interpolation);
}

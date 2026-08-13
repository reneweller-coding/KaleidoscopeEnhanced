#version 330 core
out vec4 fragColor;
// SpectrumRadial.frag
// -----------------------------------------------------------------------
// Radial spectrum analyzer with 32 frequency bands (mirrored into 64 wedges)
// radiating around a central disc that shows the source image.  Each wedge is a
// bar whose length tracks that band's live level, filled with the image and
// tinted across the rainbow by frequency; the whole ring pulses on the beat.
// Far more bands and far more movement than the old 6-band version.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioSpectrum[32];   // 32 log-spaced bands, 0..1 (self-normalised)
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioValence;
uniform float audioLevel;
uniform float audioPhase;
uniform float audioBarPhase;       // 0..1 per bar -> gentle rainbow sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   wedgesP;             // wedge count       (0 -> 64; 44..96)
uniform float petalLenP;           // petal max length  (0 -> 0.72; 0.5..0.95)
uniform float rotP;                // ring rotation speed multiplier (0 -> 1.0)

const float PI = 3.14159265358979;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

vec3 hsv2rgb(vec3 c)
{
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    float r = length(p);

    // Per-activation character (constant during the scene):
    float W       = float((wedgesP >= 8) ? wedgesP : 64);
    float halfW   = W * 0.5;
    float petalL  = (petalLenP <= 0.01) ? 0.72 : petalLenP;
    float rotV    = (rotP <= 0.01) ? 1.0 : rotP;

    float a = atan(p.y, p.x) + (audioPhase * 0.15 + time * 0.01) * rotV;
    float ang = a / (2.0 * PI) + 0.5;                // 0..1

    // W wedges -> mirrored onto the 32 bands (low freq sweeping around).
    float wf   = floor(fract(ang) * W);
    float m    = (wf < halfW) ? wf : (W - 1.0 - wf);
    float binf = clamp(m * 31.0 / (halfW - 1.0), 0.0, 31.0);
    int   bin  = int(binf);
    float amp  = audioSpectrum[bin];

    float barEdge = 0.20 + petalL * amp;
    float petal   = smoothstep(barEdge, barEdge - 0.03, r) * smoothstep(0.16, 0.19, r);
    float disc    = smoothstep(0.19, 0.13, r);

    // Image sampled polar & mirrored inside each wedge so the picture radiates.
    float wedge = abs(fract(ang * halfW) * 2.0 - 1.0);
    vec2  pimg  = vec2(wedge, clamp((r - 0.14) * 1.5, 0.0, 1.0));
    vec3  pic   = img(pimg);

    // Rainbow across the bands + a beat-phase shimmer + per-bar sweep.
    float hue   = fract(binf / 32.0 * 0.85 + 0.10 * audioValence + time * 0.02
                        + 0.10 * sin(audioBarPhase * 2.0 * PI));
    vec3  band  = hsv2rgb(vec3(hue, 0.75, 1.0));
    float pulse = 0.5 + 0.5 * sin(audioBeatPhase * 2.0 * PI);

    vec3 col = img(uv) * (0.12 + 0.55 * disc);                    // faint backdrop + disc
    col += pic * petal * band * (0.6 + 0.9 * amp + 0.4 * pulse + audioBeat);
    col += band * amp * exp(-5.0 * max(r - barEdge, 0.0)) * 0.35; // outer glow

    // ORBITING DOTS: each wedge carries a bright bead riding at its band's
    // amplitude radius - the ring becomes a swarm of dancing satellites.
    float wc   = (wf + 0.5) / W;                                  // wedge centre (0..1)
    float dAng = (fract(ang) - wc) * 2.0 * PI * r;                // arc offset
    float dotR = 0.24 + (petalL - 0.06) * amp;
    float bead = smoothstep(0.022, 0.006, length(vec2(dAng, r - dotR)));
    col += band * bead * (0.45 + 0.55 * amp + 0.5 * audioBeat);

    // Tempo-locked ripple rings expanding over the centre disc (continuous
    // beat phase -> they travel smoothly and land on the beat).
    float ripple = pow(0.5 + 0.5 * cos(2.0 * PI * (r * 3.5 - audioBeatPhase)), 10.0);
    col += band * ripple * disc * audioBeat * 0.30;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

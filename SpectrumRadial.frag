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

const float PI = 3.14159265358979;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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
    float a = atan(p.y, p.x) + audioPhase * 0.15;    // slow rotation
    float ang = a / (2.0 * PI) + 0.5;                // 0..1

    // 64 wedges -> mirror to 32 bands (low freq at the top, sweeping around).
    float wf   = floor(ang * 64.0);
    float binf = (mod(wf, 64.0) < 32.0) ? mod(wf, 64.0) : (63.0 - mod(wf, 64.0));
    int   bin  = int(clamp(binf, 0.0, 31.0));
    float amp  = audioSpectrum[bin];

    float barEdge = 0.20 + 0.72 * amp;
    float petal   = smoothstep(barEdge, barEdge - 0.03, r) * smoothstep(0.16, 0.19, r);
    float disc    = smoothstep(0.19, 0.13, r);

    // Image sampled polar & mirrored inside each wedge so the picture radiates.
    float wedge = abs(fract(ang * 32.0) * 2.0 - 1.0);
    vec2  pimg  = vec2(wedge, clamp((r - 0.14) * 1.5, 0.0, 1.0));
    vec3  pic   = img(pimg);

    // Rainbow across the bands + a beat-phase shimmer.
    float hue   = fract(binf / 32.0 * 0.85 + 0.10 * audioValence + time * 0.02);
    vec3  band  = hsv2rgb(vec3(hue, 0.75, 1.0));
    float pulse = 0.5 + 0.5 * sin(audioBeatPhase * 2.0 * PI);

    vec3 col = img(uv) * (0.12 + 0.55 * disc);                    // faint backdrop + disc
    col += pic * petal * band * (0.6 + 0.9 * amp + 0.4 * pulse + audioBeat);
    col += band * amp * exp(-5.0 * max(r - barEdge, 0.0)) * 0.35; // outer glow

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

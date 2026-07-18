// StereoSpectrum.frag
// -----------------------------------------------------------------------
// Stereo spectrum analyzer with 32 frequency bands per side.  Bass sits at the
// centre and treble runs out to the edges; the LEFT half's bar heights are
// scaled by the LEFT channel's energy and the RIGHT half by the RIGHT channel,
// so a wide stereo mix makes the two sides visibly differ.  The bars are filled
// with the (mirror-folded) source image and tinted across the rainbow; the
// central seam glows with the overall stereo width.  Many more bands and far
// more deflection than the old 3-per-side version.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioSpectrum[32];   // 32 log-spaced bands, 0..1 (self-normalised)
uniform vec3  audioStereoL;        // (low, mid, high) energies, LEFT channel
uniform vec3  audioStereoR;        // (low, mid, high) energies, RIGHT channel
uniform float audioStereo;         // overall stereo width 0..1
uniform float audioBeat;
uniform float audioPhase;
uniform float audioBarPhase;       // 0..1 per bar -> gentle rainbow sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float ledP;                // LED row count (0 -> continuous bars; 10..22)
uniform float spanP;               // rainbow span  (0 -> 0.85; 0.5 = tight, 1.0 = full)

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

    bool  leftHalf = uv.x < 0.5;
    float hx = leftHalf ? (0.5 - uv.x) * 2.0 : (uv.x - 0.5) * 2.0;   // 0 centre .. 1 edge

    // Band index: bass in the middle, treble at the edges.
    float binf = clamp(hx * 32.0, 0.0, 31.0);
    int   bin  = int(binf);
    float amp  = audioSpectrum[bin];

    // Per-channel gain so left/right differ with the stereo image.
    vec3  ch    = leftHalf ? audioStereoL : audioStereoR;
    float gain  = 0.55 + 0.9 * ((ch.x + ch.y + ch.z) / 3.0);
    float barH  = clamp(amp * gain * (1.05 + 0.3 * audioBeat), 0.0, 1.0);

    // MIRRORED bars: they grow from the horizontal centre line up AND down
    // (classic symmetric EQ - much more balanced than the old bottom-up bars).
    float yy    = abs(uv.y - 0.5) * 2.0;                            // 0 centre .. 1 edge
    float below = smoothstep(barH + 0.02, barH - 0.02, yy);         // 1 inside the bar

    // Thin gaps between the bars.
    float gap = smoothstep(0.10, 0.22, fract(binf)) * smoothstep(0.10, 0.22, 1.0 - fract(binf));
    gap = max(gap, 0.25);   // never fully black between bars

    // LED segmentation: quantised rows with slim dark separators (0 = the
    // continuous-bar look).
    float led = 1.0;
    if (ledP >= 1.0)
    {
        float segd = 0.5 - abs(fract(yy * ledP) - 0.5);   // 0 at row boundary
        led = 0.55 + 0.45 * smoothstep(0.08, 0.18, segd);
    }

    // Mirror-folded image fills the bars.
    vec3 pic = img(vec2(hx, uv.y));

    // Rainbow across the bands, sweeping gently once per bar (continuous).
    float span = (spanP <= 0.01) ? 0.85 : spanP;
    vec3 bc  = hsv2rgb(vec3(fract(binf / 32.0 * span + time * 0.02
                                  + 0.10 * sin(audioBarPhase * 6.28318)), 0.75, 1.0));

    vec3 col = pic * 0.18;                                          // dim always-on backdrop
    col += pic * (0.85 * below * gap * led);
    col = mix(col, col * bc * 1.7, 0.5 * below * gap);
    col += bc * below * gap * led * (0.15 + 0.35 * amp + 0.35 * audioBeat);

    // Bright tip line along both bar ends + a soft afterglow above the tip.
    float tip = smoothstep(0.018, 0.0, abs(yy - barH)) * gap;
    col += bc * tip * (1.0 + 0.3 * sin(uv.x * 60.0 + audioPhase * 2.0));
    col += bc * exp(-max(yy - barH, 0.0) * 9.0) * 0.22 * amp * gap;

    // Central seam glows with the stereo width.
    float seam = smoothstep(0.035, 0.0, abs(uv.x - 0.5));
    col += vec3(1.0) * seam * (0.10 + 0.90 * audioStereo);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

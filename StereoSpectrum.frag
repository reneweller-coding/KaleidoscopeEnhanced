// StereoSpectrum.frag
// -----------------------------------------------------------------------
// Stereo-separated spectrum made FROM the source image.  The picture is mirror-
// folded left/right; each half is carved into three vertical bars (low/mid/high
// for that audio channel) whose HEIGHT is the band level - so the image only
// lights up as high as the music pushes it, band-tinted, with the rest sinking
// into shadow.  The central seam glows with the overall stereo width.  The
// *image* is the star (was a dim 35% backdrop behind procedural bars).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform vec3  audioStereoL;   // (low, mid, high) energies, LEFT channel  0..1
uniform vec3  audioStereoR;   // (low, mid, high) energies, RIGHT channel 0..1
uniform float audioStereo;    // overall stereo width 0..1
uniform float audioBeat;      // decaying beat pulse 0..1
uniform float audioPhase;     // integrated rotation phase (slow motion)

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

vec3 bandColor(int i)
{
    if (i == 0) return vec3(1.00, 0.35, 0.20);   // low  - warm
    if (i == 1) return vec3(0.30, 1.00, 0.45);   // mid  - green
    return            vec3(0.35, 0.55, 1.00);    // high - blue
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    bool  leftHalf = uv.x < 0.5;
    float mx    = leftHalf ? uv.x : (1.0 - uv.x);   // 0 at edge .. 0.5 at seam
    vec3  bands = leftHalf ? audioStereoL : audioStereoR;

    // Mirror-fold the image so both halves share the same folded picture.
    vec3 pic = img(vec2(clamp(mx * 2.0, 0.0, 1.0), uv.y));

    // Three columns across each half -> low / mid / high.
    float hx  = mx * 2.0;                           // 0..1 across the half
    int   idx = clamp(int(floor(hx * 3.0)), 0, 2);
    float level = (idx == 0) ? bands.x : ((idx == 1) ? bands.y : bands.z);

    // Bar height = band level (lifted a little on the beat).
    float barH = clamp(level * (1.10 + 0.30 * audioBeat), 0.0, 1.0);
    float below = smoothstep(barH + 0.02, barH - 0.02, uv.y);   // 1 below the tip

    // Thin gaps between the columns.
    float colPos = fract(hx * 3.0);
    float gap    = smoothstep(0.05, 0.11, colPos) * smoothstep(0.05, 0.11, 1.0 - colPos);

    vec3 bc  = bandColor(idx);
    // The folded image is always dimly present; the lit bar brightens and tints
    // the picture up to the band's height, sinking to shadow above it.
    vec3 col = pic * 0.20;                                   // dim always-on backdrop
    col += pic * (0.85 * below * gap);                       // bar lights the image
    col = mix(col, col * bc * 1.8, 0.5 * below * gap);
    col += bc * below * gap * (0.15 + 0.30 * level + 0.4 * audioBeat);

    // Bright moving tip line along the top of each bar.
    float tip = smoothstep(0.020, 0.0, abs(uv.y - barH)) * gap;
    col += bc * tip * (1.0 + 0.3 * sin(uv.x * 40.0 + audioPhase * 2.0));

    // Central seam glows with the stereo width.
    float seam = smoothstep(0.04, 0.0, abs(uv.x - 0.5));
    col += vec3(1.0) * seam * (0.10 + 0.90 * audioStereo);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

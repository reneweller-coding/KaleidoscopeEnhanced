// StereoSpectrum.frag
// -----------------------------------------------------------------------
// Stereo-separated spectrum.  The LEFT half of the frame shows the left
// audio channel's low / mid / high band levels as three rising bars; the
// RIGHT half shows the right channel's (mirrored toward the centre).  The
// central seam glows with the overall stereo width, so a wide stereo mix
// lights up the middle.  The source image shows through as a dim backdrop.
// (Becomes vividly symmetric once the kaleidoscope pass folds it.)
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

vec3 bandColor(int i)
{
    if (i == 0) return vec3(1.00, 0.35, 0.20);   // low  – warm
    if (i == 1) return vec3(0.30, 1.00, 0.45);   // mid  – green
    return            vec3(0.35, 0.55, 1.00);    // high – blue
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 img = interpolation * texture2D(tex0, uv)
             + (1.0 - interpolation) * texture2D(tex1, uv);
    vec3 col = img.rgb * 0.35;                    // dim image backdrop

    // Pick the channel for this half and mirror the x axis toward the centre.
    bool  leftHalf = uv.x < 0.5;
    float hx    = leftHalf ? (uv.x * 2.0) : ((1.0 - uv.x) * 2.0);  // 0 at edge, 1 at seam
    vec3  bands = leftHalf ? audioStereoL : audioStereoR;

    // Three columns across each half -> low / mid / high.
    int   idx   = clamp(int(floor(hx * 3.0)), 0, 2);
    float level = (idx == 0) ? bands.x : ((idx == 1) ? bands.y : bands.z);

    // Bar rising from the bottom, lifted a little on the beat.
    float barH = clamp(level * (1.10 + 0.30 * audioBeat), 0.0, 1.0);
    float bar  = smoothstep(barH, barH - 0.04, uv.y);

    // Thin gaps between the columns.
    float colPos = fract(hx * 3.0);
    float gap    = smoothstep(0.05, 0.11, colPos) * smoothstep(0.05, 0.11, 1.0 - colPos);

    vec3 bc = bandColor(idx);
    col += bc * bar * gap * (0.80 + 0.60 * level + audioBeat);

    // Bright moving tip line along the top of each bar.
    float tip = smoothstep(0.020, 0.0, abs(uv.y - barH)) * gap;
    col += bc * tip * (1.0 + 0.3 * sin(uv.x * 40.0 + audioPhase * 2.0));

    // Central seam glows with the stereo width.
    float seam = smoothstep(0.04, 0.0, abs(uv.x - 0.5));
    col += vec3(1.0) * seam * (0.10 + 0.90 * audioStereo);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

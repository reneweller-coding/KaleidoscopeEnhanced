// CityBokeh.frag
// -----------------------------------------------------------------------
// CITY LIGHTS BOKEH: a night city seen through a defocused lens — layers of
// soft bokeh discs drifting past at different depths (parallax), coloured by
// the source image (every light picks its colour from the picture).  The
// focus BREATHES with the swell; kicks pulse a scattered subset of lights.
//   swell -> focus/size breathing (the whole field softens and swells)
//   kick  -> a hashed subset of lights pulses up (envelope-driven, smooth)
//   centroid -> warm/cool city temperature
//   stereo width -> unused (kept mono-symmetric)
// Jump-free: drift rides time + audioAdvance; pulses use slewed envelopes.
//
// Per-activation variety (0 = default):
//   densityP float light density multiplier   (0 -> 1.0; 0.7..1.6)
//   sizeP    float bokeh size multiplier      (0 -> 1.0; 0.7..1.5)
//   driftP   float drift speed multiplier     (0 -> 1.0; 0.5..1.5)
//   hueP     float global hue rotation        (0 -> none; 0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;

uniform float densityP;
uniform float sizeP;
uniform float driftP;
uniform float hueP;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

// One depth layer of bokeh discs; returns accumulated light.
vec3 bokehLayer(vec2 p, float scale, float drift, float size, float layerSeed)
{
    vec3 acc = vec3(0.0);
    vec2 q = p * scale + vec2(drift, 0.0);
    vec2 base = floor(q);
    // 3x3 neighbourhood so big discs cross cell borders seamlessly.
    for (int yy = -1; yy <= 1; yy++)
    for (int xx = -1; xx <= 1; xx++)
    {
        vec2  cell = base + vec2(float(xx), float(yy));
        float h    = hash21(cell + layerSeed);
        if (h < 0.45) continue;                       // sparse: not every cell lit
        vec2  pos  = cell + vec2(hash21(cell + 1.7 + layerSeed),
                                 hash21(cell + 3.9 + layerSeed));
        float r    = size * (0.22 + 0.30 * hash21(cell + 5.3 + layerSeed));
        // Kick pulse: a hashed ~third of the lights breathes up with the
        // (slew-limited) kick envelope — city windows flickering to the beat.
        float kickSel = step(0.66, hash21(cell + 9.1 + layerSeed));
        r *= 1.0 + 0.35 * audioKick * kickSel;
        float d    = length(q - pos);
        // Soft-edged disc with a brighter rim (real bokeh has edge bias).
        float disc = smoothstep(r, r * 0.82, d);
        float rim  = smoothstep(r, r * 0.90, d) - smoothstep(r * 0.90, r * 0.70, d);
        // Colour from the IMAGE at the light's (stable) position.
        vec3 lc = img(fract(pos * 0.13 + 0.31));
        lc = lc * (0.35 + 0.65 * hash21(cell + 7.7)) + vec3(0.25, 0.18, 0.08);
        acc += lc * (disc * 0.85 + rim * 0.5)
             * (0.55 + 0.45 * audioKick * kickSel);
    }
    return acc;
}

void main()
{
    float dens  = (densityP > 0.0) ? densityP : 1.0;
    float bsize = (sizeP    > 0.0) ? sizeP    : 1.0;
    float dspd  = (driftP   > 0.0) ? driftP   : 1.0;

    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Focus breathing: the swell softens & swells the whole field.
    float breathe = 1.0 + 0.18 * audioSwell;

    // Background: the image heavily defocused (mip-ish via tiny offsets),
    // darkened to a night ambience with a horizon gradient.
    vec3 bg = vec3(0.0);
    for (int i = 0; i < 4; i++)
    {
        vec2 o = vec2(hash21(vec2(float(i), 1.0)) - 0.5,
                      hash21(vec2(float(i), 2.0)) - 0.5) * 0.05;
        bg += img(p * 0.4 + 0.5 + o).rgb;
    }
    bg *= 0.25;
    bg = bg * vec3(0.10, 0.10, 0.16) + vec3(0.010, 0.012, 0.03);
    bg *= 1.0 - 0.35 * (p.y + 0.5);

    // Three parallax layers: far (small, slow) -> near (large, fast).
    float t = time * 0.03 * dspd + audioAdvance * 0.10;
    vec3 col = bg;
    col += bokehLayer(p * breathe, 7.0 * dens,  t * 0.6, 0.9 * bsize, 11.0) * 0.35;
    col += bokehLayer(p * breathe, 4.5 * dens,  t * 1.0, 1.1 * bsize, 23.0) * 0.55;
    col += bokehLayer(p * breathe, 2.6 * dens,  t * 1.7, 1.4 * bsize, 47.0) * 0.80;

    col = hueRot(col, hueP);

    // City temperature: bright material -> warm sodium glow, dark -> cool blue.
    col *= mix(vec3(0.72, 0.82, 1.20), vec3(1.25, 1.02, 0.70), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.55 * audioValence);
    col *= 0.85 + 0.4 * audioLevel;

    // Vignette.
    col *= 1.0 - 0.35 * dot(p, p);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

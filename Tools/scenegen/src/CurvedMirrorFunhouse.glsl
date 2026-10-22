//@doc
 * @brief CURVED MIRROR FUNHOUSE: a wall of tall curved mirror strips, as in a funhouse, side by side, each bulging
 * or hollow by its own amount; the photo they reflect is pulled into loops and waves, and the strips sway so the
 * distortions roll across the wall.  Optics: a strip curved with radius R magnifies by about 1 / (1 - 2 x / R)
 * across it and shifts the reflected point along its slope; neighbouring strips disagree at their seams, where the
 * picture breaks.  The light falls off at each strip's edge, where the mirror turns away.  One colour family from
 * the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the strips' curvature follows the melody, smoothed (high notes bulge, low notes hollow)
 *   audioAdvance    -> the reflected picture slides along (integrated)
 *   audioSwell      -> the strips sway further
 *
 * Knobs: stripP (how many strips), bendP (the curvature's base), hueP.  Distinct from CurvedMirrorKaleido, which is
 * a kaleidoscope.
//@params stripP bendP
//@audio audioMelody[96] audioMelodyHead audioSwell
//@body
/**  The melody, smoothed (triangle-weighted mean of the newest sounding samples).
 *
 * @return
 *   The pitch, 0..1 (0.5 when none sounds).
 **/
float smoothNoteF()
{
    int hi = int(audioMelodyHead * 96.0);
    float s = 0.0, w = 0.0;
    for (int j = 0; j < 24; ++j) {
        float m = audioMelody[(hi + 95 - j) % 96];
        float wj = (24.0 - float(j)) * step(0.001, m);
        s += wj * m;
        w += wj;
    }
    return w > 0.0 ? s / w : 0.5;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float strips = floor(6.0 + 8.0 * clamp(stripP, 0.0, 1.0));
    float note = smoothNoteF();
    float slide = 0.03 * sceneTime + 0.15 * audioAdvance;
    float sway = 0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float u = (p.x + 0.9) * strips / 1.8;
    float k = floor(u);
    float x = fract(u) - 0.5;                                    // across the strip, -0.5..0.5
    float hk = fract(sin(k * 12.9898) * 43758.5453);
    // the strip's curvature: its own base, the melody, a slow sway rolling along the wall
    float bend = (0.6 * clamp(bendP, 0.0, 1.0) + 0.6) * ((hk - 0.5) * 1.4 + 1.6 * (note - 0.5))
                 + sway * 0.5 * sin(0.4 * sceneTime + 0.9 * k);
    float mag = 1.0 / max(1.0 - bend * (0.6 - 4.0 * x * x), 0.25);
    // vertical waves: the strip is also bent along its height a little
    float yw = p.y * (1.0 + 0.6 * bend * (0.5 - 2.0 * x * x)) + 0.08 * bend * sin(4.0 * p.y + k);
    vec2 uv = vec2((k + 0.5 + x * mag) / strips * 1.8 - 0.9, yw * (1.0 + 0.15 * bend * x));
    uv = uv * 0.8 + vec2(slide, 0.0) + 0.5;
    vec3 photo = imgLod(uv, 0.8 + 0.6 * abs(bend));
    vec3 col = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo));
    // the light falls away at the strip's edges; a bright line on each bulge's crest
    col *= 0.45 + 0.55 * cos(3.14159265 * x * 0.9);
    col += famLight(fh, 0.5, 0.8) * exp(-pow(x / 0.06, 2.0)) * max(bend, 0.0) * 0.12;
    col *= smoothstep(0.5, 0.47, abs(x));                        // the seams
    finish(col);
}

//@doc
 * @brief SCARRED MEMBRANE DRUM: an irregularly shaped drum -- its rim a lopsided closed curve -- whose membrane is
 * the photo.  Every melody note strikes a different mode: standing waves with their own wave vectors, held at zero
 * on the rim, so the nodal lines cut the photo into a field of cells that bulge up and down.  Between notes the old
 * mode rings out while the new one swells in.  Mirrored copies of the drum fill the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody     -> the melody of the last second, smoothed, picks the mode (the wave vectors glide with the tune)
 *   audioSwell      -> how far the membrane swings
 *   audioBeatPhase  -> the swing's phase (continuous)
 *   audioKick       -> the nodal lines flash (light)
 *
 * Knobs: modeP (the base mode), rimP (how lopsided the rim is), photoP (photo share), hueP.
//@params modeP rimP photoP
//@audio audioSwell audioKick audioBeatPhase audioMelody[96] audioMelodyHead
//@body
/**  The drum's rim: a lopsided closed curve's signed distance (negative inside).
 *
 * @param x  The point in the drum's frame. (in)
 *
 * @return
 *   The signed distance.
 **/
float rim(vec2 x)
{
    float a = atan(x.y, x.x);
    float lop = 0.1 + 0.25 * clamp(rimP, 0.0, 1.0);
    float r = 0.42 * (1.0 + lop * sin(3.0 * a + 0.7) + 0.5 * lop * cos(5.0 * a - 1.1));
    return length(x * vec2(0.85, 1.0)) - r;
}
/**  The melody of the last second or so, smoothed: a triangular window over the newest 16 samples of the melody
 * ring (80 ms apart), the samples without a pitch left out.
 *
 * @return
 *   The smoothed pitch, 0..1 (0.5 when nothing sounds).
 **/
float smoothNote()
{
    int hi = int(audioMelodyHead * 96.0);
    float s = 0.0, w = 0.0;
    for (int j = 0; j < 16; ++j) {
        float m = audioMelody[(hi + 95 - j) % 96];
        float wj = (16.0 - float(j)) * step(0.001, m);
        s += wj * m;
        w += wj;
    }
    return w > 0.0 ? s / w : 0.5;
}
/**  A mode: three standing plane waves for a note, held to zero on the rim (the rim's distance as an envelope).
 *
 * @param x     The point. (in)
 * @param note  The note, 0..1. (in)
 *
 * @return
 *   The mode's shape, about -1..1 inside.
 **/
float mode(vec2 x, float note)
{
    float s = 0.0;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        float a = 6.2831853 * fract(note * 3.7 + fi * 0.37 + clamp(modeP, 0.0, 1.0));
        float k = 14.0 + 24.0 * fract(note * 5.3 + fi * 0.21);
        s += cos(k * dot(x, vec2(cos(a), sin(a))) + fi);
    }
    return s / 3.0;
}

void main()
{
    vec2 p = screenP();
    // mirrored copies of the drum across the frame
    vec2 cell = vec2(1.0, 1.0);
    vec2 x = cell * 0.5 - abs(mod(p + cell * 0.5, 2.0 * cell) - cell);
    float d = rim(x);
    float inside = smoothstep(0.01, -0.01, d);
    float env = clamp(-d * 6.0, 0.0, 1.0);                      // the membrane is held at the rim
    float note = clamp(smoothNote(), 0.0, 1.0);
    // between two neighbouring semitones' modes, by where the smoothed melody stands between them
    float m = mix(mode(x, floor(note * 12.0) / 12.0), mode(x, (floor(note * 12.0) + 1.0) / 12.0),
                  smoothstep(0.0, 1.0, fract(note * 12.0)));
    float swing = m * env * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0)) * sin(6.2831853 * audioBeatPhase);
    vec2 g = vec2(dFdx(swing), dFdy(swing)) * resolution.y;
    vec2 uv = p * 0.7 + 0.5 + g * 0.004;
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.3 + 0.2 * m + 0.03 * audioPhase);
    vec3 nrm = normalize(vec3(-g * 0.05, 1.0));
    float light = 0.6 + 0.4 * dot(nrm, normalize(vec3(-0.4, 0.5, 0.8)));
    vec3 col = mix(tone * 1.2, photo * 1.2, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * light * (0.85 + 0.3 * swing);
    float node = 1.0 - smoothstep(0.0, 0.06, abs(m));
    col += mix(tone, vec3(1.0), 0.5) * node * env * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    col = mix(imgLod(uv, 2.0) * 0.12, col, inside);
    col += mix(tone, vec3(1.0), 0.5) * exp(-d * d * 8000.0) * 0.4;   // the rim
    finish(col);
}

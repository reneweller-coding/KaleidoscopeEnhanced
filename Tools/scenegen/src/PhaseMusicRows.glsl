//@doc
 * @brief PHASE MUSIC ROWS: rows of the photo that run at slightly different speeds, as in Steve Reich's phase music: they drift apart, turn the picture into a sheared weave of shifted copies, and at the end of the phrase stand in step again, whole.
 * Every row runs a whole number of picture-periods in a phrase (two forward, two back, one, none), so the phrase closes exactly; between the beginning and the end the picture is a moving comb of the photo's own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the rows' position (a whole number of periods a phrase, zero at the phrase's start)
 *   audioSwell      -> the rows' separation (the dark joints between them)
 *
 * Knobs: rowsP (how many rows), hueP.
//@params rowsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 14.0 + 22.0 * clamp(rowsP, 0.0, 1.0);
    float yy = (0.5 - p.y) * N;
    float k = floor(yy);
    float f = fract(yy);
    float n = mod(k * 3.0, 5.0) - 2.0;
    float ph = rhyPhrase();
    vec2 q = vec2(p.x - n * 2.5 * ph, p.y);
    vec3 c = imgLod(q * 0.8 + 0.5, 0.6);
    float joint = 1.0 - (0.15 + 0.35 * clamp(audioSwell, 0.0, 1.0)) * (smoothstep(0.1, 0.0, f) + smoothstep(0.9, 1.0, f));
    finish(c * joint * 1.1);
}

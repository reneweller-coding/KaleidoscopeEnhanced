//@doc
 * @brief PENDULUM WAVE PHOTO: the photo in upright strips, each swinging up and down with a period of its own -- more swings in the phrase than the strip before it -- so waves run across the strips and fall apart,
 * and at the end of the phrase all the strips stand even again, whole.  The swing is a slow vertical slide of the photo within each strip, with a soft shade to show the direction.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the base period: the strips swing from one to sixteen times in a phrase
 *   audioSwell      -> the amplitude of the swing
 *
 * Knobs: stripP (the number of strips), hueP.
//@params stripP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 12.0 + 12.0 * clamp(stripP, 0.0, 1.0);
    float xs = (p.x / asp + 0.5) * N;
    float k = floor(xs);
    float f = fract(xs);
    float ph = rhyPhrase();
    float amp = (0.16 - 0.08 * k / N) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float cyc = 6.2831853 * (1.0 + floor(k * 16.0 / N)) * ph;
    vec2 uv = vec2(p.x * 0.8 + 0.5, (p.y + amp * sin(cyc)) * 0.8 + 0.5);
    vec3 c = imgLod(uv, 0.6);
    float joint = 1.0 - 0.4 * (smoothstep(0.08, 0.0, f) + smoothstep(0.92, 1.0, f));
    finish(c * joint * (1.0 + 0.1 * cos(cyc)) * 1.08);
}

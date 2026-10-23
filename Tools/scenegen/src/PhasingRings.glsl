//@doc
 * @brief PHASING RINGS: concentric rings of the photo that turn a little differently fast -- one, two or three turns in a phrase, forward and back, alternating -- and so shear the picture into a pattern of rotated rings;
 * after the eight bars of the phrase they have all come round to the same place and the photo stands whole, a soft glow marking the moment.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the rings' angles (whole turns in a phrase, zero at the start)
 *   audioSwell      -> the glow when the picture comes whole
 *
 * Knobs: ringP (the number of rings), hueP.
//@params ringP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float N = 12.0 + 12.0 * clamp(ringP, 0.0, 1.0);
    float k = floor(r * N);
    float f = fract(r * N);
    float m = (mod(k, 2.0) < 0.5 ? 1.0 : -1.0) * (1.0 + mod(k, 3.0));
    float ph = rhyPhrase();
    vec2 q = rot2(6.2831853 * m * ph) * p;
    vec3 c = imgLod(q * 0.8 + 0.5, 0.6);
    float joint = 1.0 - 0.45 * (smoothstep(0.12, 0.0, f) + smoothstep(0.88, 1.0, f));
    float whole = rhyBump(ph, 0.0, 1.0, 0.06) * (0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    finish(c * joint * (1.1 + whole));
}

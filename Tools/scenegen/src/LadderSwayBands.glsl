//@doc
 * @brief LADDER SWAY BANDS: horizontal bands of the photo that swing sideways like the rungs of a rope ladder, each a little behind the one above, so that a wave runs from the top of the picture to the bottom, with thin dark joints
 * between the rungs; the swing runs twice through every bar and its width follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the swing runs twice a bar, each rung a little later than the one above
 *   audioSwell      -> the amplitude of the swing
 *
 * Knobs: rungP (the number of rungs), hueP.
//@params rungP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 10.0 + 18.0 * clamp(rungP, 0.0, 1.0);
    float yy = (0.5 - p.y) * N;
    float k = floor(yy);
    float f = fract(yy);
    float amp = 0.06 + 0.18 * clamp(audioSwell, 0.0, 1.0);
    float sw = amp * sin(6.2831853 * (2.0 * rhyBar() - k / N * 1.2));
    vec3 c = imgLod(vec2((p.x + sw) * 0.8 + 0.5, p.y * 0.8 + 0.5), 0.7);
    float joint = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f);
    finish(c * (0.5 + 0.5 * joint) * 1.12);
}

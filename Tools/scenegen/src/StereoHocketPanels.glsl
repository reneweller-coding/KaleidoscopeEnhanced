//@doc
 * @brief STEREO HOCKET PANELS: a hocket: the notes pass between the left and the right and the picture follows: the left and the right half show the photo under different mappings, and the line between them swings
 * to and fro in time with the bar, while each side brightens on its own beats (left on one and three, right on two and four).  The stereo width decides how far the halves part, a blurred glimpse of the photo showing between them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the dividing line swings, the sides take turns on the beats
 *   audioStereo     -> how far the halves part
 *
 * Knobs: swingP (how far the line swings), hueP.
//@params swingP
//@audio audioStereo
//@body
void main()
{
    vec2 p = screenP();
    float bar = rhyBar();
    float x0 = (0.08 + 0.2 * clamp(swingP, 0.0, 1.0)) * sin(6.2831853 * bar);
    float gap = 0.015 + 0.3 * clamp(audioStereo, 0.0, 1.0);
    float sh = 0.06 * sin(6.2831853 * 2.0 * bar);
    vec3 cl = imgLod(vec2(p.x + sh, p.y) * 0.8 + 0.5, 0.6) * (0.75 + 0.3 * cos(6.2831853 * 2.0 * bar));
    vec3 cr = imgLod((rot2(0.18) * vec2(-p.x + sh, p.y)) * 1.1 * 0.8 + 0.5, 0.6) * (0.75 - 0.3 * cos(6.2831853 * 2.0 * bar));
    vec3 mid = imgLod(p * 0.8 + 0.5, 5.0) * 0.5;
    float wl = smoothstep(x0 - 0.5 * gap + 0.01, x0 - 0.5 * gap - 0.01, p.x);
    float wr = smoothstep(x0 + 0.5 * gap - 0.01, x0 + 0.5 * gap + 0.01, p.x);
    vec3 col = mid * (1.0 - wl - wr) + cl * wl + cr * wr;
    finish(col * 1.1);
}

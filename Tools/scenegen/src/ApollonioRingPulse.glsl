//@doc
 * @brief APOLLONIO RING PULSE: Apollonio's circles: rings with a gap, in rows, each row turning the opposite way to the next, the gaps passing one another like the hands of a lot of clocks; the rings are cut from the photo
 * (its colour and its detail) on a dark ground.  The turn follows the phase of the music, the size of the gaps its swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the rings turn (integrated; the rows alternate)
 *   audioSwell      -> the size of the gaps
 *
 * Knobs: sizeP (the size of the rings), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.3 - 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / s + 0.5);
    vec2 d = p - cell * s;
    float r = length(d), a = atan(d.y, d.x);
    float dirr = mod(cell.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float rot = dirr * (0.5 * audioPhase + 0.06 * sceneTime) + 0.7 * hash21(cell);
    float gap = 0.45 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float da = abs(mod(a - rot + 3.1415927, 6.2831853) - 3.1415927);
    float ring = smoothstep(0.012, 0.0, abs(r - 0.34 * s) - 0.12 * s) * smoothstep(gap - 0.06, gap + 0.06, da);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    vec3 bg = imgLod(p * 0.8 + 0.5, 4.0) * 0.12;
    finish(mix(bg, c * 1.2, ring));
}

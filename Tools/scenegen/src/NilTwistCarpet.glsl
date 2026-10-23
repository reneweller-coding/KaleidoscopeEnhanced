//@doc
 * @brief NIL TWIST CARPET: the Heisenberg geometry (Nil): moving across the plane twists the photo by the area swept over, so the carpet turns the farther it is dragged: the angle of the photo at a place is the cross of the
 * drag with the place, a twist that grows linearly outward and shears the picture into whirls.  The drag wanders in a Lissajous with the drive of the music, the strength of the twist follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drag wanders (integrated)
 *   audioSwell      -> the strength of the twist
 *
 * Knobs: dragP (how far the carpet is dragged), hueP.
//@params dragP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.03 * audioAdvance + 0.015 * sceneTime;
    float L = 0.5 + 1.5 * clamp(dragP, 0.0, 1.0);
    vec2 a = L * vec2(sin(1.0 * t + 0.4), sin(1.31 * t + 2.0));
    float kap = 1.4 + 2.4 * clamp(audioSwell, 0.0, 1.0);
    float ang = kap * (a.x * p.y - a.y * p.x);
    vec2 q = rot2(ang) * (p - 0.15 * a);
    float shade = 0.9 + 0.2 * cos(ang * 2.0);
    finish(imgLod(q * 0.8 + 0.5, 0.7 + 0.5 * abs(ang)) * shade * 1.05);
}

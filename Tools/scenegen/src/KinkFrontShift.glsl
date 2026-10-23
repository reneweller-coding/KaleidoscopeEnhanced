//@doc
 * @brief KINK FRONT SHIFT: a sine-Gordon kink: a front that shifts the photo by half the picture's width and yet stays continuous: it travels across the picture and behind it the photo lies shifted, until the next front -- an antikink --
 * brings it back; the pairs of fronts run on with the drive of the music, the photo sliding smoothly through the fronts as through a thin transition layer.  The fronts' width follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the fronts' width
 *   audioAdvance    -> the fronts run across (integrated)
 *
 * Knobs: bandP (the distance between fronts), hueP.
//@params bandP
//@audio audioSwell
//@body
/**  The kink profile: 0 far behind the front, 1 far ahead, passing through 0.5 at the front.
 *
 * @param x  The distance to the front, in units of its width. (in)
 *
 * @return
 *   The profile, 0..1.
 **/
float kinkS(float x) { return atan(exp(clamp(x, -12.0, 12.0))) * 0.63662; }
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float P = (1.0 + 1.6 * clamp(bandP, 0.0, 1.0)) * 1.0;
    float w = 0.02 + 0.07 * clamp(audioSwell, 0.0, 1.0);
    float m = mod(p.x - 0.03 * audioAdvance - 0.02 * sceneTime + 0.25 * P, P) - 0.25 * P;
    float u = kinkS(m / w) - kinkS((m - 0.5 * P) / w);
    float sh = u * 0.5 * asp;
    finish(imgLod(vec2((p.x - sh) * 0.8 + 0.5, p.y * 0.8 + 0.5), 0.7) * 1.08);
}

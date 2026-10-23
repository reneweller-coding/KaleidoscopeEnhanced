//@doc
 * @brief SPOKE WHEEL ALIASING: two counter-rotating spoked wheels in front of the photo, like the carriage-wheel effect: the photo is
 * peeled out in rotating sectors where the spokes of both wheels part, and the sectors seem to run backward whenever the
 * wheels' turn is near a multiple of the spoke spacing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the wheels' turn (integrated, never a jump)
 *   audioSwell      -> the spokes' width (the wheels open as the music swells)
 *
 * Knobs: spokesP (the spoke count, rolled once), rimP (the rim rings), hueP.
//@params spokesP rimP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.25 + 2.0 * audioAdvance;
    float n = 8.0 + 2.0 * floor(6.0 * clamp(spokesP, 0.0, 1.0));
    float th = atan(p.y, p.x);
    float r = length(p);
    float w = 0.22 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    float s1 = 0.5 + 0.5 * cos(n * (th - 0.35 * t));
    float s2 = 0.5 + 0.5 * cos(n * (th + 0.35 * t * 1.07) + 3.0 * r);
    float gap = smoothstep(1.0 - w, 1.0 - w + 0.12, s1) * smoothstep(1.0 - w, 1.0 - w + 0.12, s2);
    float rim = smoothstep(0.02, 0.0, abs(fract((r + 0.05 * t) * (2.0 + 6.0 * clamp(rimP, 0.0, 1.0))) - 0.5) - 0.42);
    vec3 col = imgLod(uv, 0.5) * (0.12 + 1.0 * clamp(gap + 0.4 * rim, 0.0, 1.0));
    finish(col);
}

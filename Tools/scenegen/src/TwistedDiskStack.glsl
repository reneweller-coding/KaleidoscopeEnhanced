//@doc
 * @brief TWISTED DISK STACK: concentric rings, each turned against the next, with a soft twist between: the photo becomes a spiral staircase, every step a ring a little further round than the one inside it, the transition from step to
 * step a smooth ramp.  The twist per step grows with the swell, the whole stair turns with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the twist from ring to ring
 *   audioAdvance    -> the stair turns (integrated)
 *
 * Knobs: ringP (the number of rings), hueP.
//@params ringP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float N = 4.0 + 8.0 * clamp(ringP, 0.0, 1.0);
    float s = r * N;
    float k = floor(s);
    float f = fract(s);
    float stairs = k + smoothstep(0.55, 1.0, f);
    float delta = 0.2 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float ang = delta * stairs + 0.03 * audioAdvance + 0.01 * sceneTime;
    vec3 c = imgLod(rot2(ang) * p * 0.8 + 0.5, 0.7);
    float lit = 0.8 + 0.2 * smoothstep(0.0, 1.0, f);
    finish(c * lit * 1.08);
}

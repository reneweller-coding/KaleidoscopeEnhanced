//@doc
 * @brief MULTIPATH FADING SPECKLE FLOW: multipath fading: many reflections overlap and form a field of nodes and antinodes that shifts with the motion; the picture shows a flowing field of speckles in which the photo stands bright at constructive overlap.  Twelve paths, each with a direction, a delay and a Doppler shift,
 * add up; where the sum is large the photo shines, elsewhere the field is dark.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of paths (smoothed)
 *   audioAdvance -> the field flows (the Doppler runs) (integrated)
 *
 * Knobs: sizeP (the grain of the field), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float n = 5.0 + 7.0 * clamp(audioSpread, 0.0, 1.0);
    float kmag = 28.0 + 40.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = 0.05 * audioAdvance + 0.08 * sceneTime;
    float re = 0.0;
    float im = 0.0;
    for (int k = 0; k < 12; ++k) {
        float fk = float(k);
        float on = clamp(n - fk, 0.0, 1.0);
        vec2 h = hash22(vec2(fk, 21.0));
        float a = 6.2831853 * h.x;
        float km = kmag * (0.9 + 0.2 * h.y);
        float dop = (h.y - 0.5) * 6.2831853 * 1.6;
        float ph = km * (p.x * cos(a) + p.y * sin(a)) + dop * t + 6.2831853 * hash21(vec2(fk, 7.0));
        re += on * cos(ph);
        im += on * sin(ph);
    }
    float I = (re * re + im * im) / max(n, 1.0);
    float br = smoothstep(0.8, 3.0, I);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 col = c * (0.04 + 1.5 * br) + vec3(0.2, 0.35, 0.6) * smoothstep(0.0, 1.5, I) * 0.12;
    finish(col);
}

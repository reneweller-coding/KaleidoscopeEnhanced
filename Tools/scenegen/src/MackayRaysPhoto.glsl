//@doc
 * @brief MACKAY RAYS PHOTO: Mackay's rays: two sets of thin rays out of two centres that drift across each other, and where the rays cross the picture flickers with moire flowers that are not drawn.  The rays are lines in the
 * photo's dark colour on a bright ground cut from the photo.  The number of rays follows the key (crossing over from a count to the next), the two centres drift apart and together with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of rays (crossing over)
 *   audioAdvance    -> the centres drift (integrated)
 *
 * Knobs: lineP (how thick the rays are), hueP.
//@params lineP
//@audio audioHarmAdvance
//@body
/**  Two sets of rays with a given count.
 *
 * @param p   The pixel. (in)
 * @param n   The rays in each set. (in)
 *
 * @return
 *   The darkening, 0..1.
 **/
float mackayLines(vec2 p, float n)
{
    float t = 0.02 * sceneTime + 0.06 * audioAdvance;
    vec2 c1 = 0.12 * vec2(cos(t), sin(0.7 * t)) + vec2(-0.1, 0.0);
    vec2 c2 = 0.12 * vec2(cos(0.8 * t + 2.0), sin(t + 1.0)) + vec2(0.1, 0.0);
    float a1 = atan(p.y - c1.y, p.x - c1.x), a2 = atan(p.y - c2.y, p.x - c2.x);
    float th = 0.1 + 0.25 * clamp(lineP, 0.0, 1.0);
    float l1 = smoothstep(1.0 - th - 0.12, 1.0 - th, abs(fract(n * a1 / 6.2831853) - 0.5) * 2.0);
    float l2 = smoothstep(1.0 - th - 0.12, 1.0 - th, abs(fract(n * a2 / 6.2831853 + 0.5) - 0.5) * 2.0);
    return clamp(l1 + l2 - l1 * l2, 0.0, 1.0);
}
void main()
{
    vec2 p = screenP();
    float n = 50.0 + 30.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float n0 = floor(n);
    float l = mix(mackayLines(p, n0), mackayLines(p, n0 + 1.0), smoothstep(0.0, 1.0, fract(n)));
    vec3 c = imgLod(p * 0.8 + 0.5, 1.5);
    vec3 bg = mix(c, vec3(1.0), 0.55);
    finish(mix(bg, c * 0.12, l));
}

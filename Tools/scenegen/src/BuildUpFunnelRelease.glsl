//@doc
 * @brief BUILD UP FUNNEL RELEASE: as the tension of a build-up rises the photo is drawn into a funnel that winds tighter and tighter, the centre dark and deep; at the drop the funnel opens softly
 * into a flower whose petals spread outward and fade back to the plain photo.  Only the slow tension curve and the drop's own decay drive it, no raw signal.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBuildUp    -> the funnel: how deep, how tightly wound
 *   audioDrop       -> the release: the flower of petals that opens and fades
 *   audioAdvance    -> the winding turns (integrated)
 *
 * Knobs: petalP (the number of petals of the release), hueP.
//@params petalP
//@audio audioBuildUp audioDrop
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 0.0005, a = atan(p.y, p.x);
    float T = clamp(audioBuildUp, 0.0, 1.0), D = clamp(audioDrop, 0.0, 1.0);
    float k = floor(4.0 + 4.0 * clamp(petalP, 0.0, 1.0));
    float suck = 1.0 + 2.4 * T * exp(-2.2 * r);
    float swirl = 3.0 * T * exp(-3.0 * r) + 0.4 * T + 0.05 * audioAdvance * T;
    float bloom = 1.0 - 0.45 * D * (0.5 + 0.5 * cos(k * a + 0.5 * audioAdvance)) * exp(-1.6 * r);
    vec2 q = rot2(swirl) * p * suck * bloom;
    vec3 c = imgLod(q * 0.8 + 0.5, 0.6 + 1.2 * T * exp(-4.0 * r));
    float depth = 1.0 - 0.7 * T * exp(-14.0 * r * r);
    float flash = 1.0 + 0.35 * D * exp(-2.0 * r);
    finish(c * depth * flash * 1.08);
}

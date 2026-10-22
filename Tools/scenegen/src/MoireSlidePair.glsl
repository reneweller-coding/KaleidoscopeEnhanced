//@doc
 * @brief MOIRE SLIDE PAIR: three patterned transparencies on an overhead projector -- concentric circles, rays and
 * waves, each behind its own colour filter -- one of them sliding slowly over the others, so huge coloured moire
 * patterns run across the wall.  Where the patterns' dark lines cross, light is blocked; where they part, the filters'
 * colours add; the moire is the slow beat between the patterns' pitches.  Two filter colours from the photo's family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the sliding transparency wanders (integrated)
 *   audioHarmAdvance -> the patterns' pitch glides with the chord changes: the moire's fringes widen and narrow
 *   audioSwell       -> the lamp's brightness
 *
 * Knobs: lineP (the lines' fineness), slideP (how far the slide wanders), hueP.
//@params lineP slideP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float fine = (55.0 + 45.0 * clamp(lineP, 0.0, 1.0)) * (1.0 + 0.06 * sin(0.7 * h));
    float wander = 0.1 + 0.25 * clamp(slideP, 0.0, 1.0);
    float t = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec2 slide = wander * vec2(sin(t), 0.6 * cos(0.7 * t));
    // the three transparencies: circles (fixed), rays (turning slowly), waves (sliding)
    float circles = 0.5 + 0.5 * cos(fine * length(p - vec2(0.05, 0.0)));
    vec2 pr = p - vec2(-0.1, 0.05);
    float nRays = floor(28.0 + 22.0 * clamp(lineP, 0.0, 1.0));   // a whole number of rays (no seam), fixed per roll
    float rays = 0.5 + 0.5 * cos(nRays * atan(pr.y, pr.x) + 0.2 * t);
    vec2 pw = p - slide;
    float waves = 0.5 + 0.5 * cos(fine * 1.02 * length(pw) + 1.5 * sin(4.0 * pw.x));
    // each pattern blocks with its lines, passes its filter colour elsewhere
    vec3 fA = famCol(fh, 0.25), fB = famCol(fh, 0.75);
    float pass = smoothstep(0.3, 0.7, circles) * smoothstep(0.3, 0.7, waves);
    vec3 col = (fA * smoothstep(0.35, 0.65, rays) + fB * (1.0 - smoothstep(0.35, 0.65, rays))) * pass;
    col *= (0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * 1.2;
    col *= smoothstep(1.3, 0.5, length(p));
    finish(famExpose(col, 2.18, 1.00, 0.00, fh));
}

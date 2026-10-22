//@doc
 * @brief SLICED KALEIDO REEL: a kaleidoscope cut into horizontal strips that run against each other like film reels,
 * one strip leftward, the next rightward; each strip carries the rosette with its own symmetry, and as the strips
 * run the rosette is broken and re-joined across the cuts; now and then a strip swaps its symmetry, gliding.  The
 * strip's run shifts the point along it before the fold, so each strip shows a different slice of the turning
 * rosette.  The photo's own colours, calmed toward one colour family; the cuts are thin dark lines with a glint.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the strips run (integrated: steadily, faster with the music's drive)
 *   audioSectionId/Age -> every new section swaps the strips' symmetries (over six seconds)
 *   audioSwell         -> the cuts' glint
 *
 * Knobs: stripP (how many strips), runP (how fast they run), hueP.
//@params stripP runP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float strips = floor(5.0 + 6.0 * clamp(stripP, 0.0, 1.0));
    float speed = 0.5 + 1.0 * clamp(runP, 0.0, 1.0);
    float run = (0.03 * sceneTime + 0.15 * audioAdvance) * speed;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float sA = max(audioSectionPrev, 0.0), sB = max(audioSectionId, 0.0);
    float y = (p.y + 0.5) * strips;
    float k = floor(y);
    float fy = y - k;
    float dir = mod(k, 2.0) > 0.5 ? -1.0 : 1.0;
    vec2 q = p + vec2(dir * run * (0.6 + 0.15 * mod(k, 3.0)), 0.0);
    // the strip's symmetry: its own, swapped by the section
    float symA = 5.0 + mod(k + sA, 5.0), symB = 5.0 + mod(k + sB, 5.0);
    vec2 c = vec2(0.5 * sin(1.3 * k), 0.0);                     // each strip's rosette centred a little aside
    vec3 a = tone(imgLod(kfold(rot2(0.02 * sceneTime) * (q - c), symA) * 0.45 + vec2(0.5, 0.42), 0.6), fh);
    vec3 b = tone(imgLod(kfold(rot2(0.02 * sceneTime) * (q - c), symB) * 0.45 + vec2(0.5, 0.42), 0.6), fh);
    vec3 col = mix(a, b, m);
    float cut = min(fy, 1.0 - fy) / strips;
    col *= smoothstep(0.0, 0.004, cut);
    col += famLight(fh, 0.6, 0.6) * exp(-cut / 0.0025) * (0.1 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    finish(col);
}

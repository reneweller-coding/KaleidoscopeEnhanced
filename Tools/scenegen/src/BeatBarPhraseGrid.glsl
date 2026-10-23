//@doc
 * @brief BEAT BAR PHRASE GRID: the picture is a sequencer: four columns (the beats of a bar) and eight rows (the bars of a phrase), every cell the photo under a mapping of its own,
 * and a playhead walks through the 32 cells, lighting one after the other with a glow that fades behind it; the walk closes round at the end of the phrase without a jump.  A new section
 * changes the family of mappings (quarter turns, growing windows, panned windows) and the two cross over in six seconds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the playhead's place in the 32 cells (the beats of the phrase, counted)
 *   audioBarPhase   -> the column of the beat in the bar glows softly
 *   audioSectionId/Prev/Age -> the family of mappings changes, the old one crossing over
 *
 * Knobs: gapP (the width of the joints), glowP (the playhead's glow), hueP.
//@params gapP glowP
//@audio audioSwell
//@body
/**  The photo in a cell under the mapping of one family.
 *
 * @param f     The place in the cell, 0..1. (in)
 * @param cell  The cell's column and row. (in)
 * @param fam   The family, 0 (quarter turns), 1 (growing windows) or 2 (panned windows). (in)
 *
 * @return
 *   The colour.
 **/
vec3 gridCell(vec2 f, vec2 cell, float fam)
{
    float idx = cell.y * 4.0 + cell.x;
    float h = hash21(cell + 3.7);
    vec2 q = (f - 0.5) * vec2(0.444, 0.125);
    vec2 c = vec2(0.5);
    float a = 0.0, z = 2.0;
    if (fam < 0.5) { a = 1.5707963 * floor(4.0 * h); z = 1.4 + 1.6 * fract(h * 7.3); }
    else if (fam < 1.5) { z = 1.0 + 3.0 * idx / 31.0; }
    else { c = 0.2 + 0.6 * hash22(cell * 1.7 + 5.0); z = 2.5; a = 0.25 * (h - 0.5); }
    return imgLod(c + rot2(a) * q * z, clamp(log2(z * 0.9), 0.0, 3.0) + 0.3);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 g = vec2((p.x / asp + 0.5) * 4.0, (0.5 - p.y) * 8.0);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float idx = cell.y * 4.0 + cell.x;
    float dl = mod(rhyPhrase() * 32.0 - idx - 0.5 + 16.0, 32.0) - 16.0;
    float glow = exp(-max(dl, 0.0) * 0.45 + min(dl, 0.0) * 2.5);
    float colGlow = rhyBump(cell.x + 0.5, rhyBar() * 4.0, 4.0, 0.9);
    vec3 a = gridCell(f, cell, rhySecPrev(3.0));
    vec3 b = gridCell(f, cell, rhySecCur(3.0));
    vec3 col = mix(a, b, rhySecBlend());
    float gap = 0.02 + 0.05 * clamp(gapP, 0.0, 1.0);
    float joint = smoothstep(0.0, gap, min(f.x, 1.0 - f.x)) * smoothstep(0.0, gap * 3.5, min(f.y, 1.0 - f.y));
    float lit = 0.62 + (0.4 + 0.8 * clamp(glowP, 0.0, 1.0)) * glow + 0.18 * colGlow + 0.2 * clamp(audioSwell, 0.0, 1.0);
    finish(col * lit * joint * 1.1);
}

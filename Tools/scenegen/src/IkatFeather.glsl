//@doc
 * @brief IKAT FEATHER: ikat, the cloth whose yarn is dyed before weaving: every row of yarn of the photo sits slightly shifted, so
 * all edges look softly feathered and the picture shimmers as if under water.  The shift of the rows is a smooth random
 * function of the row, fine and coarse parts mixed by the roughness of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the rows are shifted
 *   audioRoughness  -> how much of the shift is fine, row-by-row (the rest is coarse and flowing)
 *   audioAdvance    -> the shifts drift (integrated)
 *
 * Knobs: rowsP (how many rows), reachP (the base shift), hueP.
//@params rowsP reachP
//@audio audioSwell audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.15 + 1.2 * audioAdvance;
    float rows = 50.0 + 90.0 * clamp(rowsP, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float coarse = noise2(vec2(p.y * 6.0, 0.7 * t)) - 0.5;
    float fine = noise2(vec2(floor(p.y * rows) * 0.37, 0.8 * t + 3.0)) - 0.5;
    float mid = noise2(vec2(p.y * 24.0, 0.5 * t + 9.0)) - 0.5;
    float A = (0.03 + 0.08 * clamp(reachP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    float shift = A * (coarse * (1.2 - rough) + mid * 1.0 + fine * (0.4 + 1.2 * rough));
    vec3 col = imgLod(uv + vec2(shift, 0.0), 0.5);
    vec3 col2 = imgLod(uv + vec2(shift * 0.6 + 0.004, 0.0), 0.8);
    finish(mix(col, col2, 0.35) * 1.05);
}

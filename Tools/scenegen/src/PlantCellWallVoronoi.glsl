//@doc
 * @brief PLANT CELL WALL VORONOI: plant cells: a Voronoi net of cell walls whose cells grow and divide; the photo colours the cells and shines through the thin walls.  Every lattice cell holds two cell centres that move apart and together again once per cycle (a division that is taken back), the walls are the
 * lines between the cells, thick where the cells are old and thin where they are young.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the cycle of dividing (periodic)
 *   audioSwell     -> the thickness of the walls
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.13 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    float bestAge = 0.0;
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 c0 = cj + 0.5 + 0.3 * (h - 0.5) * 2.0;
            float ph = 6.2831853 * audioPhrasePos + 6.2831853 * h.x;
            float sep = 0.22 * (0.5 - 0.5 * cos(ph));
            vec2 v = vec2(cos(6.2831853 * h.y), sin(6.2831853 * h.y));
            for (int s = 0; s < 2; ++s) {
                vec2 pt = c0 + (s == 0 ? 1.0 : -1.0) * sep * v;
                float d = length(g - pt);
                if (d < d1) { d2 = d1; d1 = d; best = pt; bestAge = sep; }
                else if (d < d2) d2 = d;
            }
        }
    vec3 c = imgLod(best * S * 0.85 + 0.5, 1.5);
    c = mix(vec3(luma(c)), c, 1.3) * vec3(0.9, 1.1, 0.85);
    float wallw = 0.03 + 0.04 * clamp(audioSwell, 0.0, 1.0) + 0.05 * (1.0 - bestAge * 4.0) * 0.0;
    float wall = 1.0 - smoothstep(wallw * 0.5, wallw * 1.2, (d2 - d1));
    vec3 through = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col = c * (0.85 + 0.25 * smoothstep(0.0, 0.5, d1));
    col = mix(col, mix(through, vec3(0.55, 0.45, 0.3), 0.4) * 0.8, wall * 0.9);
    finish(col * 1.15);
}

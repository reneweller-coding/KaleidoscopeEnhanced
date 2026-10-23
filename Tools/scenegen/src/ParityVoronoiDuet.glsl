//@doc
 * @brief PARITY VORONOI DUET: Voronoi cells that show the first or the second photo by the cell's parity; the seeds glide, and the parity never jumps: at the seams it changes over a gradient, so the seams are soft ramps from one
 * photo to the other.  The seeds glide with the phase of the music; the number of cells follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the seeds glide (integrated)
 *   audioSpread     -> the number of cells
 *
 * Knobs: cellP (the cell size), hueP.
//@params cellP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float N = (4.0 + 6.0 * clamp(cellP, 0.0, 1.0)) * (0.85 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N;
    vec2 g = floor(q);
    float t = 0.05 * sceneTime + 0.3 * audioPhase;
    float d1 = 9.0, d2 = 9.0, par1 = 0.0, par2 = 0.0;
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 gg = g + vec2(float(i), float(j));
            vec2 h = hash22(gg);
            vec2 pt = gg + 0.5 + 0.35 * vec2(sin(t + 6.2831853 * h.x), cos(0.8 * t + 6.2831853 * h.y));
            float d = length(q - pt);
            float par = step(0.5, hash21(gg + 2.1));
            if (d < d1) { d2 = d1; par2 = par1; d1 = d; par1 = par; } else if (d < d2) { d2 = d; par2 = par; }
        }
    }
    float w = smoothstep(0.0, 0.25, d2 - d1);
    float par = mix(0.5 * (par1 + par2), par1, w);
    finish(mix(imgLod(uv, 0.7), imgB(uv, 0.7), par) * 1.05);
}

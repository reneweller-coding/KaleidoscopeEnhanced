//@doc
 * @brief DIAGONAL SYMPHONY LINES: after Viking Eggeling's "Diagonal Symphony": ornaments of lines -- arcs, combs,
 * stepped bars -- along diagonal lanes that fill the picture, each ornament building itself up stroke by stroke and
 * taking itself down again.  In a lane's own coordinates (along, across) an ornament is a row of motifs; a motif is
 * drawn only up to how far its lane has built, so the strokes grow and retreat smoothly.  White lines tinted toward
 * the photo's colour family on black, as in the film's negative look.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each lane listens to its own band: the band's level is how far its ornament stands built
 *   audioAdvance      -> the lanes' motifs drift along (integrated)
 *
 * Knobs: laneP (how many lanes), motifP (the motifs' size), hueP.
//@params laneP motifP
//@audio audioSpectrum[32]
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float lanes = floor(5.0 + 4.0 * clamp(laneP, 0.0, 1.0));
    float M = 0.12 + 0.1 * clamp(motifP, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    // the lanes run along the diagonal
    vec2 dir = normalize(vec2(1.0, 0.62));
    float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
    float W = 1.3 / lanes;
    float k = floor(across / W + 0.5);
    float v = across - k * W;                                    // -W/2 .. W/2 across the lane
    float hk = fract(sin(k * 12.9898) * 43758.5453);
    float built = clamp(0.25 + audioSpectrum[int(mod(3.0 + 3.0 * (k + 10.0), 30.0))] * 2.0, 0.0, 1.0);
    float u = along / M + drift * (hk < 0.5 ? 1.0 : -1.0) * 4.0;
    float m = floor(u);
    float f = u - m;
    float hm = fract(sin(m * 7.31 + k * 3.7) * 43758.5453);
    float d = 1e9;
    float kind = floor(hm * 3.0);
    vec2 q = vec2((f - 0.5) * M, v);
    if (kind < 0.5) {
        // an arc rising out of the lane's lower edge
        d = abs(length(q - vec2(0.0, -0.45 * W)) - 0.5 * W);
    } else if (kind < 1.5) {
        // a comb: a spine and teeth
        float tooth = abs(fract(f * 5.0) - 0.5) * M / 5.0;
        d = min(abs(v + 0.3 * W), max(tooth, abs(v + 0.05 * W) - 0.25 * W));
    } else {
        // stepped bars
        float stp = floor(f * 4.0) / 4.0;
        d = abs(v - (stp - 0.4) * 0.6 * W);
    }
    // a motif shows only as far as its lane has built (its own threshold, so they come and go one by one)
    float show = smoothstep(hm - 0.05, hm + 0.05, built);
    float line = exp(-pow(d / 0.004, 2.0)) * show * smoothstep(0.5 * W, 0.42 * W, abs(v));
    vec3 col = famLight(fh, fract(hk * 3.0), 0.75) * line;
    col += famCol(fh, 0.45) * 0.015;
    finish(famExpose(col, 5.69, 0.80, 0.03, fh));
}

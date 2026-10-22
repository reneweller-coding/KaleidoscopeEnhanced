//@doc
 * @brief BRYOZOAN CROWN WAVES: a colony of moss animals seen from above: a brick-laid lattice of small boxes, and from
 * the opening of each a crown of glowing tentacles unfolds and is pulled back in -- in waves that roll across the
 * colony with the music's rhythm, so whole bands of crowns open while others are gone into their boxes.  Each box is a
 * rounded rectangle with glowing walls and a small round opening; its crown is a ring of thin tentacles reaching out to
 * a length set by the wave, tipped with brighter points; neighbouring crowns overlap.  The light is shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the waves of opening roll across the colony (integrated: with the music's rhythm and drive)
 *   audioSwell   -> the tentacles' glow
 *
 * Knobs: boxP (the boxes' size), tentacleP (how many tentacles a crown has), hueP.
//@params boxP tentacleP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float W = 0.11 + 0.05 * clamp(boxP, 0.0, 1.0);
    float H = W * 0.62;
    float nt = floor(10.0 + 6.0 * clamp(tentacleP, 0.0, 1.0));
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    float row0 = floor(p.y / H);
    for (int k = 0; k < 9; ++k) {
        float row = row0 + float(k / 3) - 1.0;
        float shift = mod(row, 2.0) < 0.5 ? 0.0 : 0.5;
        float ci = floor(p.x / W - shift) + float(k % 3) - 1.0;
        vec2 ctr = vec2((ci + 0.5 + shift) * W, (row + 0.5) * H);
        float hz = hash21(vec2(ci, row));
        vec2 d = p - ctr;
        // the box: rounded walls round the cell (each box draws its own; they meet in the shared walls)
        if (k == 4 || (abs(d.x) < 0.5 * W && abs(d.y) < 0.5 * H)) {
            vec2 e = abs(d) - vec2(0.5 * W, 0.5 * H) + 0.012;
            float box = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - 0.012;
            col += famCol(fh, 0.35 + 0.3 * hz) * exp(-pow(box / 0.0025, 2.0)) * 0.35;
        }
        // the crown: opening and closing in a wave across the colony
        vec2 orf = ctr + vec2(0.0, 0.1 * H);
        float open = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(dot(ctr, vec2(5.0, 3.0)) - run + 0.6 * hz));
        vec2 dd = p - orf;
        float r = length(dd), an = atan(dd.y, dd.x);
        float Lc = open * 0.85 * W;
        col += famCol(fh, 0.5) * exp(-pow((r - 0.012) / 0.003, 2.0)) * 0.3;   // the opening
        if (Lc > 0.003 && r < Lc + 0.01) {
            float ta = (fract(an / 6.2831853 * nt + hz) - 0.5) * 6.2831853 / nt * r;
            float tent = exp(-pow(ta / 0.0018, 2.0)) * smoothstep(Lc, Lc * 0.85, r) * smoothstep(0.008, 0.02, r);
            float tip = exp(-(ta * ta + (r - Lc) * (r - Lc)) / 0.00002);
            col += famLight(fh, 0.4 + 0.3 * hz, 0.5) * (tent * 0.7 + tip * 1.2) * glow * open;
        }
    }
    finish(col);
}

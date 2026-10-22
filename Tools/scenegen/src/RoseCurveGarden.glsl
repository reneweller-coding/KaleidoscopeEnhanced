//@doc
 * @brief ROSE CURVE GARDEN: an endless, mirrored garden of rose curves r = cos(k theta): every cell holds one rose, and
 * as k glides from fraction to fraction all the blossoms change together -- four petals unfold into five, petals split
 * and overlap into lacy many-looped flowers and settle again; the roses turn slowly.  The rose is found by its
 * branches: a point at angle theta lies on the curve where some theta + j pi gives a radius (with the sign of j) equal
 * to its own, so the distance is the nearest of those radii's differences.  The cells are mirrored so the garden has
 * no seams.  The blossoms are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> k glides from one fraction to the next with the chords: every rose changes shape
 *   audioAdvance     -> the roses turn (integrated)
 *   audioSwell       -> the lines' glow
 *
 * Knobs: cellP (the cells' size), lineP (the lines' width), hueP.
//@params cellP lineP
//@audio audioHarmAdvance audioSwell
//@body
/**  A fraction from the garden's list.
 *
 * @param i  Which (any whole number; the list repeats). (in)
 *
 * @return
 *   The fraction.
 **/
float roseK(float i)
{
    float j = mod(i, 6.0);
    return j < 0.5 ? 1.5 : j < 1.5 ? 1.6666667 : j < 2.5 ? 2.5 : j < 3.5 ? 1.3333333 : j < 4.5 ? 1.75 : 2.3333333;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.38 + 0.2 * clamp(cellP, 0.0, 1.0);
    float lw = 0.0018 + 0.0018 * clamp(lineP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float k = mix(roseK(hk), roseK(hk + 1.0), hm);
    float turn = 0.02 * sceneTime + 0.08 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the mirrored cells: every other cell is flipped, so the roses meet without seams
    vec2 g = p / S + 0.5;
    vec2 cid = floor(g);
    vec2 q = (fract(g) - 0.5) * S;
    q *= vec2(mod(cid.x, 2.0) < 0.5 ? 1.0 : -1.0, mod(cid.y, 2.0) < 0.5 ? 1.0 : -1.0);
    float R = 0.47 * S;
    float r = length(q) / R;
    float th = atan(q.y, q.x) + turn;
    float best = 9.0;
    for (int j = 0; j < 14; ++j) {
        float fj = float(j);
        float rr = cos(k * (th + 3.14159265 * fj)) * (mod(fj, 2.0) < 0.5 ? 1.0 : -1.0);
        if (rr < 0.0) continue;                                       // that branch lies on the other side
        best = min(best, abs(r - rr));
    }
    float d = best * R;
    float line = exp(-pow(d / lw, 2.0)) + 0.2 * exp(-d / (6.0 * lw));
    vec3 col = famCol(fh, 0.45) * 0.02 + famLight(fh, 0.3 + 0.4 * r, 0.5) * line * glow * smoothstep(1.05, 0.95, r);
    finish(col);
}

//@doc
 * @brief MINIMUM SPANNING TREE COLOUR WEB: the minimal spanning tree: points from the photo are joined by edges so that the total length is minimal, colour distance counting as length; the picture shows a net of lines in the photo's colours that rebuilds as the points wander.  Every point on a jittered lattice joins the one of
 * its four forward neighbours whose colour is nearest, so the lines follow areas of one colour and break at colour edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of points (the size of the lattice) (smoothed)
 *   audioAdvance -> the points wander (integrated)
 *
 * Knobs: sizeP (the size of the lattice), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
/**  The place of a wandering point on the jittered lattice.
 *
 * @param cj  The lattice cell. (in)
 * @param S  The cell size. (in)
 * @param t  The time. (in)
 *
 * @return
 *   The position.
 **/
vec2 pt(vec2 cj, float S, float t)
{
    vec2 h = hash22(cj);
    return (cj + 0.5 + 0.38 * (h - 0.5) * 2.0 + 0.2 * vec2(sin(t * (0.7 + h.x) + 6.28 * h.y), cos(t * (0.6 + h.y) + 6.28 * h.x))) * S;
}
void main()
{
    vec2 p = screenP();
    float S = (0.08 + 0.07 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.25 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    vec3 col = imgLod(p * 0.85 + 0.5, 1.5) * 0.18;
    for (int dy = -2; dy <= 1; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 A = pt(cj, S, t);
            vec3 cA = imgLod(A * 0.85 + 0.5, 1.5);
            float bestC = 1e3;
            vec2 bestB = A;
            vec3 bestCol = cA;
            for (int e = 0; e < 4; ++e) {
                vec2 o = e == 0 ? vec2(1.0, 0.0) : (e == 1 ? vec2(1.0, 1.0) : (e == 2 ? vec2(0.0, 1.0) : vec2(-1.0, 1.0)));
                vec2 B = pt(cj + o, S, t);
                vec3 cB = imgLod(B * 0.85 + 0.5, 1.5);
                float cost = length(B - A) / S + 3.0 * length(cB - cA);
                if (cost < bestC) { bestC = cost; bestB = B; bestCol = cB; }
            }
            float d = sdSeg(p, A, bestB);
            float line = 1.0 - smoothstep(S * 0.012, S * 0.032, d);
            vec3 lc = mix(cA, bestCol, clamp(dot(p - A, bestB - A) / max(dot(bestB - A, bestB - A), 1e-5), 0.0, 1.0));
            lc = mix(vec3(luma(lc)), lc, 1.5);
            col = mix(col, lc * 1.6 + 0.1, line);
            float dn = length(p - A);
            col = mix(col, cA * 1.7, 1.0 - smoothstep(S * 0.045, S * 0.06, dn));
        }
    finish(col);
}

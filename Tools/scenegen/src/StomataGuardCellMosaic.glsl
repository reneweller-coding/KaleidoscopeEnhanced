//@doc
 * @brief STOMATA GUARD CELL MOSAIC: stomata: bean-shaped pairs of guard cells in a mosaic of epidermis cells that open and close; the photo colours the cells, and the degrees of opening run through the leaf in waves.  The epidermis is a field of jittered cells with thin walls, a third of the cells holds a stoma
 * (a pair of crescents round a slit), and the slits widen and narrow as a wave runs over the leaf.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the degree of opening
 *   audioAdvance -> the wave of opening runs through the leaf (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.12 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    vec2 bestId = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.38 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; best = pt; bestId = cj; } else if (d < d2) d2 = d;
        }
    vec3 c = imgLod(best * S * 0.85 + 0.5, 1.8);
    c = mix(vec3(luma(c)), c, 1.25);
    vec3 col = c * (0.6 + 0.4 * smoothstep(0.0, 0.45, d1)) * 1.2;
    float h0 = hash21(bestId + 7.0);
    float wall = smoothstep(0.0, 0.05, d2 - d1);
    col *= 0.45 + 0.55 * wall;
    if (h0 < 0.4) {
        float ang = 6.2831853 * hash21(bestId + 1.3);
        vec2 q = rot2(ang) * (g - best);
        float wv = 0.5 + 0.5 * sin(0.7 * bestId.x + 0.5 * bestId.y - 0.05 * audioAdvance - 0.1 * sceneTime);
        float op = clamp(0.1 + 0.55 * clamp(audioSwell, 0.0, 1.0) + 0.5 * wv, 0.0, 1.0);
        float a = 0.36;
        float b = 0.21;
        float ell = (q.x / a) * (q.x / a) + (q.y / b) * (q.y / b);
        float slit = abs(q.y) < op * b * 0.65 * (1.0 - (q.x / a) * (q.x / a)) ? 1.0 : 0.0;
        float inside = (1.0 - smoothstep(0.9, 1.0, ell));
        float rim = 1.0 - smoothstep(0.0, 0.06, abs(ell - 0.92));
        vec3 guard = mix(c, vec3(0.5, 0.9, 0.45) * (0.5 + 0.7 * luma(c)), 0.45) * 1.25;
        col = mix(col, guard, inside);
        col = mix(col, vec3(0.03), inside * slit * 0.92);
        col += vec3(0.8, 0.95, 0.6) * rim * 0.25;
    }
    finish(col);
}

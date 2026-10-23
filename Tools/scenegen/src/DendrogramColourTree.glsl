//@doc
 * @brief DENDROGRAM COLOUR TREE: a dendrogram: the colours of the photo are grouped into a tree of branchings that grows through the picture like root work, and every branch carries the mean colour of its group.  Thirty-two leaves at the bottom (the photo's colours along a
 * line) join pairwise upwards; the higher a join, the coarser the average.  The leaves wander a little.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the thickness of the branches
 *   audioHarmAdvance -> the heights of the joins sway (integrated)
 *
 * Knobs: sizeP (the height of the tree), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
float nodeX(float lvl, float n, float asp)
{
    float span = exp2(lvl);
    return ((n + 0.5) * span / 32.0 - 0.5) * asp * 0.96;
}
float nodeY(float lvl, float n, float H, float sw)
{
    float hh = hash21(vec2(lvl, n));
    return -0.45 + H * (lvl / 5.0 + 0.06 * sin(6.2831853 * hh + 0.1 * sw + 0.04 * sceneTime));
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float H = 0.8 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float lw = 0.004 + 0.008 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.2;
    float xn = (p.x / asp / 0.96 + 0.5) * 32.0;
    for (int L = 1; L <= 5; ++L) {
        float fl = float(L);
        float span = exp2(fl);
        float n0 = floor(xn / span);
        for (int dn = -1; dn <= 1; ++dn) {
            float n = n0 + float(dn);
            if (n < 0.0 || n >= 32.0 / span) continue;
            float cl = nodeX(fl - 1.0, 2.0 * n, asp);
            float cr = nodeX(fl - 1.0, 2.0 * n + 1.0, asp);
            float yl = fl == 1.0 ? -0.45 : nodeY(fl - 1.0, 2.0 * n, H, audioHarmAdvance);
            float yr = fl == 1.0 ? -0.45 : nodeY(fl - 1.0, 2.0 * n + 1.0, H, audioHarmAdvance);
            float yb = nodeY(fl, n, H, audioHarmAdvance);
            float d = sdSeg(p, vec2(cl, yb), vec2(cr, yb));
            d = min(d, sdSeg(p, vec2(cl, yl), vec2(cl, yb)));
            d = min(d, sdSeg(p, vec2(cr, yr), vec2(cr, yb)));
            float cx = nodeX(fl, n, asp);
            vec3 c = imgLod(vec2(cx / asp * 0.85 + 0.5, 0.5 + 0.25 * sin(0.3 * n + 0.05 * sceneTime)), fl * 0.9 + 0.5);
            c = mix(vec3(luma(c)), c, 1.3);
            float w = lw * (1.0 + 0.25 * (5.0 - fl));
            float al = 1.0 - smoothstep(w * 0.4, w, d);
            col = mix(col, c * 1.25, al);
        }
    }
    for (int i = 0; i < 32; ++i) {
        float cx = nodeX(0.0, float(i), asp);
        vec3 c = imgLod(vec2(cx / asp * 0.85 + 0.5, 0.5 + 0.25 * sin(0.3 * float(i) + 0.05 * sceneTime)), 1.0);
        float d = length(p - vec2(cx, -0.45));
        col = mix(col, c * 1.2, 1.0 - smoothstep(lw * 1.2, lw * 2.0, d));
    }
    finish(col);
}

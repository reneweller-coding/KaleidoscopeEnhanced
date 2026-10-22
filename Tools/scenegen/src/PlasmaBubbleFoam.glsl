//@doc
 * @brief PLASMA BUBBLE FOAM: a foam of plasma bubbles whose skins glimmer violet: the bubbles drift, swell and shrink
 * against one another, and over each phrase some of them divide in two and close up again, all without a jump.  The
 * foam is a power diagram: each bubble is a site with a weight (its squared radius), and a place belongs to the site
 * of least |x - s|^2 - w; the skin is the distance to the diagram's border, (d_j - d_1) / (2 |s_j - s_1|).  A dividing
 * bubble has a second site that leaves the first along its own direction while its weight grows from nothing, so its
 * cell opens from a point.  The violet is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the bubbles swell and shrink against one another
 *   audioPhrasePos -> some bubbles divide in two over each phrase and close up again
 *   audioAdvance   -> the foam drifts (integrated)
 *
 * Knobs: bubbleP (the bubbles' size), skinP (the skins' width), hueP.
//@params bubbleP skinP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float vh = fract(0.78 + 0.3 * (fract(fh - 0.78 + 0.5) - 0.5));
    float S = 0.2 + 0.1 * clamp(bubbleP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float split = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec2 g = p / S + vec2(0.5, 0.2) * drift;
    vec2 gi = floor(g);
    // the sites: one per cell, and a sibling that leaves it as the cell divides
    vec2 sites[18];
    float wts[18];
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        float h1 = hash21(cell), h2 = hash21(cell + 17.0);
        vec2 s = cell + 0.5 + 0.35 * vec2(sin(drift * (1.0 + h1) + 6.0 * h1), cos(drift * (0.8 + h2) + 6.0 * h2));
        float r = 0.42 * (0.7 + 0.3 * h1) * (0.85 + 0.3 * sw * (h2 - 0.3));
        float dv = step(0.5, h2) * split;                             // only some bubbles divide
        vec2 dir = vec2(cos(6.2831853 * h1), sin(6.2831853 * h1));
        sites[2 * k] = s - dir * 0.18 * dv;
        wts[2 * k] = r * r;
        sites[2 * k + 1] = s + dir * 0.18 * dv;
        wts[2 * k + 1] = r * r * dv;                                  // its cell opens from a point
    }
    float best = 1e9;
    int bi = 0;
    for (int k = 0; k < 18; ++k) {
        float pd = dot(g - sites[k], g - sites[k]) - wts[k];
        if (pd < best) { best = pd; bi = k; }
    }
    float edge = 1e9;
    for (int k = 0; k < 18; ++k) {
        if (k == bi) continue;
        float pd = dot(g - sites[k], g - sites[k]) - wts[k];
        float sep = length(sites[k] - sites[bi]);
        if (sep < 1e-4) continue;
        edge = min(edge, (pd - best) / (2.0 * sep));
    }
    edge *= S;
    float sk = 0.002 + 0.002 * clamp(skinP, 0.0, 1.0);
    float skin = exp(-pow(edge / sk, 2.0)) + 0.3 * exp(-edge / (5.0 * sk));
    float inner = smoothstep(0.0, 0.06, edge);
    vec3 col = famCol(vh, 0.45) * 0.02 + famCol(vh, 0.4 + 0.2 * fract(float(bi) * 0.37)) * 0.05 * inner;
    col += famLight(vh, 0.5, 0.35) * skin * (0.6 + 0.6 * sw);
    finish(famExpose(col, 2.00, 1.00, 0.03, fh));
}

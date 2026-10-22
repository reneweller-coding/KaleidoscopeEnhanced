//@doc
 * @brief PICKOVER STALKS FIELD: Pickover's stalks of a wandering Julia set -- light wherever the orbit of z <- z^2 + c
 * passes close to one of the two axes, a cross-shaped orbit trap -- glowing stalks that sprout from every bay of the
 * set; the set is mirrored at the edges of its window, so the stalks fill an endless field.  One colour family from
 * the photo, shaded by the step at which the orbit came closest.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the Julia constant wanders round the main cardioid's edge (integrated): stalks bend and regrow;
 *                   and the field drifts
 *   audioSwell   -> the stalks' width
 *   audioOnset   -> the stalks' tips flare
 *
 * Knobs: windowP (how much of the set one mirror cell shows), stalkP (the stalks' base width), hueP.  Distinct from
 * OrbitTrapStalks, which fills the stalks with the photo.
//@params windowP stalkP
//@audio audioSwell audioOnset
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float ph = 0.05 * audioAdvance + 0.006 * sceneTime;
    // c on a path just outside the main cardioid: dendrites, spirals and bays in turn
    float th = 6.2831853 * fract(0.17 + 0.5 * sin(ph) * 0.18 + 0.03 * ph);
    vec2 card = 0.5 * vec2(cos(th), sin(th)) - 0.25 * vec2(cos(2.0 * th), sin(2.0 * th));
    vec2 c = card * 1.03;
    float win = 1.4 + 0.8 * clamp(windowP, 0.0, 1.0);
    float width = (0.012 + 0.012 * clamp(stalkP, 0.0, 1.0)) * (0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float flare = clamp(audioOnset, 0.0, 1.0);
    vec2 drift = vec2(0.03 * sceneTime + 0.12 * audioAdvance, 0.02 * sceneTime);
    // the field: the window [-win, win]^2 mirrored at its edges, without seams
    vec2 u = (p * 2.2 + drift) / (2.0 * win);
    vec2 z = (1.0 - abs(fract(u) * 2.0 - 1.0)) * 2.0 * win - win;
    float trap = 1e9, at = 0.0;
    for (int i = 0; i < 40; ++i) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        float d = min(abs(z.x), abs(z.y));
        if (d < trap) { trap = d; at = float(i); }
        if (dot(z, z) > 64.0) break;
    }
    float g = exp(-trap / width);
    float tip = exp(-trap / (0.25 * width)) * flare;
    vec3 col = famLight(fh, fract(at / 14.0), 0.3 * g + 0.6 * tip) * (g * 0.9 + tip * 1.5);
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}

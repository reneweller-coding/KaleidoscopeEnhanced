//@doc
 * @brief K MEANS PALETTE VORONOI: a decomposition by k colour centres: the picture is divided into cells by the nearest palette colour, the centres wander on slow orbits, and the cell boundaries swing with them; every cell carries the colour of the photo at its centre and the
 * photo shines through it, so the picture is half photo, half palette.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the centres wander (integrated)
 *   audioSwell   -> how much of the palette (against the photo) is shown
 *
 * Knobs: sizeP (the radius of the orbits), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float R = 0.35 + 0.35 * clamp(sizeP, 0.0, 1.0);
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int k = 0; k < 14; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 3.7));
        vec2 cen = R * vec2(1.5 * sin((0.6 + h.x) * t + 6.28 * h.y), cos((0.5 + h.y) * t + 6.28 * h.x));
        float d = length(p - cen);
        if (d < d1) { d2 = d1; d1 = d; best = cen; }
        else if (d < d2) d2 = d;
    }
    vec3 pal = imgLod(best * 0.85 + 0.5, 3.2);
    pal = mix(vec3(luma(pal)), pal, 1.25);
    vec3 ph = imgLod(p * 0.85 + 0.5, 0.5);
    float mixv = 0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = mix(ph, pal * (0.8 + 0.4 * smoothstep(0.0, 0.5, d1)), mixv);
    float border = smoothstep(0.0, 0.012, d2 - d1);
    finish(col * (0.3 + 0.7 * border) * 1.15);
}

//@doc
 * @brief BELSON COSMIC MANDALA: after Jordan Belson: a glowing mandala of light and mist comes up out of the depth,
 * opens like a blossom and flows apart into clouds, while the next one already rises behind it.  The mandalas live
 * in log-radius, so rising out of the depth is a steady shift and every mandala follows the last without end: each
 * is a ring of petals and dots in light, bright where it is born at the centre, opening as it grows outward and
 * dissolving into a drifting mist at the rim.  Light and mist are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the opening: the petals widen and glow
 *   audioHarmAdvance -> the number of petals glides with the chord changes (the light of two counts cross-faded)
 *   audioAdvance     -> the mandalas rise (integrated)
 *
 * Knobs: petalP (the petals' base count), mistP (how much mist), hueP.
//@params petalP mistP
//@audio audioSwell audioHarmAdvance
//@body
/**  The mandalas' light at a point for one petal count.
 *
 * @param u      Log radius, shifted by the rise (one mandala per unit). (in)
 * @param th     The angle. (in)
 * @param n      The petal count. (in)
 * @param open   The petals' opening. (in)
 *
 * @return
 *   The light (0..~1).
 **/
float mandala(float u, float th, float n, float open)
{
    float k = floor(u);
    float f = u - k;                                            // 0 where a mandala is born, 1 where it dissolves
    float turn = 0.7 * k;
    float pet = 0.5 + 0.5 * cos(n * (th + turn));
    float petal = pow(pet, 3.0 - 2.0 * open) * smoothstep(0.1, 0.4, f) * (1.0 - smoothstep(0.55, 0.95, f));
    float ring = exp(-pow((f - 0.35) / 0.03, 2.0)) * 0.8;
    float dots = pow(0.5 + 0.5 * cos(2.0 * n * (th - turn)), 30.0) * exp(-pow((f - 0.6) / 0.05, 2.0));
    return petal * 0.6 + ring * (0.4 + 0.6 * pet) + dots;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float nf = 6.0 + 4.0 * clamp(petalP, 0.0, 1.0) + 3.0 * (0.5 + 0.5 * sin(0.6 * h));
    float nk = floor(nf), nm = smoothstep(0.2, 0.8, nf - nk);
    float open = clamp(audioSwell, 0.0, 1.0);
    float rise = 0.05 * sceneTime + 0.2 * audioAdvance;
    float r = max(length(p), 1e-4);
    float th = atan(p.y, p.x);
    float u = log(r) * 1.1 - rise;
    float m = mix(mandala(u, th, nk, open), mandala(u, th, nk + 1.0, open), nm);
    // the mist: drifting clouds, thicker toward the rim where the mandalas dissolve
    float mist = fbm(vec2(u * 2.0 + 0.3 * rise, th * 1.5) + vec2(0.0, 0.02 * sceneTime));
    mist = smoothstep(0.35, 0.8, mist) * (0.3 + 0.7 * clamp(mistP, 0.0, 1.0)) * smoothstep(0.05, 0.6, r);
    vec3 col = famLight(fh, 0.3 + 0.2 * fract(u), 0.4 * m) * m * 0.9 + famCol(fh, 0.6) * mist * 0.4;
    col += famLight(fh, 0.5, 0.8) * exp(-r * 10.0) * 0.4;      // the heart, where the next one is born
    finish(famExpose(col, 1.35, 1.00, 0.00, fh));
}

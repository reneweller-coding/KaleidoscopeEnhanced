//@doc
 * @brief STAMPFLI DODECAGONAL BLOOM: a twelve-fold quasicrystal that blooms out of the middle and keeps rebuilding
 * itself: a net of light that never repeats but has twelve-fold order everywhere, its cells filled in a few shades,
 * rings of growth running outward from the centre while the whole net slowly reshapes.  The net is the zero line of
 * the sum of six plane waves at 30-degree steps (twelve directions); the cells take their shade from the signs of
 * two of the waves; the waves' phases drift, so the quasicrystal rebuilds continuously.  Distinct from
 * QuasicrystalPenroseKaleido, which is ten-fold.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the growth rings run outward and the net reshapes (integrated)
 *   audioSwell   -> the net's glow
 *
 * Knobs: scaleP (the net's scale), ringP (how close the growth rings are), hueP.
//@params scaleP ringP
//@audio audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float K = 40.0 + 30.0 * clamp(scaleP, 0.0, 1.0);
    float rings = 1.5 + 2.0 * clamp(ringP, 0.0, 1.0);
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float f = 0.0, w0 = 0.0, w1 = 0.0;
    vec2 gr = vec2(0.0);
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        float a = 0.5235988 * fk;
        vec2 e = vec2(cos(a), sin(a));
        float ph = 0.6 * sin(0.3 * run + 1.7 * fk);
        float arg = K * dot(p, e) + ph;
        f += cos(arg);
        gr -= K * sin(arg) * e;
        if (k == 0) w0 = cos(arg);
        if (k == 3) w1 = cos(arg);
    }
    // the net: the waves' sum's zero line, drawn about a pixel and a half wide
    float dist = abs(f) / max(length(gr), 1e-3);
    float net = exp(-pow(dist / (1.5 / resolution.y + 0.0015), 2.0));
    float shade = 0.5 + 0.25 * (sign(w0) + 0.5 * sign(w1)) * smoothstep(0.0, 0.4, abs(f));
    // the growth: rings running outward from the middle
    float r = length(p);
    float grow = 0.55 + 0.45 * pow(0.5 + 0.5 * cos(6.2831853 * (r * rings - run)), 3.0);
    vec3 cell = mix(famCol(fh, shade) * 0.2, tone(imgLod(p * 0.5 + 0.5, 3.0), fh) * 0.4, 0.4) * (0.6 + 0.4 * grow);
    vec3 col = cell + famLight(fh, 0.6, 0.6) * net * grow * glow;
    col += famLight(fh, 0.5, 0.9) * exp(-r * r / 0.002) * 0.5;
    finish(col);
}

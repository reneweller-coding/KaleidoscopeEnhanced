//@doc
 * @brief SEIGAIHA RIPPLE: the Japanese wave pattern seigaiha -- rows of overlapping scales, each a fan of concentric
 * arcs -- with waves running through it: the scales rise and sink as the waves pass, catching the light on their rims.
 * The scales are circles on a staggered lattice, each row laid over the row behind it; the visible scale at a place is
 * the last row whose circle covers it; a rising scale lifts upward and brightens.  The scales take their colours from
 * the photo, calmed into one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the waves' height: the scales rise further with the bass (softened by the swell)
 *   audioAdvance -> the waves run through the scales (integrated)
 *   audioSwell   -> the rims' sheen
 *
 * Knobs: scaleP (the scales' size), ringP (how many arcs a scale has), hueP.
//@params scaleP ringP
//@audio audioBass audioSwell
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
    float R = 0.07 + 0.05 * clamp(scaleP, 0.0, 1.0);
    float rings = floor(4.0 + 3.0 * clamp(ringP, 0.0, 1.0));
    float sw = clamp(audioSwell, 0.0, 1.0);
    float lift = R * (0.08 + 0.25 * mix(sw, clamp(audioBass, 0.0, 1.0), 0.5));
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float dy = 0.5 * R;
    float j0 = floor(p.y / dy);
    vec3 col = famCol(fh, 0.45) * 0.03;
    for (int k = 4; k >= -1; --k) {                                  // the rows behind (above) first
        float j = j0 + float(k);
        float off = mod(j, 2.0) < 0.5 ? 0.0 : R;
        float i = floor((p.x - off) / (2.0 * R) + 0.5);
        vec2 c = vec2(i * 2.0 * R + off, j * dy);
        float wave = sin(c.x * 6.0 - run + 0.8 * c.y * 6.0);
        c.y += lift * wave;
        vec2 d = p - c;
        float r = length(d);
        if (r > R || d.y < -0.002) continue;
        float rr = r / R;
        float ring = abs(fract(rr * rings) - 0.5);
        float arc = smoothstep(0.32, 0.45, ring);
        float hs = hash21(vec2(i, j));
        vec3 sc = mix(famCol(fh, 0.3 + 0.4 * hs), tone(imgLod(c * 0.5 + 0.5, 3.0), fh), 0.45) * (0.35 + 0.35 * (1.0 - rr));
        sc = mix(sc, famLight(fh, 0.5, 0.6) * (0.6 + 0.4 * wave), arc * 0.8);
        sc += famLight(fh, 0.5, 0.9) * exp(-pow((rr - 0.97) / 0.03, 2.0)) * (0.2 + 0.5 * sw) * (0.6 + 0.4 * wave);
        col = mix(col, sc, smoothstep(1.0, 0.97, rr));
    }
    finish(col);
}

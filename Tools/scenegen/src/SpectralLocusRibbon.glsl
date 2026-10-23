//@doc
 * @brief SPECTRAL LOCUS RIBBON: the spectral locus (the horseshoe of the CIE chromaticity diagram): a band that runs along the colour chart, with the photo as filling; the band moves through the gamut.  The horseshoe is drawn as a polygon of thirteen points of the real spectral locus; inside, the chromaticity
 * of every point gives its colour, shaded by the photo; a ribbon of the photo's own colours runs along the edge.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the ribbon runs along the locus (integrated)
 *   audioSwell   -> the width of the ribbon and the brightness of the filling
 *
 * Knobs: sizeP (the size of the diagram), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  A point of the spectral locus of the CIE chromaticity diagram (thirteen wavelengths).
 *
 * @param i  The index of the wavelength 0..12. (in)
 *
 * @return
 *   The chromaticity x, y.
 **/
vec2 locus(int i)
{
    if (i == 0) return vec2(0.1733, 0.0048);
    if (i == 1) return vec2(0.1644, 0.0109);
    if (i == 2) return vec2(0.1440, 0.0297);
    if (i == 3) return vec2(0.0913, 0.1327);
    if (i == 4) return vec2(0.0454, 0.2950);
    if (i == 5) return vec2(0.0082, 0.5384);
    if (i == 6) return vec2(0.0743, 0.8338);
    if (i == 7) return vec2(0.2296, 0.7543);
    if (i == 8) return vec2(0.3731, 0.6245);
    if (i == 9) return vec2(0.5125, 0.4866);
    if (i == 10) return vec2(0.6270, 0.3725);
    if (i == 11) return vec2(0.6915, 0.3083);
    return vec2(0.7347, 0.2653);
}
void main()
{
    vec2 p = screenP();
    float S = 0.95 + 0.4 * clamp(sizeP, 0.0, 1.0);
    vec2 xy = vec2(0.34, 0.37) + p / S * vec2(1.0, 1.0) * 0.9;
    float cross_ = 0.0;
    float dmin = 1e3;
    float sBest = 0.0;
    for (int i = 0; i < 13; ++i) {
        vec2 a = locus(i);
        vec2 b = locus(i == 12 ? 0 : i + 1);
        if ((a.y > xy.y) != (b.y > xy.y)) {
            float xi = a.x + (xy.y - a.y) / (b.y - a.y) * (b.x - a.x);
            if (xi > xy.x) cross_ += 1.0;
        }
        float d = sdSeg(xy, a, b);
        if (d < dmin) {
            dmin = d;
            sBest = (float(i) + clamp(dot(xy - a, b - a) / max(dot(b - a, b - a), 1e-6), 0.0, 1.0)) / 13.0;
        }
    }
    float inside = mod(cross_, 2.0);
    float Y = 0.55 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float yy = max(xy.y, 0.02);
    vec3 XYZ = vec3(xy.x / yy * Y, Y, (1.0 - xy.x - xy.y) / yy * Y);
    vec3 rgb = vec3(3.2406 * XYZ.x - 1.5372 * XYZ.y - 0.4986 * XYZ.z,
                    -0.9689 * XYZ.x + 1.8758 * XYZ.y + 0.0415 * XYZ.z,
                    0.0557 * XYZ.x - 0.2040 * XYZ.y + 1.0570 * XYZ.z);
    rgb = clamp(rgb / max(max(rgb.r, max(rgb.g, rgb.b)), 1e-3), 0.0, 1.0);
    vec3 ph = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 fill = rgb * (0.45 + 0.7 * luma(ph));
    vec3 bg = ph * 0.1 + vec3(0.01, 0.01, 0.02);
    vec3 col = mix(bg, fill, inside);
    float run = fract(0.01 * audioAdvance + 0.02 * sceneTime);
    float dd = abs(sBest - run);
    dd = min(dd, 1.0 - dd);
    float wr = 0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    float rib = exp(-pow(dd / wr, 2.0)) * (1.0 - smoothstep(0.012, 0.03, dmin));
    float edge = 1.0 - smoothstep(0.002, 0.008, dmin);
    vec3 pc = mix(vec3(luma(ph)), ph, 1.5) * 1.6 + 0.1;
    col = mix(col, vec3(0.9), edge * 0.6);
    col = mix(col, pc, rib);
    finish(col * 1.05);
}

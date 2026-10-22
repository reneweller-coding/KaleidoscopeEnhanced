//@doc
 * @brief GLASS HARMONICA RIMS: a tunnel of glass bowl rims, hundreds of them nested one behind the other like the bowls
 * of a glass harmonica, the view flying along their axis: every bowl belongs to a pitch class and its rim lights up
 * while that note sounds, the larger bowls the lower notes.  The rims are circles at even steps along a gently winding
 * axis, projected by their depth; each glows as a thin bright line with a soft sheen round it, fading in far ahead and
 * out as it passes the eye.  The rims are shades of one colour family from the photo, warming toward white while their
 * note sounds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> each rim lights while its pitch class sounds
 *   audioAdvance    -> the flight along the tunnel (integrated)
 *   audioSwell      -> the rims' sheen
 *
 * Knobs: spaceP (the rims' spacing), sizeP (the bowls' size), hueP.
//@params spaceP sizeP
//@audio audioChroma[12] audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sp = 0.18 + 0.12 * clamp(spaceP, 0.0, 1.0);
    float R0 = 0.5 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float fly = 0.25 * sceneTime + 1.0 * audioAdvance;
    float sheen = 0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec2 cam = 0.25 * vec2(sin(0.31 * fly), cos(0.23 * fly));
    vec3 col = famCol(fh, 0.45) * 0.012;
    float k0 = floor(fly / sp) + 1.0;
    for (int j = 0; j < 40; ++j) {
        float k = k0 + float(j);
        float dz = k * sp - fly;                                     // the rim's depth ahead of the eye
        float pc = mod(k * 7.0, 12.0);                               // the bowls follow the circle of fifths
        float note = clamp(audioChroma[int(pc + 0.5) % 12], 0.0, 1.0);
        float Rk = R0 * (1.25 - 0.04 * pc);
        vec2 cs = (0.25 * vec2(sin(0.31 * k * sp), cos(0.23 * k * sp)) - cam) / dz;
        float d = abs(length(p - cs) - Rk / dz);
        float w = 0.0015 + 0.003 / dz;
        float fade = smoothstep(0.0, 0.6, dz) * smoothstep(40.0 * sp, 34.0 * sp, dz) * exp(-0.1 * dz);
        float g = exp(-pow(d / w, 2.0)) + 0.25 * sheen * exp(-d / (6.0 * w));
        col += famLight(fh, pc / 11.0, 0.3 + 0.6 * note) * g * fade * (0.12 + 1.6 * note);
    }
    finish(col);
}

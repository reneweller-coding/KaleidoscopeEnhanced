//@doc
 * @brief SOLAR GRANULATION FIELD: the boiling skin of a star without the star -- an endless field of convection cells,
 * hot plasma welling up bright in the middle of each granule and sinking dark in the lanes between them; granules
 * swell, split in two and fade, the lanes closing over them, the whole field seething.  The louder the music, the
 * harder it boils: the cells grow brighter, the lanes deeper.  The photo tints the plasma.
 *
 * Audio Reactivity (structure, not only light):
 *   audioLevel      -> how hard the field boils: brighter granules, darker lanes
 *   audioAdvance    -> the granules evolve (integrated)
 *   audioKick       -> the brightest granules flare (light)
 *
 * Knobs: sizeP (the granules' size), laneP (the lanes' width), photoP (photo share), hueP.
//@params sizeP laneP photoP
//@audio audioKick
//@body
/**  The granulation: distance to the nearest and second-nearest of wandering cell centres (Worley), so each granule
 * is bright inside and the lanes between them dark.
 *
 * @param x  The point (in granule units). (in)
 * @param t  The field's time. (in)
 *
 * @return
 *   The nearest (x) and second-nearest (y) distance, the granule's hash (z).
 **/
vec3 granules(vec2 x, float t)
{
    vec2 c = floor(x);
    float d1 = 1e9, d2 = 1e9, hid = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = c + vec2(float(i), float(j));
        vec2 h = hash22(cc);
        // each centre wanders; a granule now and then splits (its centre swings out of the cell and back)
        vec2 o = 0.5 + 0.38 * vec2(sin(t * (0.6 + 0.5 * h.x) + 6.2831853 * h.y), cos(t * (0.5 + 0.6 * h.y) + 6.2831853 * h.x));
        float d = length(x - cc - o);
        if (d < d1) { d2 = d1; d1 = d; hid = hash21(cc); } else if (d < d2) d2 = d;
    }
    return vec3(d1, d2, hid);
}

void main()
{
    vec2 p = screenP();
    float sz = 0.07 + 0.05 * clamp(sizeP, 0.0, 1.0);
    float t = 0.25 * sceneTime + 0.8 * audioAdvance;
    vec2 x = p / sz + vec2(0.03, 0.01) * t;
    vec3 g = granules(x, t);
    vec3 g2 = granules(x * 2.3 + 7.1, t * 1.4);                  // the finer seething inside
    float lane = g.y - g.x;
    float lw = 0.12 + 0.2 * clamp(laneP, 0.0, 1.0);
    float boil = 0.5 + 0.8 * clamp(audioLevel, 0.0, 1.0);
    float bright = smoothstep(0.0, lw, lane) * (0.7 + 0.3 * smoothstep(0.7, 0.0, g.x)) * (0.85 + 0.3 * g.z);
    bright *= 0.85 + 0.15 * smoothstep(0.0, 0.15, g2.y - g2.x);
    vec3 photo = imgLod(p * 0.5 + 0.5, 2.0);
    vec3 hot = mix(vec3(1.0, 0.75, 0.35), photo * 1.5, 0.3 + 0.45 * clamp(photoP, 0.0, 1.0));
    vec3 tone = imgPalette(0.1 + 0.03 * audioPhase);
    vec3 col = mix(vec3(0.15, 0.05, 0.02) * (1.2 - 0.5 * boil), hot * mix(vec3(1.0), tone * 1.4, 0.2), bright * (0.6 + 0.5 * boil));
    col += hot * smoothstep(0.92, 1.0, g.z) * bright * 0.4 * clamp(audioKick, 0.0, 1.0);
    finish(col);
}

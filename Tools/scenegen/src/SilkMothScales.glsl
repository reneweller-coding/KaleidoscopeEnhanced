//@doc
 * @brief SILK MOTH SCALES: the scales of a moth's wing in macro, an endless shimmering field -- row on row of
 * overlapping scales like roof tiles, each a rounded blade with fine ridges along it, and on the ridges the thin-film
 * shimmer that makes wings iridescent, its colour turning with the angle of the light.  The wing flexes slowly, so
 * waves of shimmer roll across the rows; the photo gives the scales their pigment.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRolloff    -> the shimmer's strength (bright sound, bright sheen)
 *   audioAdvance    -> the wing flexes (integrated)
 *   audioKick       -> the ridges glint (light)
 *
 * Knobs: scaleP (the scales' size), ridgeP (the ridges' fineness), photoP (photo share), hueP.
//@params scaleP ridgeP photoP
//@audio audioRolloff audioKick
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.07 + 0.04 * clamp(scaleP, 0.0, 1.0);
    float flex = 0.3 * sceneTime + 1.0 * audioAdvance;
    vec2 q = p + vec2(0.0, 0.02 * sin(2.0 * p.x + 0.5 * flex));   // the wing's slow flex
    vec3 tone = imgPalette(0.5 + 0.03 * audioPhase);
    vec3 col = vec3(0.02);
    float row0 = floor(q.y / (S * 0.55));
    // rows overlap like tiles: draw the rows from the far (upper) one down, the nearer covering the farther
    for (int r = 2; r >= -1; --r) {
        float row = row0 + float(r);
        float off = mod(row, 2.0) * 0.5;
        float cx = floor(q.x / S - off + 0.5);
        for (int k = -1; k <= 1; ++k) {
            float c = cx + float(k);
            vec2 base = vec2((c + off) * S, row * S * 0.55);    // the scale's root
            vec2 d = q - base;
            // a rounded blade hanging down from its root
            vec2 b = d / vec2(S * 0.5, S * 0.85);
            float shape = length(vec2(b.x, max(-b.y, 0.0) * 0.9 + max(b.y, 0.0) * 3.0));
            if (b.y > 0.15 || shape > 1.0) continue;
            float edge = smoothstep(1.0, 0.85, shape);
            float h = hash21(vec2(c, row));
            float ridges = 0.5 + 0.5 * cos(b.x * (30.0 + 40.0 * clamp(ridgeP, 0.0, 1.0)) + 2.0 * h);
            // thin-film colour: the path difference with the tilt of the scale against the light
            float tilt = 0.5 + 0.5 * sin(1.7 * row + 0.8 * c + flex + 3.0 * h) + 0.3 * b.y;
            vec3 film = 0.5 + 0.5 * cos(6.2831853 * (tilt * 1.6 + vec3(0.0, 0.33, 0.67)));
            vec3 pig = imgLod(base * 0.5 + 0.5 + d * 0.5, 1.2);
            vec3 cs = mix(tone * 1.1, pig * 1.4, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.55 + 0.25 * ridges);
            float sheen = (0.15 + 0.7 * clamp(audioRolloff, 0.0, 1.0)) * ridges * smoothstep(0.3, 0.9, tilt);
            cs += film * sheen * 0.55 + vec3(1.0) * pow(ridges, 8.0) * 0.15 * clamp(audioKick, 0.0, 1.0);
            cs *= (0.5 + 0.5 * smoothstep(-1.0, -0.2, b.y)) * (0.75 + 0.5 * h);   // shade toward the tip, each scale its own
            cs *= 1.0 - 0.6 * smoothstep(0.75, 1.0, shape);     // the scale's dark rim
            col = mix(col, cs, edge);
        }
    }
    finish(col * 1.1);
}

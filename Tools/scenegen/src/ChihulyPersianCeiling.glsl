//@doc
 * @brief CHIHULY PERSIAN CEILING: an endless ceiling of coloured glass bowls seen from below, layered and overlapping,
 * lit from above: flared, ruffled shapes with ribs running out to thin bright rims, the light coming through them in
 * deep shades of one colour family while a soft brightness wanders over the ceiling behind.  Three layers of bowls,
 * each a jittered lattice turned its own way and drifting slowly at its own depth; a bowl is a disc whose rim ruffles
 * (its radius waves with the angle), with ribs in the angle and glass that thins toward the rim; the bowls filter the
 * light like coloured glass, so their overlaps deepen without any order.  The colours come from the photo, calmed
 * into one family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the bowls open: they widen and their rims ruffle deeper
 *   audioAdvance -> the light wanders over the ceiling and the layers drift (integrated)
 *
 * Knobs: bowlP (the bowls' size), ribP (how many ribs), hueP.
//@params bowlP ribP
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
    float S0 = 0.4 + 0.16 * clamp(bowlP, 0.0, 1.0);
    float nRib = floor(10.0 + 10.0 * clamp(ribP, 0.0, 1.0));
    float sw = clamp(audioSwell, 0.0, 1.0);
    float open = 0.85 + 0.25 * sw;
    float ruff = 0.05 + 0.1 * sw;
    float run = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec2 Lp = vec2(0.6 * sin(1.3 * run), 0.35 * cos(0.9 * run));
    vec3 light = famLight(fh, 0.5, 0.85) * (0.6 + 0.8 * exp(-dot(p - Lp, p - Lp) / 0.3));
    vec3 filt = vec3(1.0);
    vec3 rims = vec3(0.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float S = S0 * (1.0 - 0.15 * fl);
        vec2 q = rot2(0.3 + 0.9 * fl) * p / S + vec2(1.0, 0.4) * run * (0.6 - 0.12 * fl) * 3.0 + 7.1 * fl;
        vec2 gi = floor(q);
        for (int k = 0; k < 9; ++k) {
            vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
            float h = hash21(cell + 13.0 * fl);
            vec2 centre = cell + 0.5 + 0.35 * (hash22(cell + 5.0 * fl) - 0.5);
            vec2 d = q - centre;
            float r = length(d), an = atan(d.y, d.x);
            float R = 0.55 * open * (0.75 + 0.35 * h);
            float Rr = R * (1.0 + ruff * sin((5.0 + floor(4.0 * h)) * an + 6.2831853 * h + 0.5 * run));
            float x = r / Rr;
            if (x >= 1.0) continue;
            float alpha = smoothstep(1.0, 0.95, x) * 0.85;
            float ribs = 0.5 + 0.5 * cos(nRib * an + 6.2831853 * h);
            vec3 gc = mix(famCol(fh, h), tone(imgLod(centre * S * 0.5 + 0.5, 4.0), fh), 0.35);
            float thin = 0.35 + 0.65 * x * x;                         // the glass thins toward the rim
            filt *= mix(vec3(1.0), gc * (0.3 + 0.8 * thin) * (0.85 + 0.25 * ribs), alpha);
            rims += famLight(fh, h, 0.6) * smoothstep(0.86, 0.99, x) * alpha * 0.18;
        }
    }
    vec3 col = light * filt + rims * light;
    finish(col);
}

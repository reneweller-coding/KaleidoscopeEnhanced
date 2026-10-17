//@doc
 * @brief KLEINIAN QUASI-FUCHSIAN: the limit set of a Schottky group of circle inversions -- a necklace of circles
 * whose inversions, applied again and again, nest circles within circles.  While all the circles stand orthogonal
 * to one great circle, the limit set is that circle, perfectly round (the group is Fuchsian); as they are pushed off
 * it, the limit set breaks into a fractal Jordan curve, then a dust -- the deformation itself is the show.  Tiles of
 * the photo fill the nested discs, the limit set glows.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the deformation: every change of harmony pushes the circles further off (or back), gliding
 *   audioPhase      -> the necklace turns (integrated)
 *   audioSwell      -> the circles' size (they nearly touch in loud passages)
 *   audioKick       -> the limit set flashes (light)
 *
 * Knobs: beadsP (circles in the necklace: 4 to 8), bendP (the base deformation), photoP (photo share), hueP.
//@params beadsP bendP photoP
//@audio audioSwell audioKick audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    int n = 4 + int(4.99 * clamp(beadsP, 0.0, 1.0));
    float fn = float(n);
    float tri = abs(fract(max(audioHarmAdvance, 0.0) / 6.0) * 2.0 - 1.0);
    float bend = (0.15 + 0.6 * clamp(bendP, 0.0, 1.0)) * smoothstep(0.0, 1.0, tri);
    float spin = 0.03 * audioPhase + 0.02 * sceneTime;
    // circles orthogonal to the unit circle: centre at distance d, radius sqrt(d^2 - 1); pushed off by 'bend'
    float hseg = 3.14159265 / fn;
    float rad0 = tan(hseg) * (0.92 + 0.07 * clamp(audioSwell, 0.0, 1.0));
    vec2 z = p * 2.6;
    float depth = 0.0;
    vec2 last = vec2(0.0);
    for (int it = 0; it < 30; ++it) {
        bool moved = false;
        for (int k = 0; k < 8; ++k) {
            if (k >= n) break;
            float a = 2.0 * hseg * float(k) + spin;
            float dk = sqrt(1.0 + rad0 * rad0) * (1.0 + bend * 0.35 * sin(3.0 * a + 1.3 * float(k)));
            vec2 c = dk * vec2(cos(a), sin(a));
            float r = rad0 * (1.0 + bend * 0.25 * cos(2.0 * a));
            vec2 d = z - c;
            float dd = dot(d, d);
            if (dd < r * r) {
                z = c + d * (r * r / dd);                        // invert in the circle
                depth += 1.0;
                last = c;
                moved = true;
                break;
            }
        }
        if (!moved) break;
    }
    float dl = depth / 30.0;
    float hue = atan(last.y, last.x) / 6.2831853;
    vec2 uv = z * 0.25 + 0.5;
    vec3 photo = imgLod(uv, 0.5 + 2.0 * dl);
    vec3 tone = imgPalette(hue + 0.15 * depth + 0.03 * audioPhase);
    // the fundamental region dark, every generation of nested discs a step brighter in its own tone
    float gen = min(depth, 6.0) / 6.0;
    vec3 col = depth < 0.5 ? imgLod(p * 0.7 + 0.5, 2.0) * 0.12
                           : mix(tone * 1.3, photo * 1.2, 0.3 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.35 + 0.8 * gen);
    // the limit set: where the depth climbs fastest
    float lim = clamp(abs(dFdx(depth)) + abs(dFdy(depth)), 0.0, 3.0) / 3.0;
    col += mix(tone, vec3(1.0), 0.6) * (lim + smoothstep(0.3, 0.9, dl)) * 0.4 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

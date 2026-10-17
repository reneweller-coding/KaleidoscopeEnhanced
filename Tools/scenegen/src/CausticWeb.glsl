//@doc
 * @brief CAUSTIC WEB: an endless net of caustics, pure light without pool or water -- several layers of slowly
 * undulating refracting sheets stacked above the frame, each focusing the light into its own web of bright lines;
 * where the webs cross they flare.  The light carries the photo's colours, the dark between the lines its shadow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony adds a layer (two to five and round again; the new one fades in)
 *   audioBass       -> the sheets' wave height: the webs tighten into sharper lines
 *   audioPhase      -> the sheets drift (integrated)
 *   audioKick       -> the crossings flare (light)
 *
 * Knobs: scaleP (the cells' size), sharpP (how sharp the lines are), photoP (photo share), hueP.
//@params scaleP sharpP photoP
//@audio audioBass audioKick audioHarmAdvance
//@body
/**  One sheet's height: a few drifting waves.
 *
 * @param x  The point. (in)
 * @param i  The sheet. (in)
 *
 * @return
 *   The height.
 **/
float sheet(vec2 x, float i)
{
    float t = 0.15 * sceneTime + 0.04 * audioPhase;
    float h = 0.0;
    for (int j = 0; j < 4; ++j) {
        float fj = float(j);
        float a = 6.2831853 * hash11(i * 3.7 + fj * 1.3);
        vec2 d = vec2(cos(a), sin(a));
        float k = 6.0 + 5.0 * hash11(i * 5.1 + fj * 2.9);
        h += sin(k * dot(x, d) + t * (1.0 + 0.3 * fj) + 6.2831853 * hash11(i + fj * 7.7)) / k;
    }
    return h;
}
/**  The caustic brightness of one sheet at a point: light bent by the sheet's slope gathers where the refraction
 * map folds, i.e. where the determinant of its Jacobian (1 + D * Hessian of the height) goes to zero.
 *
 * @param x  The point. (in)
 * @param i  The sheet. (in)
 * @param D  The bending strength. (in)
 *
 * @return
 *   The light's density there.
 **/
float caustic(vec2 x, float i, float D)
{
    float e = 0.01;
    float h = sheet(x, i);
    float hxx = (sheet(x + vec2(e, 0.0), i) + sheet(x - vec2(e, 0.0), i) - 2.0 * h) / (e * e);
    float hyy = (sheet(x + vec2(0.0, e), i) + sheet(x - vec2(0.0, e), i) - 2.0 * h) / (e * e);
    float hxy = (sheet(x + vec2(e, e), i) - sheet(x + vec2(e, -e), i) - sheet(x + vec2(-e, e), i)
                 + sheet(x - vec2(e, e), i)) / (4.0 * e * e);
    float det = (1.0 + D * hxx) * (1.0 + D * hyy) - D * D * hxy * hxy;
    return 1.0 / max(abs(det), 0.04);
}

void main()
{
    vec2 p = screenP();
    float sc = 1.0 + 1.5 * clamp(scaleP, 0.0, 1.0);
    vec2 x = p * sc;
    float h = max(audioHarmAdvance, 0.0);
    float n = 2.0 + mod(floor(h), 4.0), nNext = 2.0 + mod(floor(h) + 1.0, 4.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    float D = (0.06 + 0.1 * clamp(audioBass, 0.0, 1.0)) * (0.7 + 0.6 * clamp(sharpP, 0.0, 1.0));
    float light = 0.0, cross = 1.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        float w = mix(fi < n ? 1.0 : 0.0, fi < nNext ? 1.0 : 0.0, g);   // layers fade in and out as the count changes
        if (w <= 0.0) continue;
        float c = caustic(x + vec2(fi * 0.37, fi * 0.21), fi, D);
        light += w * c;
        cross *= mix(1.0, c, w * 0.5);
    }
    light /= mix(n, nNext, g);
    float lit = 1.0 - exp(-light * 0.35);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 1.0);
    vec3 tone = imgPalette(0.15 + 0.3 * lit + 0.03 * audioPhase);
    vec3 col = photo * 0.12 + mix(tone * 1.3, photo * 1.6, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit;
    col += mix(tone, vec3(1.0), 0.7) * smoothstep(3.0, 12.0, cross) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

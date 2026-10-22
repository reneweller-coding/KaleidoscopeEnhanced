//@doc
 * @brief CIRCULAR RAINBOW MIST: full circular rainbows in a fine spray, from several light sources at once: each source
 * draws its pale primary ring, the fainter secondary ring outside it with the colours reversed, Alexander's darker band
 * between them, and the white supernumerary interference bands just inside the primary -- the rings of all sources
 * overlapping as the sources wander.  The primary sits at the bow's radius with its colours running from violet inside
 * to red outside, the secondary at 1.21 times the radius the other way round; the spray's fine texture carries them.
 * The bows are pale on a dark ground; the interference bands are white and a tone of the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the sources wander (integrated): the rings slide over one another
 *   audioSwell   -> the spray's brightness
 *
 * Knobs: sourceP (how many sources), sizeP (the bows' size), hueP.
//@params sourceP sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 2.0 * clamp(sourceP, 0.0, 1.0));
    float R = 0.3 + 0.15 * clamp(sizeP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float mist = (0.45 + 0.55 * fbm(7.0 * p + vec2(0.2 * run, -0.5 * run))) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = famCol(fh, 0.45) * 0.02 * mist;
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        vec2 c = vec2(0.7 * sin(run * (0.5 + 0.13 * fi) + 2.1 * fi), 0.35 * cos(run * (0.4 + 0.11 * fi) + 1.3 * fi));
        float r = length(p - c);
        float w = 0.05;
        float t1 = (r - R) / w;                                          // across the primary: violet inside, red outside
        float prim = exp(-t1 * t1 * 1.5);
        vec3 c1 = hsv2rgb(vec3(fract(0.78 - 0.78 * clamp(t1 * 0.5 + 0.5, 0.0, 1.0)), 0.35, 1.0));
        float t2 = (r - 1.21 * R) / (1.4 * w);                           // the secondary, reversed and fainter
        float sec = exp(-t2 * t2 * 1.5) * 0.4;
        vec3 c2 = hsv2rgb(vec3(fract(0.78 * clamp(t2 * 0.5 + 0.5, 0.0, 1.0)), 0.3, 1.0));
        float alex = smoothstep(R, R + w, r) * smoothstep(1.21 * R, 1.21 * R - w, r);
        float sup = 0.0;
        for (int k = 1; k <= 3; ++k) {
            float rk = R - w * (0.9 + 0.75 * float(k));
            sup += exp(-pow((r - rk) / (0.25 * w), 2.0)) * (0.5 / float(k));
        }
        col *= 1.0 - 0.25 * alex;
        col += (c1 * prim * 0.5 + c2 * sec * 0.5) * mist;
        col += mix(vec3(1.0), famLight(fh, 0.5, 0.4), 0.5) * sup * 0.35 * mist;
    }
    finish(famExpose(col, 1.10, 1.00, 0.00, fh));
}

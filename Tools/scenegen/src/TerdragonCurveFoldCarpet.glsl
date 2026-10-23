//@doc
 * @brief TERDRAGON CURVE FOLD CARPET: the terdragon curve: a fractal of threefold folding that fills a surface with hexagons; the photo lies in the folds, and the number of levels wanders.  The plane is folded by a threefold mirror, turned by thirty degrees and magnified by the square root of three, again and again; the
 * photo is read at the folded place, and two neighbouring depths are cross-faded.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of folding levels glides (smoothed)
 *   audioAdvance -> the carpet turns slowly (integrated)
 *
 * Knobs: sizeP (the zoom), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
vec2 fold3(vec2 p)
{
    float a = atan(p.y, p.x);
    float w = 2.0943951;
    float af = abs(mod(a + 0.5 * w, w) - 0.5 * w);
    return length(p) * vec2(cos(af), sin(af));
}
vec3 terd(vec2 p, int n, float rot)
{
    vec2 q = rot2(rot) * p;
    float sc = 1.0;
    for (int i = 0; i < 8; ++i) {
        if (i >= n) break;
        q = fold3(q);
        q = rot2(0.5235988) * (q * 1.7320508) - vec2(0.5, 0.0);
        sc *= 1.7320508;
    }
    return imgLod(q * 0.35 + 0.5, 0.6 + 0.0);
}
void main()
{
    vec2 p = screenP() * (0.8 + 1.0 * (1.0 - clamp(sizeP, 0.0, 1.0)));
    float nf = 2.0 + 4.0 * (0.5 + 0.5 * sin(0.04 * sceneTime)) * (0.5 + 0.5 * clamp(audioSpread, 0.0, 1.0)) + 1.0 * clamp(audioSpread, 0.0, 1.0);
    int n0 = int(floor(nf));
    float f = smoothstep(0.0, 1.0, fract(nf));
    float rot = 0.015 * audioAdvance + 0.02 * sceneTime;
    vec3 a = terd(p, n0, rot);
    vec3 b = terd(p, n0 + 1, rot);
    finish(mix(a, b, f) * 1.1);
}

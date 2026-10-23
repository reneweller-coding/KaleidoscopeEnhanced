//@doc
 * @brief CONTINUED FRACTION STRIPES: the continued fraction expansion of x as stripes: every digit a band, the bands narrowing toward the rational points; the picture is a stack of rows, the first showing the bands of the first
 * digit, the next those of the first two, and so on, and in every band the photo is laid in the band's own renormalised coordinate (the Gauss map), so the same picture repeats in all the bands, ever smaller -- the self-similarity of
 * the continued fractions.  The number of rows (digits) follows the swell, the picture slides slowly with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the number of digits shown (finer rows fading in)
 *   audioAdvance    -> the picture slides (integrated)
 *
 * Knobs: rowP (the height of the rows), hueP.
//@params rowP
//@audio audioSwell
//@body
/**  The Gauss map iterated: the renormalised coordinate after some digits.
 *
 * @param x  The coordinate in 0..1. (in)
 * @param n  The number of digits. (in)
 *
 * @return
 *   The coordinate (x after n steps) in x, the product of the digits in y.
 **/
vec2 gaussIter(float x, int n)
{
    float id = 0.0;
    for (int i = 0; i < 9; ++i) {
        if (i >= n) break;
        float inv = 1.0 / max(x, 0.0001);
        float a = floor(inv);
        id = fract(id * 0.618 + a * 0.317);
        x = inv - a;
    }
    return vec2(x, id);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float X = p.x / asp + 0.5 + 0.01 * audioAdvance + 0.003 * sceneTime;
    X = clamp(1.0 - abs(fract(X * 0.5) * 2.0 - 1.0), 0.0005, 0.9995);
    float rows = 5.0 + 3.0 * (0.4 + 0.6 * clamp(rowP, 0.0, 1.0)) + 2.0 * clamp(audioSwell, 0.0, 1.0);
    float yy = (0.5 - p.y) * rows;
    int dig = 1 + min(int(floor(yy)), 4);
    float fr = fract(yy);
    vec2 gi = gaussIter(X, dig);
    vec2 uv = vec2(0.1 + 0.8 * gi.x, p.y * 0.8 + 0.5);
    vec3 c = imgLod(uv, 0.9 + 0.5 * float(dig));
    float joint = smoothstep(0.0, 0.06, fr) * smoothstep(1.0, 0.94, fr);
    finish(c * (0.7 + 0.45 * gi.y) * (0.6 + 0.4 * joint) * 1.1);
}

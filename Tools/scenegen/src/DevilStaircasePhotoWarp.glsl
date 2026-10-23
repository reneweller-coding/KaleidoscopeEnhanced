//@doc
 * @brief DEVIL STAIRCASE PHOTO WARP: Cantor's devil's staircase as a coordinate: the photo stays unchanged over countless gaps and only moves on the dust, continuous and yet a staircase of plateaus; across the picture the photo
 * hangs in vertical curtains, flat in x on every plateau and sliding in y, the steps small and numberless.  The number of levels of the staircase follows the spectral spread (the finer steps come in smoothly), the staircase
 * drifts slowly with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the depth of the staircase (finer steps fading in)
 *   audioAdvance    -> the staircase drifts (integrated)
 *
 * Knobs: slopeP (how far the photo is carried by the staircase), hueP.
//@params slopeP
//@audio audioSpread
//@body
/**  Cantor's function on 0..1 evaluated to a whole number of levels, the rest of the way linear (continuous).
 *
 * @param x  The coordinate, 0..1. (in)
 * @param n  The number of levels, 0..9. (in)
 *
 * @return
 *   The staircase value, 0..1.
 **/
float cantorF(float x, int n)
{
    float c = 0.0, w = 0.5;
    for (int i = 0; i < 9; ++i) {
        if (i >= n) break;
        if (x < 1.0 / 3.0) x *= 3.0;
        else if (x < 2.0 / 3.0) return c + w;
        else { c += w; x = 3.0 * x - 2.0; }
        w *= 0.5;
    }
    return c + 2.0 * w * x;
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float X = p.x / asp + 0.5 + 0.02 * audioAdvance + 0.005 * sceneTime;
    X = 1.0 - abs(fract(X * 0.5) * 2.0 - 1.0);
    float D = 3.0 + 5.0 * clamp(audioSpread, 0.0, 1.0);
    int n0 = int(floor(D));
    float cx = mix(cantorF(X, n0), cantorF(X, n0 + 1), fract(D));
    float k = 0.5 + 1.1 * clamp(slopeP, 0.0, 1.0);
    vec2 uv = vec2((cx - 0.5) * k * asp * 0.8 + 0.5, p.y * 0.8 + 0.5);
    float step0 = abs(cantorF(X + 0.002, n0 + 1) - cantorF(X - 0.002, n0 + 1));
    finish(imgLod(uv, 0.7 + 1.0 * clamp(step0 * 30.0, 0.0, 2.0)) * 1.08);
}

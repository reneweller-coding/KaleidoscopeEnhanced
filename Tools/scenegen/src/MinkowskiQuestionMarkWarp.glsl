//@doc
 * @brief MINKOWSKI QUESTION MARK WARP: Minkowski's question mark function, the Stern-Brocot sequence of fractions as a continuous map: the photo is rearranged in one direction so that all the fractions land at simple places; there are
 * plateaus and knots at every rational, and the picture breaks up into curtains whose widths are those of continued fractions.  The depth follows the spectral spread (finer curtains fading in), the map drifts with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the depth (finer curtains fading in)
 *   audioAdvance    -> the map drifts (integrated)
 *
 * Knobs: slopeP (how far the photo is carried), hueP.
//@params slopeP
//@audio audioSpread
//@body
/**  Minkowski's question mark function ?(x), a number of Stern-Brocot steps deep.
 *
 * @param x  The coordinate, 0..1. (in)
 * @param D  The depth, real (the last step blended in). (in)
 *
 * @return
 *   ?(x), 0..1.
 **/
float questionMark(float x, float D)
{
    vec2 lo = vec2(0.0, 1.0), hi = vec2(1.0, 1.0);
    float rl = 0.0, rh = 1.0;
    float res = 0.5;
    for (int i = 0; i < 11; ++i) {
        float act = clamp(D - float(i), 0.0, 1.0);
        vec2 mid = lo + hi;
        float xm = mid.x / mid.y;
        float rm = 0.5 * (rl + rh);
        float nl = x < xm ? rl : rm, nh = x < xm ? rm : rh;
        if (x < xm) hi = mid; else lo = mid;
        rl = mix(rl, nl, act);
        rh = mix(rh, nh, act);
    }
    return 0.5 * (rl + rh);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float X = p.x / asp + 0.5 + 0.02 * audioAdvance + 0.005 * sceneTime;
    X = clamp(1.0 - abs(fract(X * 0.5) * 2.0 - 1.0), 0.0001, 0.9999);
    float D = 5.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float q = questionMark(X, D);
    float k = 0.6 + 1.2 * clamp(slopeP, 0.0, 1.0);
    vec2 uv = vec2((q - 0.5) * k * asp * 0.8 + 0.5, p.y * 0.8 + 0.5);
    finish(imgLod(uv, 0.9) * 1.08);
}

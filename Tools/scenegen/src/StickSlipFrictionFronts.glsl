//@doc
 * @brief STICK SLIP FRICTION FRONTS: stick-slip fronts: two surfaces that rub against each other stick and slip as fronts that run along the joint; the photo is shifted along the joint and tears in steps whose edges are soft.  Three joints cross the picture; along each, a smooth sawtooth of displacement runs, so the
 * part above slides one way and the part below the other, in small steps.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the friction: the size of the slips
 *   audioSpread  -> the number of fronts along the joint (smoothed)
 *
 * Knobs: sizeP (the width of the joints' influence), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
/**  A smooth sawtooth made of five harmonics.
 *
 * @param ph  The phase in cycles. (in)
 *
 * @return
 *   The value 0..1.
 **/
float saw6(float ph)
{
    float s = 0.0;
    for (int n = 1; n <= 5; ++n) s += sin(6.2831853 * float(n) * ph) / float(n);
    return 0.5 - s / 3.1415927;
}
void main()
{
    vec2 p = screenP();
    vec2 q = p;
    float A = 0.04 + 0.08 * clamp(audioSwell, 0.0, 1.0);
    float nf = 2.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float wd = 0.08 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float shade = 1.0;
    for (int j = 0; j < 3; ++j) {
        float fj = float(j);
        float y0 = (fj - 1.0) * 0.32 + 0.04 * sin(0.05 * sceneTime + fj * 2.0 + 3.0 * p.x);
        float side = smoothstep(-wd * 0.5, wd * 0.5, p.y - y0);
        float ph = nf * p.x * 0.5 - 0.04 * sceneTime * (1.0 + 0.3 * fj) + 0.3 * fj;
        float sh = A * (saw6(ph) - 0.5) * 2.0;
        q.x += (side - 0.5) * 2.0 * sh * (1.0 - smoothstep(0.0, 1.3, abs(p.y - y0) * 2.0));
        shade *= 1.0 - 0.45 * exp(-pow((p.y - y0) / 0.008, 2.0));
    }
    vec3 c = imgLod(q * 0.85 + 0.5, 0.5);
    finish(c * shade * 1.1);
}

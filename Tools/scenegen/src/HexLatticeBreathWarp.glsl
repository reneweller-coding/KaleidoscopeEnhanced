//@doc
 * @brief HEX LATTICE BREATH WARP: a hexagonal net whose points contract and expand in turn, like a honeycomb under pressure: neighbouring cells breathe a third of a breath apart, so that the photo, stretched on the net, swells and
 * shrinks cell by cell in a slow rolling pattern with soft walls between the cells.  The breathing runs once through every bar and its strength follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the breathing runs once a bar
 *   audioSwell      -> the strength of the breathing
 *
 * Knobs: cellP (the size of the cells), hueP.
//@params cellP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.2 - 0.09 * clamp(cellP, 0.0, 1.0);
    float qa = (0.57735 * p.x - 0.33333 * p.y) / s;
    float ra = (0.66667 * p.y) / s;
    vec3 cu = vec3(qa, -qa - ra, ra);
    vec3 rc = floor(cu + 0.5);
    vec3 df = abs(rc - cu);
    if (df.x > df.y && df.x > df.z) rc.x = -rc.y - rc.z;
    else if (df.y > df.z) rc.y = -rc.x - rc.z;
    else rc.z = -rc.x - rc.y;
    vec2 c0 = s * vec2(1.73205 * (rc.x + 0.5 * rc.z), 1.5 * rc.z);
    float bar = rhyBar();
    float amp = 0.3 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec2 D = vec2(0.0);
    float ws = 0.0;
    for (int k = -1; k < 6; ++k) {
        vec2 ck = c0;
        vec3 rk = rc;
        if (k >= 0) {
            float a = 1.0471976 * float(k);
            ck = c0 + s * 1.73205 * vec2(cos(a), sin(a));
        }
        float qk = (0.57735 * ck.x - 0.33333 * ck.y) / s, rk2 = (0.66667 * ck.y) / s;
        float col = mod(floor(qk + 0.5) - floor(rk2 + 0.5) + 30.0, 3.0);
        float b = amp * sin(6.2831853 * bar + 2.0943951 * col);
        float d2 = dot(p - ck, p - ck);
        float wk = exp(-d2 / (0.9 * s * s));
        D += wk * b * (p - ck);
        ws += wk;
    }
    D /= max(ws, 1e-4);
    vec3 c = imgLod((p + D) * 0.8 + 0.5, 0.7);
    float edge = smoothstep(0.0, 0.06 * s, 0.866 * s - length(p - c0)) ;
    finish(c * 1.08);
}

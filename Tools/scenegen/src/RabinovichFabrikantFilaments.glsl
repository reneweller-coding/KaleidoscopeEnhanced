//@doc
 * @brief RABINOVICH FABRIKANT FILAMENTS: the Rabinovich-Fabrikant system: a tangle of threads made of loops and sudden jumps; the photo lies on the threads as colour, and the parameter alpha glides through the threshold where the tangle tips over.  Six short trajectories are run with small steps
 * from places that wander slowly, and the threads are drawn as thin lines of the photo's colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the parameter alpha (over seconds)
 *   audioAdvance -> the view turns (integrated)
 *
 * Knobs: sizeP (the thickness of the threads), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The right-hand side of the Rabinovich-Fabrikant system.
 *
 * @param s  The state. (in)
 * @param al  The parameter alpha. (in)
 * @param ga  The parameter gamma. (in)
 *
 * @return
 *   The rate of change of the state.
 **/
vec3 rf(vec3 s, float al, float ga)
{
    return vec3(s.y * (s.z - 1.0 + s.x * s.x) + ga * s.x,
                s.x * (3.0 * s.z + 1.0 - s.x * s.x) + ga * s.y,
                -2.0 * s.z * (al + s.x * s.y));
}
void main()
{
    vec2 p = screenP();
    float al = 0.14 + 0.1 * clamp(audioSwell, 0.0, 1.0) + 0.02 * sin(0.03 * sceneTime);
    float ga = 0.1;
    float va = 0.03 * audioAdvance + 0.02 * sceneTime;
    mat2 R = rot2(va);
    float K = 1.0 / pow(0.01 + 0.01 * clamp(sizeP, 0.0, 1.0), 2.0);
    float acc = 0.0;
    float hh = 0.0;
    for (int o = 0; o < 8; ++o) {
        float fo = float(o);
        vec2 h = hash22(vec2(fo, 1.9));
        vec3 s = vec3(-1.0 + 2.0 * h.x, -1.0 + 2.0 * h.y, 0.5 + 0.4 * sin(6.28 * h.x));
        vec2 qp = vec2(1e3);
        for (int i = 0; i < 110; ++i) {
            vec3 k1 = rf(s, al, ga);
            vec3 k2 = rf(s + 0.005 * k1, al, ga);
            s += 0.01 * k2;
            s = clamp(s, vec3(-3.0), vec3(3.0));
            vec2 q = R * vec2(s.x * 0.27 + s.z * 0.06, s.y * 0.27 - s.z * 0.08);
            vec2 d = p - q;
            float g = exp(-dot(d, d) * K);
            vec2 dmid = p - 0.5 * (q + qp);
            g += exp(-dot(dmid, dmid) * K);
            qp = q;
            acc += g;
            hh += g * (0.5 + 0.5 * sin(0.4 * float(i) + fo));
        }
    }
    vec3 pc = imgLod(p * 0.85 + 0.5, 0.8);
    float dens = 1.0 - exp(-acc * 0.7);
    vec3 col = pc * 0.24 + pc * dens * 1.3 + vec3(1.0, 0.9, 0.7) * dens * 0.08;
    col *= 0.85 + 0.35 * (hh / max(acc, 1.0));
    finish(col);
}

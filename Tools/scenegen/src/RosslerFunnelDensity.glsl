//@doc
 * @brief ROSSLER FUNNEL DENSITY: the Rossler attractor as a funnel: a band that swings up and falls; the photo is multiplied by the density of the paths and shows a funnel of curved stripes.  Six trajectories of the equations, started where the band is, run for ninety steps each; the parameter c follows the
 * key, and the view turns.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the parameter c glides with the key (integrated)
 *   audioAdvance     -> the view turns (integrated)
 *
 * Knobs: sizeP (the thickness of the paths), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
/**  The right-hand side of the Roessler system.
 *
 * @param s  The state. (in)
 * @param c  The parameter c. (in)
 *
 * @return
 *   The rate of change of the state.
 **/
vec3 rossler(vec3 s, float c)
{
    return vec3(-s.y - s.z, s.x + 0.2 * s.y, 0.2 + s.z * (s.x - c));
}
void main()
{
    vec2 p = screenP();
    float c = 5.7 + 1.5 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float va = 0.03 * audioAdvance + 0.02 * sceneTime;
    mat2 R = rot2(va);
    float K = 1.0 / pow(0.013 + 0.013 * clamp(sizeP, 0.0, 1.0), 2.0);
    float acc = 0.0;
    float hh = 0.0;
    for (int o = 0; o < 6; ++o) {
        float fo = float(o);
        vec2 h = hash22(vec2(fo, 2.7));
        vec3 s = vec3(3.0 + 5.0 * h.x, -4.0 * h.y, 0.5 * h.y);
        s.xy = rot2(6.2831853 * h.x) * s.xy;
        vec2 qp = vec2(1e3);
        for (int i = 0; i < 90; ++i) {
            vec3 k1 = rossler(s, c);
            vec3 k2 = rossler(s + 0.03 * k1, c);
            s += 0.06 * k2;
            float ang = atan(s.y, s.x);
            vec2 q = R * vec2(s.x * 0.05, s.y * 0.035 + s.z * 0.025);
            vec2 d = p - q;
            float g = exp(-dot(d, d) * K);
            vec2 dmid = p - 0.5 * (q + qp);
            g += exp(-dot(dmid, dmid) * K);
            qp = q;
            acc += g;
            hh += g * (0.5 + 0.5 * sin(ang));
        }
    }
    vec3 ph = imgLod(p * 0.85 + 0.5, 0.8);
    float dens = 1.0 - exp(-acc * 0.5);
    vec3 col = ph * 0.24 + ph * dens * 1.3;
    col *= 0.8 + 0.4 * (hh / max(acc, 1.0));
    finish(col);
}

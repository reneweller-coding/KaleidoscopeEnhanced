//@doc
 * @brief CHUA DOUBLE SCROLL DENSITY: Chua's circuit: an attractor with two spiral arms, shown as a density; the photo is smeared along the paths so that two spirals of photo colour fill the picture.  Six trajectories of the circuit's equations start from places that wander slowly, run for seventy steps,
 * and light the pixels they pass; the view turns slowly round the vertical axis.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the parameters glide between curling in and the double scroll (integrated)
 *   audioAdvance     -> the view turns (integrated)
 *
 * Knobs: sizeP (the thickness of the paths), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec3 chua(vec3 s, float al, float be)
{
    float m0 = -1.143;
    float m1 = -0.714;
    float f = m1 * s.x + 0.5 * (m0 - m1) * (abs(s.x + 1.0) - abs(s.x - 1.0));
    return vec3(al * (s.y - s.x - f), s.x - s.y + s.z, -be * s.y);
}
void main()
{
    vec2 p = screenP();
    float al = 15.6 + 1.2 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float be = 28.0 - 3.0 * sin(0.03 * audioHarmAdvance);
    float va = 0.03 * audioAdvance + 0.02 * sceneTime;
    mat2 R = rot2(va);
    float K = 1.0 / pow(0.013 + 0.013 * clamp(sizeP, 0.0, 1.0), 2.0);
    float acc = 0.0;
    vec3 colacc = vec3(0.0);
    for (int o = 0; o < 6; ++o) {
        float fo = float(o);
        vec2 h = hash22(vec2(fo, 8.1));
        vec3 s = vec3(-1.6 + 3.2 * h.x + 0.1 * sin(0.05 * sceneTime + fo), 0.1 * (h.y - 0.5), -2.0 + 4.0 * h.y);
        vec2 qp = vec2(1e3);
        for (int i = 0; i < 70; ++i) {
            vec3 k1 = chua(s, al, be);
            vec3 k2 = chua(s + 0.015 * k1, al, be);
            s += 0.03 * k2;
            vec2 q = R * vec2(s.x * 0.2, s.z * 0.12 + s.y * 0.35);
            vec2 d = p - q;
            float g = exp(-dot(d, d) * K);
            vec2 dmid = p - 0.5 * (q + qp);
            g += exp(-dot(dmid, dmid) * K);
            qp = q;
            acc += g;
            colacc += g * hsv2rgb(vec3(fract(0.08 * fo + 0.012 * float(i)), 0.4, 1.0));
        }
    }
    vec3 ph = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col = ph * 0.24 + ph * (1.0 - exp(-acc * 0.5)) * 1.2 + colacc / max(acc, 1.0) * (1.0 - exp(-acc * 0.5)) * 0.12;
    finish(col);
}

//@doc
 * @brief SPROTT SIMPLEST FLOW DENSITY: Sprott's simplest chaotic flows: algebraically minimal equations with attractors of the most various shapes; the photo is smeared along the paths, and the set of coefficients glides between four flows.  The four flows are mixed linearly by weights that follow the key, so
 * the attractor deforms from one to the next without a jump.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mixture of the four flows glides (integrated)
 *   audioAdvance     -> the view turns (integrated)
 *
 * Knobs: sizeP (the thickness of the paths), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec3 sprott(vec3 s, vec4 w)
{
    vec3 a = vec3(s.y, -s.x + s.y * s.z, 1.0 - s.y * s.y);
    vec3 b = vec3(s.y * s.z, s.x - s.y, 1.0 - s.x * s.y);
    vec3 c = vec3(s.y * s.z, s.x - s.y, 1.0 - s.x * s.x);
    vec3 d = vec3(-s.y, s.x + s.z, s.x * s.z + 3.0 * s.y * s.y);
    return w.x * a + w.y * b + w.z * c + w.w * d;
}
void main()
{
    vec2 p = screenP();
    float ph = 0.05 * audioHarmAdvance + 0.015 * sceneTime;
    vec4 w = vec4(0.0);
    float i0 = floor(ph);
    float f = smoothstep(0.0, 1.0, fract(ph));
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float wa = (mod(i0, 4.0) == fk) ? 1.0 - f : 0.0;
        float wb = (mod(i0 + 1.0, 4.0) == fk) ? f : 0.0;
        w[k] = wa + wb;
    }
    float va = 0.03 * audioAdvance + 0.02 * sceneTime;
    mat2 R = rot2(va);
    float K = 1.0 / pow(0.013 + 0.013 * clamp(sizeP, 0.0, 1.0), 2.0);
    float acc = 0.0;
    float hh = 0.0;
    for (int o = 0; o < 6; ++o) {
        float fo = float(o);
        vec2 h = hash22(vec2(fo, 5.5));
        vec3 s = vec3(-1.0 + 2.0 * h.x, 0.5 * (h.y - 0.5), 1.0 + (h.y - 0.5));
        vec2 qp = vec2(1e3);
        for (int i = 0; i < 90; ++i) {
            vec3 k1 = sprott(s, w);
            vec3 k2 = sprott(s + 0.025 * k1, w);
            s += 0.05 * k2;
            s = clamp(s, vec3(-8.0), vec3(8.0));
            vec2 q = R * vec2(s.x * 0.12 + s.z * 0.03, s.y * 0.12);
            vec2 d = p - q;
            float g = exp(-dot(d, d) * K);
            vec2 dmid = p - 0.5 * (q + qp);
            g += exp(-dot(dmid, dmid) * K);
            qp = q;
            acc += g;
            hh += g * (0.5 + 0.5 * sin(0.7 * float(i) + fo));
        }
    }
    vec3 pc = imgLod(p * 0.85 + 0.5, 0.8);
    float dens = 1.0 - exp(-acc * 0.5);
    vec3 col = pc * 0.24 + pc * dens * 1.3;
    col *= 0.8 + 0.4 * (hh / max(acc, 1.0));
    finish(col);
}

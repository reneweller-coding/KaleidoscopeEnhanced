//@doc
 * @brief ANALEMMA ROSETTE YEAR: the analemma: the figure of eight that the sun draws over a year at the same hour of the day; the picture shows many figures of eight, shifted and turned, in a lattice of rosettes, with the photo as the sky.  Twenty-four lemniscates of Gerono stand on a ring, each turned
 * outwards, and the ring turns slowly; every figure is drawn as a fine line in the photo's colour with a bright dot that runs round it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of figures in force glides (integrated)
 *   audioAdvance     -> the rosette turns and the dots run round (integrated)
 *
 * Knobs: sizeP (the size of the figures), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float rot = 0.02 * audioAdvance + 0.015 * sceneTime;
    float S = 0.12 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float R0 = 0.28 + 0.06 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.8) * 0.25;
    float cnt = 14.0 + 10.0 * (0.5 + 0.5 * sin(0.05 * audioHarmAdvance));
    for (int k = 0; k < 24; ++k) {
        float fk = float(k);
        float on = clamp(cnt - fk, 0.0, 1.0);
        if (on <= 0.0) continue;
        float a = 6.2831853 * fk / cnt + rot;
        vec2 cen = R0 * vec2(cos(a), sin(a));
        vec2 q = rot2(-a) * (p - cen) / S;
        float F = q.x * q.x * q.x * q.x - q.x * q.x + q.y * q.y * 2.0;
        vec2 gr = vec2(4.0 * q.x * q.x * q.x - 2.0 * q.x, 4.0 * q.y);
        float d = abs(F) / max(length(gr), 1e-3) * S;
        float line = 1.0 - smoothstep(0.002, 0.007, d);
        float tp = 0.4 * audioAdvance * 0.1 + 0.2 * sceneTime + fk;
        vec2 dot_ = S * vec2(sin(tp), 0.5 * sin(2.0 * tp) * 0.7071);
        float dd = length(q * S - dot_);
        float bl = exp(-dd * dd / 0.00012);
        vec3 c = imgLod(cen * 0.85 + 0.5, 1.0);
        c = mix(vec3(luma(c)), c, 1.5) * 1.5 + 0.1;
        col = mix(col, c, line * 0.9 * on);
        col += vec3(1.0, 0.9, 0.6) * bl * on * 0.8;
    }
    finish(col);
}

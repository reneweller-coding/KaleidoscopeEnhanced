//@doc
 * @brief ELECTROWETTING DROPLET ARRAY: electrowetting: a lattice of electrodes moves drops from field to field; the picture shows drops of photo that move on a lattice, merge and split.  Each lattice cell holds a drop that hops to a neighbouring cell in soft steps; where two drops touch, they fuse by their field, and every
 * drop is a lens on the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the size of the drops
 *   audioAdvance -> the hopping goes on (integrated)
 *
 * Knobs: sizeP (the size of the electrodes), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.16 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    float t = 0.1 * audioAdvance + 0.15 * sceneTime;
    float field = 0.0;
    vec2 cen = vec2(0.0);
    float wsum = 0.0;
    float rr = 0.26 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            float hp = t + h.x * 4.0;
            float k = floor(hp);
            float fr = smoothstep(0.55, 0.95, fract(hp));
            float hh = hash21(cj + k * 3.7);
            vec2 dir = hh < 0.25 ? vec2(1.0, 0.0) : (hh < 0.5 ? vec2(-1.0, 0.0) : (hh < 0.75 ? vec2(0.0, 1.0) : vec2(0.0, -1.0)));
            float alive = step(0.25, hash21(cj + 7.0));
            vec2 pt = cj + 0.5 + dir * fr;
            vec2 d = g - pt;
            float fl = alive * exp(-dot(d, d) / (rr * rr) * 1.6);
            field += fl;
            cen += pt * fl;
            wsum += fl;
        }
    cen /= max(wsum, 1e-3);
    float inside = smoothstep(0.42, 0.5, field);
    float gridl = 1.0 - smoothstep(0.0, 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 bg = imgLod(p * 0.85 + 0.5, 0.8);
    vec2 magn = (cen * S) * 0.85 + 0.5 - (g - cen) * S * 0.85 * 1.4;
    vec3 lens = imgLod(magn, 0.6);
    lens = mix(vec3(luma(lens)), lens, 1.35);
    vec3 col = bg * 0.45 + vec3(0.3, 0.35, 0.4) * gridl * 0.25;
    col = mix(col, lens * 1.25, inside);
    finish(col);
}

//@doc
 * @brief DROPLET COALESCENCE BRIDGES: coalescence of droplets: bridges arise and grow, the drops pull together; the picture is a field of drops on the photo that touch and merge in a continual cycle.  A lattice of drop pairs, each pair moving together and apart again as the phrase runs; the metaball field of the
 * two makes the bridge, every drop is a little lens that shows the photo magnified and upside down.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the cycle of approaching, merging and parting (periodic)
 *   audioSwell     -> the size of the drops
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.17 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float field = 0.0;
    vec2 cen = vec2(0.0);
    float wsum = 0.0;
    float rsz = 0.2 + 0.08 * clamp(audioSwell, 0.0, 1.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 c0 = cj + 0.5 + 0.15 * (h - 0.5) * 2.0;
            float ph = fract(audioPhrasePos * 2.0 + h.x);
            float app = 0.5 - 0.5 * cos(6.2831853 * ph);
            vec2 dir = vec2(cos(6.2831853 * h.y), sin(6.2831853 * h.y));
            float sep = mix(0.5, 0.06, app);
            for (int s = 0; s < 2; ++s) {
                vec2 pt = c0 + (s == 0 ? 1.0 : -1.0) * 0.5 * sep * dir;
                float rr = rsz * (0.8 + 0.4 * h.x);
                vec2 d = g - pt;
                float f = exp(-dot(d, d) / (rr * rr) * 1.6);
                field += f;
                cen += pt * f;
                wsum += f;
            }
        }
    cen /= max(wsum, 1e-3);
    float inside = smoothstep(0.42, 0.5, field);
    vec2 loc = (g - cen);
    vec2 uv = p * 0.85 + 0.5;
    vec2 magn = (cen * S) * 0.85 + 0.5 - (g - cen) * S * 0.85 * 1.3;
    vec3 lens = imgLod(magn, 0.6);
    lens = mix(vec3(luma(lens)), lens, 1.3);
    vec3 bg = imgLod(uv, 0.7);
    float edge = smoothstep(0.42, 0.5, field) * (1.0 - smoothstep(0.5, 0.7, field));
    float lit = 0.8 + 0.4 * clamp(dot(normalize(vec3(loc, 0.8)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    vec3 col = mix(bg * 0.65, lens * lit * 1.2, inside) + vec3(1.0) * edge * 0.15;
    finish(col);
}

//@doc
 * @brief JAMMING FORCE CHAINS: jammed granular matter: forces run in chains through packings, visible as bright branches (by photoelasticity); the photo lies as the grains, and the chains shift.  A jittered lattice of round grains in the photo's colours; between touching grains the contact lines light up where a
 * ridge field (the load) is strong, and the field slowly changes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the load: more contacts light up and brighter
 *   audioAdvance -> the chains shift (integrated)
 *
 * Knobs: sizeP (the size of the grains), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
float ridgeF(vec2 q, float t)
{
    float a = abs(fbm(q * 3.0 + vec2(0.0, 0.03 * t)) - 0.5) * 2.0;
    float b = abs(fbm(q * 6.5 + vec2(4.0, -0.04 * t)) - 0.5) * 2.0;
    return 1.0 - min(a, b * 1.2);
}
void main()
{
    vec2 p = screenP();
    float S = 0.06 + 0.04 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    float row = floor(q.y / 0.866);
    vec2 g = vec2(q.x + 0.5 * mod(row, 2.0), q.y / 0.866);
    vec2 gi = floor(g);
    float t = 0.5 * audioAdvance + 0.5 * sceneTime;
    float load = 0.4 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.03, 0.03, 0.04);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 Cj = vec2((cj.x - 0.5 * mod(cj.y, 2.0) + 0.5 + 0.18 * (h.x - 0.5) * 2.0), (cj.y + 0.5 + 0.18 * (h.y - 0.5) * 2.0) * 0.866) * S;
            float d = length(p - Cj) / (S * 0.46);
            float inside = 1.0 - smoothstep(0.92, 1.0, d);
            vec3 c = imgLod(Cj * 0.85 + 0.5, 1.2);
            c = mix(vec3(luma(c)), c, 1.3);
            vec2 lp = (p - Cj) / (S * 0.46);
            float lit = 0.5 + 0.5 * clamp(dot(normalize(vec3(lp, sqrt(max(1.0 - dot(lp, lp), 0.0)))), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
            col = mix(col, c * lit * 0.8, inside);
            for (int e = 0; e < 3; ++e) {
                vec2 o = e == 0 ? vec2(1.0, 0.0) : (e == 1 ? vec2(0.5, 1.0) : vec2(-0.5, 1.0));
                vec2 cn = cj + o;
                vec2 hn = hash22(cn);
                vec2 Cn = vec2((cn.x - 0.5 * mod(cn.y, 2.0) + 0.5 + 0.18 * (hn.x - 0.5) * 2.0), (cn.y + 0.5 + 0.18 * (hn.y - 0.5) * 2.0) * 0.866) * S;
                vec2 mid = 0.5 * (Cj + Cn);
                float rg = ridgeF(mid, t);
                float on = smoothstep(1.0 - load * 0.55, 1.0 - load * 0.55 + 0.12, rg);
                float dl = sdSeg(p, Cj, Cn);
                float line = (1.0 - smoothstep(S * 0.012, S * 0.045, dl)) * on;
                col += vec3(1.0, 0.85, 0.55) * line * 1.1;
            }
        }
    finish(col * 1.1);
}

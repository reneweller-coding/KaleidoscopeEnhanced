//@doc
 * @brief COMPASS NEEDLE FIELD: thousands of small glowing compass needles cover the picture, each turning to the field
 * of a few wandering magnets, so the whole field of needles swirls into loops and fans that follow the magnets about;
 * the number of magnets follows the chord's notes.  The needles sit on a hexagonal lattice; each points along the summed
 * dipole field at its centre, (3 (m . r^) r^ - m) / |r|^3, its north half bright and its south half dim; a magnet that
 * fades in or out weighs in gradually, so the needles turn smoothly.  The needles are shades of one colour family from
 * the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> the number of magnets: one for each strongly sounding note (each fades in and out)
 *   audioAdvance    -> the magnets wander (integrated)
 *   audioSwell      -> the needles' glow
 *
 * Knobs: needleP (the needles' spacing), magnetP (how strong the magnets are against the background field), hueP.
//@params needleP magnetP
//@audio audioChroma[12] audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.04 + 0.025 * clamp(needleP, 0.0, 1.0);
    float strength = 0.4 + 0.8 * clamp(magnetP, 0.0, 1.0);
    float nl = 0.0;
    for (int k = 0; k < 12; ++k) nl += smoothstep(0.45, 0.75, audioChroma[k]);
    float n = clamp(nl, 1.0, 5.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    vec2 c = (g - q) * S;
    // the field at the needle's centre: a weak background plus the magnets' dipole fields
    vec2 B = vec2(0.05, 0.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float w = clamp(n - fi, 0.0, 1.0);
        if (w <= 0.0) break;
        vec2 mc = vec2(0.7 * sin(run * (0.5 + 0.13 * fi) + 2.1 * fi), 0.35 * cos(run * (0.4 + 0.11 * fi) + 1.3 * fi));
        float ma = 0.5 * run + 1.9 * fi;
        vec2 m = vec2(cos(ma), sin(ma)) * strength * 0.01;
        vec2 r = c - mc;
        float rl = max(length(r), 0.03);
        vec2 rh = r / rl;
        B += w * (3.0 * dot(m, rh) * rh - m) / (rl * rl * rl);
    }
    vec2 dir = normalize(B + 1e-6);
    vec2 lq = q * S;
    float along = dot(lq, dir), across = dot(lq, vec2(-dir.y, dir.x));
    float len = 0.42 * S, wid = 0.08 * S;
    float inside = smoothstep(0.0, 0.0008, wid * (1.0 - abs(along) / len) - abs(across));
    float north = step(0.0, along);
    float hn = hash21(floor((g - q) * 2.0 + 0.5));
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += mix(famCol(fh, 0.3 + 0.2 * hn) * 0.25, famLight(fh, 0.5 + 0.2 * hn, 0.5), north) * inside * glow;
    col += famLight(fh, 0.5, 0.6) * exp(-dot(lq, lq) / (0.0000025)) * 0.3;   // the pivot
    finish(col);
}

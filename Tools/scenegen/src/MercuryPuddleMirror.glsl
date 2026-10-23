//@doc
 * @brief MERCURY PUDDLE MIRROR: a field of mercury drops as mirrors: the photo bulges in every drop, and drops run together into larger ones that spread the picture wide;
 * the metal between them is dark, the edges of the drops catch a bright rim.  The drops drift and merge as the music swells.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the drops' size (they merge as they grow)
 *   audioAdvance    -> the drops drift (integrated)
 *
 * Knobs: dropsP (how many drops), hueP.
//@params dropsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioAdvance;
    int n = 9 + int(7.0 * clamp(dropsP, 0.0, 1.0));
    float F = 0.0;
    vec2 g = vec2(0.0);
    float R = 0.15 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    for (int i = 0; i < 16; ++i) {
        if (i >= n) break;
        float fi = float(i);
        vec2 c = vec2(1.5 * (hash11(fi * 3.1) - 0.5) + 0.12 * sin(t + fi), 0.8 * (hash11(fi * 7.3) - 0.5) + 0.1 * cos(0.8 * t + 2.0 * fi));
        vec2 d = p - c;
        float k = exp(-dot(d, d) / (R * R));
        F += k;
        g += -2.0 * d / (R * R) * k;
    }
    float inside = smoothstep(0.25, 0.4, F);
    vec3 nrm = normalize(vec3(-g * 0.22, 1.0));
    vec3 rf = reflect(vec3(0.0, 0.0, -1.0), nrm);
    vec3 col = imgLod(rf.xy * 0.7 + 0.5, 0.6) * (0.7 + 0.5 * nrm.z) * inside;
    float rim = smoothstep(0.2, 0.3, F) * (1.0 - smoothstep(0.4, 0.6, F));
    col += rim * 0.5;
    col += (1.0 - inside) * imgLod(p * 0.8 + 0.5, 3.0) * 0.32;
    finish(col * 1.05);
}

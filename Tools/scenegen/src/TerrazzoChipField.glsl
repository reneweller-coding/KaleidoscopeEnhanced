//@doc
 * @brief TERRAZZO CHIP FIELD: terrazzo: a floor of chips in many polygon shapes, every chip in the photo's colour at its place, laid in mortar and polished; the chips drift and turn slowly, the
 * polish catching a travelling gloss.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the chips' size
 *   audioSwell      -> the gloss
 *   audioAdvance    -> the chips drift (integrated)
 *
 * Knobs: chipsP (how many chips), mortarP (how much mortar), hueP.
//@params chipsP mortarP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.03 * sceneTime + 0.25 * audioAdvance;
    float N = (4.0 + 6.0 * clamp(chipsP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N + vec2(sin(t), cos(0.8 * t));
    vec2 g = floor(q);
    float d1 = 9.0, d2 = 9.0;
    vec2 cg = vec2(0.0), pt = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 gg = g + vec2(float(i), float(j));
            vec2 ptt = gg + 0.15 + 0.7 * hash22(gg);
            float d = length(q - ptt);
            if (d < d1) { d2 = d1; d1 = d; cg = gg; pt = ptt; } else if (d < d2) d2 = d;
        }
    }
    vec3 c = imgLod((pt - vec2(sin(t), cos(0.8 * t))) / N * 0.8 + 0.5, 1.5);
    float chip = smoothstep(0.02 + 0.06 * clamp(mortarP, 0.0, 1.0), 0.07 + 0.08 * clamp(mortarP, 0.0, 1.0), (d2 - d1) * 0.5);
    vec3 mortar = vec3(0.72, 0.7, 0.66) * (0.8 + 0.3 * noise2(p * 120.0)) * (0.5 + 0.7 * imgLod(uv, 4.5));
    float speck = 0.9 + 0.2 * noise2(q * 14.0 + cg * 5.0);
    float gloss = exp(-pow((p.x * 0.5 + p.y - 0.6 * sin(0.2 * t * 10.0)) / 0.25, 2.0)) * (0.1 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = mix(mortar, c * 1.15 * speck, chip) + gloss * chip;
    finish(col);
}

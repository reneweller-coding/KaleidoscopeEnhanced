//@doc
 * @brief CHANDELIER CRYSTAL DROPS: rows of crystal drops hanging in a chandelier: every drop bends the photo into a beam, turns it over and scatters points of light; the rows sway and
 * the drops catch the picture behind them, one after another, while between them it shows dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the swaying of the rows (integrated)
 *   audioSwell      -> the drops' brightness and size
 *
 * Knobs: dropsP (how many drops per row), hueP.
//@params dropsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.15 * sceneTime + 1.2 * audioPhase;
    float N = 8.0 + 10.0 * clamp(dropsP, 0.0, 1.0);
    vec3 col = imgLod(uv, 2.5) * 0.55;
    vec3 glint = vec3(0.0);
    for (int row = 0; row < 4; ++row) {
        float fr = float(row);
        float ry = 0.35 - 0.2 * fr;
        float sway = 0.04 * sin(t * (0.8 + 0.2 * fr) + fr);
        float xq = (p.x + sway) * N * 0.7 + 0.5 * fr;
        float i = floor(xq);
        float fx = fract(xq) - 0.5;
        float len = 0.12 + 0.05 * hash21(vec2(i, fr));
        vec2 d = vec2(fx / (N * 0.7) * 1.0, p.y - (ry - len * 0.5));
        float rx = 0.018 * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
        float shape = smoothstep(1.0, 0.8, length(vec2(d.x / rx, d.y / (len * 0.5))));
        if (shape > 0.0) {
            vec2 l = vec2(d.x / rx, d.y / (len * 0.5));
            vec2 uv2 = vec2(0.5) - vec2(l.x * 0.2, -l.y * 0.3) - (p * 0.8 + 0.5 - 0.5) * 0.5 * 0.0 + (uv - 0.5) * 0.5;
            col = mix(col, imgLod(uv2, 0.8) * 1.4, shape);
            glint += shape * smoothstep(0.7, 0.9, hash21(vec2(i * 3.1, fr + floor(t * 3.0)))) * 0.4;
        }
    }
    finish(col + glint);
}

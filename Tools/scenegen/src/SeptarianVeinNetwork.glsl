//@doc
 * @brief SEPTARIAN VEIN NETWORK: a clay nodule with veins of calcite: a net of cracks cuts the photo into polygons, and in the veins the light shines golden; the veins heal over and tear open again, each in its own time, so the
 * network never stays the same.  The number of veins follows the swell, the polygons are pieces of the photo, slightly displaced across the cracks.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the number of veins that are open
 *   audioAdvance    -> the veins heal and tear (integrated)
 *
 * Knobs: cellP (the size of the polygons), hueP.
//@params cellP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 3.5 + 6.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    vec2 q = p * N;
    vec2 g = floor(q);
    float d1 = 9.0, d2 = 9.0;
    vec2 pt = vec2(0.0), g1 = vec2(0.0), g2 = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 gg = g + vec2(float(i), float(j));
            vec2 ptt = gg + 0.15 + 0.7 * hash22(gg);
            float d = length(q - ptt);
            if (d < d1) { d2 = d1; g2 = g1; d1 = d; g1 = gg; pt = ptt; } else if (d < d2) { d2 = d; g2 = gg; }
        }
    }
    float w = (d2 - d1) * 0.5;
    float hv = hash21(g1 + g2 + 0.37 * abs(g1 - g2));
    float cyc = 0.5 + 0.5 * sin(0.2 * sceneTime + 0.15 * audioAdvance + 6.2831853 * hv);
    float open = smoothstep(0.55, 0.25, hv - 0.5 * clamp(audioSwell, 0.0, 1.0) + 0.45 * (1.0 - cyc));
    float vein = smoothstep(0.1, 0.0, w - 0.02 * open) * open;
    vec2 off = (hash22(g1 + 3.0) - 0.5) * 0.05;
    vec3 c = imgLod((p + off) * 0.8 + 0.5, 0.9);
    float crack = smoothstep(0.0, 0.1, w);
    vec3 glow = mix(vec3(1.0, 0.8, 0.4), imgLod(p * 0.8 + 0.5, 3.0), 0.35);
    finish(c * (0.45 + 0.55 * crack) * 1.05 + vein * glow * 0.9);
}

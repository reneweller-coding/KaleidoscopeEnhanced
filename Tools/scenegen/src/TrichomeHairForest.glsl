//@doc
 * @brief TRICHOME HAIR FOREST: plant hairs: hairs of different kinds (pointed, star-shaped, glandular) cover a surface; the photo colours them, and a wind from the side lays them down in waves.  A jittered lattice carries one hair per cell: a single spike, a star of three arms or a stalk with a gland at the
 * tip; every hair leans with the wind wave that runs across the field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the wind wave runs across (integrated)
 *   audioSpread      -> the number of waves in the wind (smoothed)
 *
 * Knobs: sizeP (the size of the hairs), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.09 + 0.07 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.0) * 0.4;
    float kw = 2.0 + 3.0 * clamp(audioSpread, 0.0, 1.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 B = (cj + 0.5 + 0.4 * (h - 0.5) * 2.0) * S;
            float wind = sin(kw * B.x - 0.1 * audioAdvance - 0.2 * sceneTime + 1.5 * B.y);
            float typ = hash21(cj + 4.0);
            float L = S * (0.7 + 0.6 * h.x);
            vec2 lean = vec2(0.45 * wind * L, 0.0);
            vec3 c = imgLod(B * 0.85 + 0.5, 1.3);
            c = mix(vec3(luma(c)), c, 1.4);
            float d;
            float w = S * 0.045;
            if (typ < 0.4) {
                vec2 T = B + vec2(0.0, L) + lean;
                d = sdSeg(p, B, T);
            } else if (typ < 0.75) {
                d = 1e3;
                for (int a = 0; a < 3; ++a) {
                    float an = 1.5707963 + 2.0943951 * float(a - 1) + 0.3 * wind;
                    d = min(d, sdSeg(p, B, B + 0.8 * L * vec2(cos(an), sin(an))));
                }
            } else {
                vec2 T = B + vec2(0.0, 0.8 * L) + lean;
                d = min(sdSeg(p, B, T), length(p - T) - S * 0.07);
            }
            float al = 1.0 - smoothstep(w * 0.6, w * 1.4, d);
            vec3 hc = c * 1.35;
            if (typ >= 0.75) hc = mix(hc, vec3(1.0, 0.8, 0.4), 0.35);
            col = mix(col, hc, al);
        }
    finish(col * 1.1);
}

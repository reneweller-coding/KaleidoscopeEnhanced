//@doc
 * @brief SNAKE SCALE KEEL ROWS: snake skin: keeled scales in rows that gape apart when the body bends; the photo colours the scales, and the bend runs as a wave over the skin.  The scales overlap like roof tiles (the lower rows lie over the upper ones), every scale has a central keel and a shaded rim, and the
 * rows slide sideways by a wave that bends the skin.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the bending wave runs over the skin (integrated)
 *   audioSpread  -> the number of keels per scale (smoothed: one, two, three)
 *
 * Knobs: sizeP (the size of the scales), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.09 + 0.07 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    float row0 = floor(q.y);
    float bestY = 1e3;
    vec3 col = vec3(0.03);
    float bend = 0.5;
    for (int dr = -2; dr <= 1; ++dr) {
        float row = row0 + float(dr);
        float wv = sin(0.45 * row - 0.04 * audioAdvance - 0.08 * sceneTime);
        float off = 0.5 * mod(row, 2.0) + 0.35 * wv;
        float cx0 = floor(q.x - off + 0.5);
        for (int dc = -1; dc <= 1; ++dc) {
            float cxi = cx0 + float(dc);
            vec2 cen = vec2(cxi + off, row);
            vec2 d = q - cen;
            float w = 0.62;
            float sd = pow(abs(d.x) / w, 2.0) + pow(max(d.y + 0.5, 0.0) / 1.15, 2.0) * 1.0;
            if (d.y > -0.5 && d.y < 0.9 && abs(d.x) < w && sd < 1.0 && row < bestY + 1e-3) {
                bestY = row;
                vec3 c = imgLod(cen * S * 0.85 + 0.5, 1.5);
                c = mix(vec3(luma(c)), c, 1.35);
                float keels = 1.0 + floor(2.0 * clamp(audioSpread, 0.0, 1.0));
                float keel = 1.0 - smoothstep(0.0, 0.08, abs(fract(d.x * keels * 0.9 + 0.5) - 0.5) / keels);
                float rim = smoothstep(0.7, 1.0, sd);
                float shade = 0.5 + 0.7 * (1.0 - clamp((d.y + 0.5) / 1.3, 0.0, 1.0));
                col = c * shade * (1.0 - 0.45 * rim) * (0.85 + 0.35 * keel) * 1.15;
            }
        }
    }
    finish(col);
}

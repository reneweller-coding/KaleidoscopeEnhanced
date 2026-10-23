//@doc
 * @brief SEIGAIHA WAVE SCALES: seigaiha, the Japanese wave pattern: overlapping arcs, each wave made of concentric rings; the photo colours the rings, and the scales wander like a swell over the surface, with a breathing overlap.  The rows are staggered, the lower rows lie over the upper ones, and
 * every wave shows rings of three or more bands whose colour comes from the photo at the wave's centre.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the overlap of the scales (the radius against the spacing)
 *   audioAdvance -> the swell wanders (integrated)
 *
 * Knobs: sizeP (the size of the scales), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.13 + 0.1 * clamp(sizeP, 0.0, 1.0);
    float R = S * (0.58 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    float sl = 0.03 * audioAdvance + 0.04 * sceneTime;
    vec2 q = vec2(p.x + 0.0, p.y) / S;
    float row0 = floor(q.y * 2.0);
    float bestY = 1e3;
    vec3 col = vec3(0.04);
    float found = 0.0;
    for (int dr = -2; dr <= 2; ++dr) {
        float row = row0 + float(dr);
        float cy = row * 0.5 * S;
        float stag = mod(row, 2.0) * 0.5;
        float cx0 = floor(q.x - stag - sl * (1.0 + 0.2 * mod(row, 3.0)) + 0.5);
        for (int dc = -1; dc <= 1; ++dc) {
            float cxi = cx0 + float(dc);
            vec2 cen = vec2((cxi + stag + sl * (1.0 + 0.2 * mod(row, 3.0))) * S, cy);
            float d = length(p - cen);
            if (d < R && cy < bestY + 0.0) {
                bestY = cy;
                float u = d / R;
                float ring = floor(u * 4.0);
                float fr = fract(u * 4.0);
                vec3 c = imgLod(cen * 0.85 + 0.5, 1.6);
                c = mix(vec3(luma(c)), c, 1.35);
                float tone = mod(ring, 2.0) < 0.5 ? 1.15 : 0.62;
                float line = smoothstep(0.0, 0.1, fr) * (1.0 - smoothstep(0.9, 1.0, fr));
                col = c * tone * (0.5 + 0.5 * line) * (0.85 + 0.2 * smoothstep(1.0, 0.0, u));
                col += vec3(0.9, 0.92, 1.0) * (1.0 - line) * 0.18;
                found = 1.0;
            }
        }
    }
    finish(col * 1.15);
}

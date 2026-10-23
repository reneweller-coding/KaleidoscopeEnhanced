//@doc
 * @brief CONTRAST QUADTREE BLOOM: a quadtree that splits where the photo has contrast, as in image compression: flat places stay one big cell of one colour, busy places are cut into smaller and smaller cells; every cell is the
 * photo's average colour there.  The threshold glides: the splits do not appear, they grow, the cells' joints fading in as the contrast beats the threshold.  The threshold follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the threshold (more swell, fewer splits)
 *   audioAdvance    -> the quadtree's grid drifts slowly (integrated)
 *
 * Knobs: depthP (how deep the quadtree goes), hueP.
//@params depthP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 x01 = vec2(p.x / asp + 0.5, 0.5 - p.y);
    vec2 drift = 0.03 * vec2(sin(0.01 * audioAdvance + 0.01 * sceneTime), cos(0.012 * audioAdvance));
    float thr = 0.03 + 0.14 * clamp(audioSwell, 0.0, 1.0);
    int maxD = 4 + int(3.0 * clamp(depthP, 0.0, 1.0) + 0.5);
    vec2 uvOf = vec2(0.5) + (x01 - 0.5) * vec2(asp, 1.0) * 0.8 + drift;
    vec3 col = imgLod(vec2(0.5) + (vec2(0.5) - 0.5) * 0.8, 6.5);
    float lines = 0.0;
    float carry = 1.0;
    for (int d = 0; d < 8; ++d) {
        if (d >= maxD) break;
        float n = exp2(float(d));
        vec2 cell = floor(x01 * n);
        vec2 ctr = (cell + 0.5) / n;
        vec2 hs = vec2(0.25 / n);
        float l0 = luma(imgLod(vec2(0.5) + (ctr + vec2(-hs.x, -hs.y) - 0.5) * vec2(asp, 1.0) * 0.8 + drift, float(d) * 0.6));
        float l1 = luma(imgLod(vec2(0.5) + (ctr + vec2(hs.x, -hs.y) - 0.5) * vec2(asp, 1.0) * 0.8 + drift, float(d) * 0.6));
        float l2 = luma(imgLod(vec2(0.5) + (ctr + vec2(-hs.x, hs.y) - 0.5) * vec2(asp, 1.0) * 0.8 + drift, float(d) * 0.6));
        float l3 = luma(imgLod(vec2(0.5) + (ctr + vec2(hs.x, hs.y) - 0.5) * vec2(asp, 1.0) * 0.8 + drift, float(d) * 0.6));
        float contrast = max(max(l0, l1), max(l2, l3)) - min(min(l0, l1), min(l2, l3));
        float w = smoothstep(thr * 0.7, thr * 1.3, contrast) * carry;
        vec2 cc = vec2(0.5) + (((floor(x01 * n * 2.0) + 0.5) / (n * 2.0)) - 0.5) * vec2(asp, 1.0) * 0.8 + drift;
        vec3 child = imgLod(cc, float(d + 1) * 0.7);
        col = mix(col, child, w);
        vec2 f = fract(x01 * n * 2.0);
        float jn = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        lines = max(lines, w * (1.0 - jn));
        carry = w;
    }
    finish(col * (1.0 - 0.5 * lines) * 1.08);
}

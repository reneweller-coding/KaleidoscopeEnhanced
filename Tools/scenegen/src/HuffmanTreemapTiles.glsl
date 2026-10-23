//@doc
 * @brief HUFFMAN TREEMAP TILES: a treemap of the photo: the area is cut into rectangles whose size follows how frequent the colour is (here: how bright), and the cutting wanders slowly between even and weighted halves; the picture is a tiling of seven levels of
 * cuts, each rectangle in the colour of its own place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the cuts' positions wander with the harmony (integrated)
 *   audioSwell       -> how strongly the cuts follow the brightness
 *
 * Knobs: sizeP (the depth of the cutting), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    vec2 q = fc / resolution;
    float asp = resolution.x / resolution.y;
    vec2 lo = vec2(0.0);
    vec2 hi = vec2(1.0);
    float follow = 0.45 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    int maxd = 5 + int(floor(2.99 * clamp(sizeP, 0.0, 1.0)));
    for (int d = 0; d < 8; ++d) {
        if (d >= maxd) break;
        bool vert = (hi.x - lo.x) * asp >= (hi.y - lo.y);
        float fd = float(d);
        vec2 ext = hi - lo;
        float lod = max(0.0, 5.5 - fd * 0.9);
        vec2 m1, m2;
        if (vert) { m1 = vec2(lo.x + 0.25 * ext.x, lo.y + 0.5 * ext.y); m2 = vec2(lo.x + 0.75 * ext.x, lo.y + 0.5 * ext.y); }
        else { m1 = vec2(lo.x + 0.5 * ext.x, lo.y + 0.25 * ext.y); m2 = vec2(lo.x + 0.5 * ext.x, lo.y + 0.75 * ext.y); }
        float l1 = luma(imgLod((m1 - 0.5) * vec2(asp, 1.0) * 0.85 + 0.5, lod));
        float l2 = luma(imgLod((m2 - 0.5) * vec2(asp, 1.0) * 0.85 + 0.5, lod));
        float sw = (0.15 + l1) / (0.3 + l1 + l2);
        float s = mix(0.5, clamp(sw, 0.28, 0.72), follow);
        s += 0.1 * sin(0.08 * audioHarmAdvance * (1.0 + 0.3 * fd) + 1.7 * fd + 0.05 * sceneTime);
        s = clamp(s, 0.2, 0.8);
        if (vert) {
            float mid = lo.x + s * ext.x;
            if (q.x < mid) hi.x = mid; else lo.x = mid;
        } else {
            float mid = lo.y + s * ext.y;
            if (q.y < mid) hi.y = mid; else lo.y = mid;
        }
    }
    vec2 cen = 0.5 * (lo + hi);
    vec2 ext = hi - lo;
    vec3 c = imgLod((cen - 0.5) * vec2(asp, 1.0) * 0.85 + 0.5, max(0.0, log2(min(ext.x * asp, ext.y) * 270.0 / 2.0)));
    vec2 dm = min(q - lo, hi - q) * resolution / (resolution.y / 270.0);
    float edge = smoothstep(0.0, 1.6, min(dm.x, dm.y));
    finish(c * (0.2 + 0.8 * edge) * 1.15);
}

//@doc
 * @brief H TREE BRANCH FIELD: the H tree: a fractal of H shapes, each smaller and turned, that fills a surface; the picture shows a field of H trees in which the photo flows.  The plane is folded into one quadrant, the cross bar and the four ends of the H are drawn, and the plane is mapped to the next, smaller H at one of the
 * ends; seven levels, with the photo running along the lines.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the dividing ratio of the branches (smoothed)
 *   audioAdvance -> the photo flows along the lines (integrated)
 *
 * Knobs: sizeP (the thickness of the lines), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP() * 1.6;
    float ratio = 0.7071 + 0.1 * (clamp(audioSpread, 0.0, 1.0) - 0.5);
    float lw = 0.012 + 0.018 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p;
    float scale = 1.0;
    float dmin = 1e3;
    float lvlBest = 0.0;
    for (int i = 0; i < 7; ++i) {
        q = abs(q);
        float d1 = sdSeg(q, vec2(0.0, 0.0), vec2(0.5, 0.0));
        float d2 = sdSeg(q, vec2(0.5, 0.0), vec2(0.5, 0.5));
        float d = min(d1, d2) * scale;
        if (d < dmin) { dmin = d; lvlBest = float(i); }
        q = vec2(q.y, q.x) - vec2(0.5, 0.5);
        q = vec2(q.y, -q.x) / ratio;
        q = rot2(0.0) * q;
        scale *= ratio;
    }
    float w = lw * (1.0 + 0.0 * lvlBest);
    float line = 1.0 - smoothstep(w * 0.4, w, dmin * 1.0);
    vec2 fl = p + vec2(0.3, 0.1) * (0.03 * audioAdvance + 0.04 * sceneTime);
    vec3 c = imgLod(fl * 0.5 * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 bg = imgLod(p * 0.5 * 0.85 + 0.5, 2.0) * 0.2;
    finish(bg + c * line * 1.6 + c * exp(-dmin * 30.0) * 0.25);
}

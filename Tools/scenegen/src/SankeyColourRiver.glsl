//@doc
 * @brief SANKEY COLOUR RIVER: a Sankey diagram of the photo: streams run from classes of brightness to classes of colour, branch and unite; the width is the number of pixels.  The picture is a flowing of ribbons of colour, each ribbon starting in its slot on the left, ending in another
 * slot on the right and carrying the colours of the photo along its way.  Where the ribbons cross they lie over one another like glass.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the stream wanders: the order of the slots on the right glides (integrated)
 *   audioSwell   -> the width of the ribbons
 *
 * Knobs: sizeP (the number of ribbons), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float xn = p.x / asp * 1.15;
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.22;
    float n = 6.0 + 2.0 * clamp(sizeP, 0.0, 1.0);
    float sw = 0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float flow = smoothstep(-0.8, 0.8, xn);
    vec3 acc = vec3(0.0);
    float aw = 0.0;
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        if (fk >= n) break;
        float yL = (fk + 0.5) / n - 0.5;
        float ph = fk + 1.7 * sin(0.2 * fk + 0.015 * audioAdvance + 0.02 * sceneTime) + 0.6 * sin(0.03 * audioAdvance * (fk + 1.0));
        float yR = (fract((ph + 40.0) / n) * n + 0.0) / n - 0.5;
        yR = clamp(yR * 0.9, -0.45, 0.45);
        float y = mix(yL * 0.92, yR, flow);
        float hw = 0.3 / n * sw;
        float d = abs(p.y - y);
        float al = 1.0 - smoothstep(hw * 0.7, hw, d);
        vec3 c = imgLod(vec2(p.x * 0.85 + 0.5, y * 0.85 + 0.5), 2.0 + 0.5 * fk);
        c = mix(vec3(luma(c)), c, 1.3);
        float edge = 0.75 + 0.25 * smoothstep(0.0, hw, hw - d);
        acc += c * edge * al;
        aw += al;
    }
    col = mix(col, acc / max(aw, 1.0) * 1.2, clamp(aw, 0.0, 0.85));
    float bar = smoothstep(0.02, 0.0, abs(abs(xn) - 0.8 * 1.15 * 0.0 - 0.78));
    finish(col + bar * vec3(0.12) * 0.0 + 0.0);
}

//@doc
 * @brief SCHENKER NESTED SLUR ARCS: the layers of a Schenker analysis: arcs over arcs, each the prolongation of one note, from the surface of the melody to the fundamental structure; the picture shows nested arcs of photo strips in four layers that open and close like the skins of an onion.
 * The layers have spans of one, two, four and eight units, and the arcs are mirrored below the baseline so that the picture is filled.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the number of layers that are drawn and their thickness
 *   audioHarmAdvance -> the arcs' position slides along the baseline (integrated)
 *
 * Knobs: sizeP (the smallest span), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float unit = 0.055 + 0.04 * clamp(sizeP, 0.0, 1.0);
    float sl = 0.03 * audioHarmAdvance + 0.04 * sceneTime;
    vec2 q = vec2(p.x + sl * unit, abs(fract(p.y / 0.5 + 0.5) - 0.5) * 0.5);
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.22;
    float sw = clamp(audioSwell, 0.0, 1.0);
    for (int l = 0; l < 4; ++l) {
        float fl = float(l);
        float span = unit * exp2(fl);
        float i = floor(q.x / span);
        float cx = (i + 0.5) * span;
        float R = 0.5 * span;
        float d = abs(length(vec2(q.x - cx, q.y)) - R * 0.96);
        float th = (0.008 + 0.006 * fl) * (0.7 + 0.8 * sw);
        float on = smoothstep(0.0, 1.0, 0.45 + 0.9 * sw + 0.4 * (3.0 - fl) * 0.5);
        float al = (1.0 - smoothstep(th * 0.6, th, d)) * on * step(q.y, R);
        vec3 c = imgLod(vec2(cx - sl * unit, 0.5 * R) * 0.85 + 0.5, 1.2 + 0.6 * fl);
        c = mix(vec3(luma(c)), c, 1.4);
        float inner = 1.0 - smoothstep(R * 0.96 - th, R * 0.96 - th * 0.5, length(vec2(q.x - cx, q.y)));
        col = mix(col, c * 0.8, inner * 0.3 * on);
        col = mix(col, c * 1.3, al);
    }
    finish(col);
}

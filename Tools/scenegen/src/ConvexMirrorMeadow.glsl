//@doc
 * @brief CONVEX MIRROR MEADOW: a field of convex mirrors of different curvatures, each showing the photo in miniature, distorted as in a spoon; the curvature wanders
 * from mirror to mirror and the whole field drifts slowly, each mirror a little sphere that sees the picture around it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the curvature of the mirrors
 *   audioAdvance    -> the field drifts (integrated)
 *
 * Knobs: cellsP (how many mirrors), hueP.
//@params cellsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.05 + 0.5 * audioAdvance;
    float N = 3.0 + 4.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N + 0.5 * vec2(sin(t), cos(0.7 * t));
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float k = 0.55 + 0.4 * hash21(cell) + 0.25 * clamp(audioSwell, 0.0, 1.0);
    vec2 d = f / 0.46;
    float r2 = dot(d, d);
    vec3 col;
    if (r2 < 1.0) {
        vec3 n = vec3(d * k, sqrt(max(1.0 - r2 * k * k, 0.0)));
        n = normalize(n);
        vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
        vec2 uv = (cell + 0.5) / N * 0.8 + 0.5 + r.xy * 0.5;
        col = imgLod(uv, 0.5) * (0.65 + 0.5 * n.z) + 0.15 * pow(max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 18.0);
    } else {
        col = imgLod(p * 0.8 + 0.5, 3.0) * 0.5;
    }
    finish(col);
}

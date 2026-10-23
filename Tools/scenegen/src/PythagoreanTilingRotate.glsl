//@doc
 * @brief PYTHAGOREAN TILING ROTATE: the tiling of two sizes of squares whose sides a and b make the legs of a right triangle: big squares and
 * small squares meet edge to edge, the plane fully covered; the pictures in the big squares turn one way and those in the small ones the other, so
 * the squares stay still and their photos spin against each other.  The sizes glide with the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ratio of the squares glides with each harmonic change (integrated)
 *   audioPhase      -> the photos' counter-rotation (integrated)
 *   audioSwell      -> the size of the whole pattern breathes
 *
 * Knobs: sizeP (the base size), ratioP (the base ratio of the squares), hueP.
//@params sizeP ratioP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    float a = 1.0;
    float b = 0.45 + 0.35 * clamp(ratioP, 0.0, 1.0) + 0.1 * sin(0.4 * audioHarmAdvance);
    float N = (0.18 + 0.25 * (1.0 - clamp(sizeP, 0.0, 1.0))) * (1.0 + 0.04 * clamp(audioSwell, 0.0, 1.0));
    vec2 q = p / N;
    float d2 = a * a + b * b;
    float u = dot(q, vec2(a, b)) / d2, v = dot(q, vec2(-b, a)) / d2;
    vec3 col = vec3(0.0);
    for (int dn = -1; dn <= 1; ++dn) {
        for (int dm = -1; dm <= 1; ++dm) {
            float n = floor(u) + float(dn), m = floor(v) + float(dm);
            vec2 o = vec2(n * a - m * b, n * b + m * a);
            vec2 lb = q - o;
            if (lb.x >= 0.0 && lb.x < a && lb.y >= 0.0 && lb.y < a) {
                vec2 d = lb / a - 0.5;
                vec2 uv = rot2(0.5 * sin(t) + 0.2 * t) * d * 0.9 + 0.5 + 0.1 * (hash22(vec2(n, m)) - 0.5);
                col = imgLod(uv, 0.5) * (0.85 + 0.2 * smoothstep(0.0, 0.05, 0.5 - max(abs(d.x), abs(d.y))));
            }
            vec2 ls = q - (o + vec2(a, 0.0));
            if (ls.x >= 0.0 && ls.x < b && ls.y >= 0.0 && ls.y < b) {
                vec2 d = ls / b - 0.5;
                vec2 uv = rot2(-0.8 * sin(t * 1.3) - 0.3 * t) * d * 0.9 + 0.5 + 0.1 * (hash22(vec2(n + 7.0, m)) - 0.5);
                col = imgLod(uv, 0.5) * (0.85 + 0.2 * smoothstep(0.0, 0.05, 0.5 - max(abs(d.x), abs(d.y))));
            }
        }
    }
    finish(col * 1.05);
}

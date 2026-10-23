//@doc
 * @brief HOMAGE SQUARES PHOTO: Albers's squares: nested squares sitting on one baseline, each in a colour taken from the photo at that place and a little under the influence of the square around it, so that the colours seem to change with
 * their neighbours; a lattice of such panels fills the picture.  The nesting slides up and down in the golden ratio with the drive of the music, and the number of squares follows the key (the innermost fading in and out).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the nesting slides (golden-ratio phases, integrated)
 *   audioHarmAdvance -> the number of squares (the last fading in and out)
 *
 * Knobs: sizeP (the size of the panels), hueP.
//@params sizeP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.6 - 0.25 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / s + 0.5);
    vec2 d = p - cell * s;
    vec3 col = imgLod(p * 0.8 + 0.5, 4.0) * 0.5;
    float nSq = 4.0 + 3.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    vec3 prev = imgLod(cell * s * 0.8 + 0.5, 3.0);
    float base = -0.5 * s * 0.92;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float h = 0.46 * s * pow(0.72, fk);
        float slide = 0.012 * s * sin(0.08 * audioAdvance + 1.618 * fk * 2.0);
        vec2 cc = vec2(0.0, base + h + slide * 8.0);
        vec3 c = imgLod((cell * s + vec2(0.08 * (fk - 2.0), 0.05 * fk)) * 0.8 + 0.5, 3.0);
        c = clamp(mix(vec3(luma(c)), c, 1.5), 0.0, 1.0);
        c = mix(c, prev, 0.28);
        float w = clamp(nSq - fk, 0.0, 1.0);
        vec2 q = abs(d - cc);
        float inside = smoothstep(0.004, -0.004, max(q.x, q.y) - h) * w;
        col = mix(col, c, inside);
        prev = c;
    }
    finish(col * 1.05);
}

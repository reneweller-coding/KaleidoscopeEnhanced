//@doc
 * @brief DOT MATRIX PRINTER PASS: a dot-matrix printer: the head runs over the picture line by line and sets nine needle dots to a column by the brightness; the lines are offset, a band of
 * light runs after the head, and the photo stands in coarse dots and ribs, in its own colours on grey paper.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the dots' size
 *   audioAdvance    -> the head's pass (integrated)
 *
 * Knobs: rowsP (how many printed lines), hueP.
//@params rowsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.08 * sceneTime + 0.6 * audioAdvance;
    float lines = 8.0 + 8.0 * clamp(rowsP, 0.0, 1.0);
    float ly = p.y * lines;
    float li = floor(ly);
    float fy = fract(ly);
    float pin = floor(fy * 9.0);
    float fp = fract(fy * 9.0) - 0.5;
    float W = 150.0;
    float xoff = 0.5 * mod(li, 2.0) + 0.3 * mod(pin, 2.0);
    float x = p.x * W + xoff;
    float cx = floor(x);
    vec2 cp = vec2((cx + 0.5 - xoff) / W, (li + (pin + 0.5) / 9.0) / lines);
    vec3 c = imgLod(cp * 0.8 + 0.5, 1.5);
    float ink = clamp(0.3 + 0.9 * (1.0 - luma(c)) + 0.7 * satOf(c), 0.05, 1.0);
    float r = (0.34 + 0.16 * clamp(audioSwell, 0.0, 1.0)) * sqrt(ink);
    vec2 f = vec2(fract(x) - 0.5, fp);
    float dotm = smoothstep(r, r * 0.65, length(f));
    float headY = fract(t * 0.3) * 1.4 - 0.7;
    float head = exp(-pow((p.y - headY) / 0.07, 2.0));
    vec3 paper = vec3(0.86, 0.84, 0.78);
    vec3 col = mix(paper, clamp(mix(vec3(luma(c)), c, 1.7), 0.0, 1.0) * 0.85, dotm) * (1.0 + 0.3 * head);
    finish(col);
}

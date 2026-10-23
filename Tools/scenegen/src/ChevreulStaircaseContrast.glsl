//@doc
 * @brief CHEVREUL STAIRCASE CONTRAST: the Chevreul illusion: a staircase of even greys seems to overshoot at the steps; the photo is rastered into steps, at whose edges borders of difference become visible, and the steps wander.  The brightness is cut into steps (their number glides), every step is flat, and a
 * border of exaggerated difference lies on each side of every edge, as the eye adds it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of steps glides (smoothed)
 *   audioAdvance -> the steps wander (the photo drifts through the quantiser) (integrated)
 *
 * Knobs: sizeP (the width of the borders), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
float quantL(float l, float n) { return floor(l * n + 0.5) / n; }
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5 + 0.03 * vec2(sin(0.02 * audioAdvance + 0.03 * sceneTime), cos(0.017 * audioAdvance));
    vec3 c = imgLod(uv, 1.2);
    float l = luma(c);
    float n = 4.0 + 6.0 * clamp(audioSpread, 0.0, 1.0) + 1.5 * sin(0.05 * sceneTime);
    float q = quantL(l, n);
    float bw = 0.004 + 0.012 * clamp(sizeP, 0.0, 1.0);
    float ql = quantL(luma(imgLod(uv + vec2(bw, 0.0), 1.2)), n);
    float qr = quantL(luma(imgLod(uv - vec2(bw, 0.0), 1.2)), n);
    float qu = quantL(luma(imgLod(uv + vec2(0.0, bw), 1.2)), n);
    float qd = quantL(luma(imgLod(uv - vec2(0.0, bw), 1.2)), n);
    float nb = 0.25 * (ql + qr + qu + qd);
    float over = (q - nb) * 1.6;
    float v = clamp(q + over, 0.0, 1.0);
    vec3 col = c / max(l, 0.05) * v;
    col = mix(vec3(v), col, 0.55);
    finish(col * 1.1);
}

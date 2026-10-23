//@doc
 * @brief VISCOUS THREAD BUCKLING: buckling threads: thin threads buckle and fold into zigzags and loops when they are compressed; the picture shows many threads running vertically that buckle, with the photo as colour.  Forty threads descend in columns; above a height they are straight, below it they swing
 * out in a growing zigzag, and where they are compressed hardest they fold into loops.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the compression: the height where buckling begins and the size of the folds
 *   audioAdvance -> the folds run downwards (integrated)
 *
 * Knobs: sizeP (the number of threads), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 24.0 + 30.0 * clamp(sizeP, 0.0, 1.0);
    float comp = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.12;
    float x0c = (p.x / asp) * N;
    float kc = floor(x0c + 0.5);
    float yy = p.y + 0.5;
    float d = 1e3;
    float tcol = 0.0;
    for (int dk = -2; dk <= 2; ++dk) {
        float k = kc + float(dk);
        float h = hash21(vec2(k, 2.0));
        float xc = k / N * asp;
        float yb = (1.0 - 0.5 * comp) * (0.35 + 0.3 * h);
        float amp = max(yb - yy, 0.0);
        amp = amp * amp * (0.6 + 1.6 * comp) * 0.5;
        float kk = 28.0 + 12.0 * h;
        float dx = amp * sin(kk * yy * 0.5 - 6.2831853 * t * (0.6 + h) + 6.28 * h);
        float fold = amp * 0.8 * sin(kk * yy * 0.5 - 6.2831853 * t * (0.6 + h) + 6.28 * h + 1.57);
        float xt = xc + dx * 0.25;
        float dd = abs(p.x - xt);
        if (dd < d) { d = dd; tcol = k; }
    }
    float w = 0.0022 + 0.002 * comp;
    float line = 1.0 - smoothstep(w * 0.6, w * 1.4, d);
    vec3 c = imgLod(vec2(p.x * 0.85 / asp * 1.0 + 0.5, p.y * 0.85 + 0.5), 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 th = c * 1.5 + 0.1;
    col = mix(col, th, line);
    finish(col);
}

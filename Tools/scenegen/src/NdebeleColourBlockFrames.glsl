//@doc
 * @brief NDEBELE COLOUR BLOCK FRAMES: colour blocks in the manner of Ndebele wall painting: strictly geometric frames in strong fields, nested in one another; the photo is distributed over the fields, and the frames shift by fractions of their width.  Every cell holds up to six nested frames, each in a
 * saturated colour taken from the photo, separated by white lines; the frames' centres move slowly against each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the frames shift against each other (integrated)
 *   audioSwell   -> the number of frames in force glides
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.4 + 0.3 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 f = (q - ci);
    float depth = 3.0 + 3.0 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.95, 0.93, 0.88);
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        if (fi >= depth + 1.0) break;
        vec2 off = 0.06 * vec2(sin(t + 1.3 * fi + ci.x), cos(0.8 * t + 1.7 * fi + ci.y)) * fi / 3.0;
        vec2 h = hash22(ci * 7.0 + fi);
        float hx = 0.47 * pow(0.76, fi);
        float hy = hx * (0.7 + 0.3 * h.x);
        vec2 d = abs(f - off) - vec2(hx, hy);
        float inside = 1.0 - smoothstep(-0.002, 0.004, max(d.x, d.y));
        vec3 c = imgLod(((ci + 0.5 * (h - 0.5)) * S + off * S + vec2(0.0)) * 0.85 + 0.5 + 0.25 * (h - 0.5), 1.8);
        c = mix(vec3(luma(c)), c, 1.7);
        float w = clamp(depth - fi, 0.0, 1.0);
        col = mix(col, c * 1.15, inside * w);
        float rim = (1.0 - smoothstep(0.0, 0.01, abs(max(d.x, d.y) + 0.012))) * inside;
        col = mix(col, vec3(0.97), rim * 0.8 * w);
    }
    finish(col);
}

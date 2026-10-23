//@doc
 * @brief T SQUARE GROWTH TILES: the T-square fractal: a square at whose corners smaller ones grow, in endless repetition; the photo fills every stage and grows with the depth.  The plane is mapped again and again to the corner square (two times larger), and the stage is the number of times the point stays inside; every
 * stage shows the photo at its own scale and turn.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the depth: the number of stages shown glides
 *   audioAdvance -> the stages turn against each other (integrated)
 *
 * Knobs: sizeP (the size of the first square), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.9 + 0.7 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S * 1.0;
    float depth = 3.0 + 4.0 * (0.5 + 0.5 * sin(0.04 * sceneTime)) * (0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = imgLod(p * 0.85 + 0.5, 1.5) * 0.15;
    float rot = 0.02 * audioAdvance + 0.03 * sceneTime;
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        float on = clamp(depth - fi, 0.0, 1.0);
        float inside = step(max(abs(q.x), abs(q.y)), 0.5);
        if (inside > 0.5) {
            vec3 c = imgLod(rot2(rot * (fi + 1.0) * 0.4) * q * 0.9 + 0.5 + 0.03 * fi, 0.6);
            c = mix(vec3(luma(c)), c, 1.2);
            float e = smoothstep(0.0, 0.03, 0.5 - max(abs(q.x), abs(q.y)));
            col = mix(col, c * (0.6 + 0.4 * e) * (0.8 + 0.1 * fi) * 1.1, on);
        }
        q = (abs(q) - vec2(0.5)) * 2.0;
    }
    finish(col);
}

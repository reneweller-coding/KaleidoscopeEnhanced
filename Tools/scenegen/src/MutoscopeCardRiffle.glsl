//@doc
 * @brief MUTOSCOPE CARD RIFFLE: a mutoscope: a stack of cards snaps past, each showing the photo a little shifted; the picture flips as a fan in which the cards alternate light and dark and throw thin shadows on each other.  The cards run on as an
 * endless stack: new ones appear at the back while the first ones leave at the front.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the riffle's rate (integrated)
 *   audioSwell   -> the shift between the cards
 *
 * Knobs: sizeP (the number of cards in view), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 12.0 + 12.0 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.06 * audioAdvance + 0.05 * sceneTime;
    float f = fract(ph);
    float id0 = floor(ph);
    float sp = 0.1 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = imgLod(p * 0.6 + 0.5, 3.0) * 0.3;
    for (int j = 0; j < 24; ++j) {
        float fj = float(j);
        if (fj >= N) break;
        float u = (fj + f) / N;
        float alpha = (j == 0 ? f : 1.0) * (fj + 1.0 >= N ? 1.0 - f : 1.0);
        vec2 o = vec2((u - 0.5) * (0.7 + 3.0 * sp), (u - 0.5) * 0.12);
        float sz = 0.62;
        vec2 q = rot2(-(u - 0.5) * (0.12 + 0.5 * sp)) * (p - o) / sz;
        if (abs(q.x) < 0.9 && abs(q.y) < 0.5) {
            vec3 c = imgLod(q * 0.85 + 0.5 + 0.01 * (fj + id0) * vec2(1.0, 0.5), 0.5);
            float par = mod(fj + id0, 2.0);
            c *= 0.8 + 0.28 * par;
            float edge = smoothstep(0.0, 0.03, 0.9 - abs(q.x)) * smoothstep(0.0, 0.03, 0.5 - abs(q.y));
            float shadow = 1.0 - 0.35 * smoothstep(0.12, 0.0, 0.9 - abs(q.x));
            col = mix(col, c * shadow, alpha * edge);
        }
    }
    finish(col * 1.1);
}

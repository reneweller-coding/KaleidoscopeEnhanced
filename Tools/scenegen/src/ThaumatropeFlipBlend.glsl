//@doc
 * @brief THAUMATROPE FLIP BLEND: the thaumatrope: a disc printed differently on its two sides that flips so fast that both pictures fuse into one.  Here the photo and its colour-inverted mirror image fuse, and the fusing glides between the photo and its counter
 * picture; at half the two lie on each other as a double exposure with bright, complementary colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos   -> the mixing glides once around the phrase (periodic)
 *   audioAdvance     -> the axis of the flip turns (integrated)
 *
 * Knobs: sizeP (how far the back is moved), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float ax = 0.4 + 0.02 * audioAdvance + 0.04 * sceneTime;
    vec2 n = vec2(-sin(ax), cos(ax));
    vec2 pr = p - 2.0 * dot(p, n) * n;
    pr += (clamp(sizeP, 0.0, 1.0) - 0.5) * 0.15 * vec2(cos(ax), sin(ax));
    vec3 f = imgLod(p * 0.85 + 0.5, 0.4);
    vec3 b = vec3(1.0) - imgLod(pr * 0.85 + 0.5, 0.4);
    float m = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(6.2831853 * audioPhrasePos));
    vec3 col = mix(f, b, m);
    float both = sin(3.1415927 * m);
    col = mix(col, 1.0 - (1.0 - f) * (1.0 - b), 0.45 * both);
    finish(col * 1.05);
}

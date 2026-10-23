//@doc
 * @brief PHASER ALLPASS SWIRL: a phaser: allpass stages turn the phase depending on the frequency of the picture, and the mixing with the original makes notches that wander; the photo appears with swirls in its fine structures while the coarse tones stay as they are.  The fine
 * structure is turned by an angle that varies in waves across the picture, using a quadrature copy made of two shifted samples.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the notches wander (integrated)
 *   audioRoughness -> the spacing of the notches (finer waves when rough)
 *
 * Knobs: sizeP (the scale of the fine structure), hueP.
//@params sizeP
//@audio audioRoughness audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float lod = 2.0 + 2.0 * clamp(sizeP, 0.0, 1.0);
    vec3 low = imgLod(uv, lod);
    vec3 c = imgLod(uv, 0.3);
    vec3 hi = c - low;
    float e = 0.004;
    vec3 hx = (imgLod(uv + vec2(e, 0.0), 0.3) - imgLod(uv - vec2(e, 0.0), 0.3));
    vec3 hy = (imgLod(uv + vec2(0.0, e), 0.3) - imgLod(uv - vec2(0.0, e), 0.3));
    vec3 hq = (hx + hy) * 4.0;
    float k = 3.0 + 6.0 * clamp(audioRoughness, 0.0, 1.0);
    float phi = 3.0 * (0.5 + 0.5 * sin(k * 0.5 * (p.x + 0.6 * p.y) - 0.15 * audioAdvance - 0.1 * sceneTime)) + 2.0 * sin(2.0 * length(p) - 0.05 * audioAdvance);
    vec3 rotd = hi * cos(phi) + hq * sin(phi);
    vec3 col = low + 1.1 * rotd;
    finish(col * 1.1);
}

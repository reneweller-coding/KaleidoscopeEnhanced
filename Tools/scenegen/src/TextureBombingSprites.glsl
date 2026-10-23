//@doc
 * @brief TEXTURE BOMBING SPRITES: texture bombing: copies of a cut-out scattered at random over a surface, with rotation and scaling; the photo is broken into hundreds of patches of itself that overlap.  Two layers of round sprites on a jittered net, each showing the photo from a window of its own turned and scaled,
 * edges soft; the order of overlapping follows a random number.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of sprites (the size of the net) (smoothed)
 *   audioAdvance -> the sprites turn (integrated)
 *
 * Knobs: sizeP (the size of the sprites), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.12 + 0.1 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.35;
    float rot = 0.02 * audioAdvance + 0.03 * sceneTime;
    for (int layer = 0; layer < 2; ++layer) {
        float fl = float(layer);
        vec2 g = p / S + 0.37 * fl;
        vec2 gi = floor(g);
        float bestZ = -1.0;
        vec3 bestC = vec3(0.0);
        float bestA = 0.0;
        for (int dy = -1; dy <= 1; ++dy)
            for (int dx = -1; dx <= 1; ++dx) {
                vec2 cj = gi + vec2(float(dx), float(dy));
                vec2 h = hash22(cj + fl * 5.0);
                vec2 pt = cj + 0.5 + 0.45 * (h - 0.5) * 2.0;
                float R = 0.55 + 0.25 * h.x;
                vec2 d = g - pt;
                float r = length(d) / R;
                if (r < 1.0) {
                    float z = hash21(cj + fl * 9.0 + 2.0);
                    if (z > bestZ) {
                        float sc = 0.7 + 0.8 * h.y;
                        float an = 6.2831853 * h.x + (h.y - 0.5) * 2.0 * rot * 3.0;
                        vec2 src = (h - 0.5) * 0.6;
                        vec2 uv = src + rot2(an) * d * S / sc;
                        vec3 c = imgLod(uv * 0.85 + 0.5, 0.8);
                        bestZ = z;
                        bestC = c;
                        bestA = 1.0 - smoothstep(0.82, 1.0, r);
                    }
                }
            }
        col = mix(col, bestC * 1.05, bestA * step(0.0, bestZ));
    }
    finish(col);
}

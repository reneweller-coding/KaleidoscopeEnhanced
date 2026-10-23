//@doc
 * @brief SHAG CARPET PILE COMBING: shag pile: millions of fibres combed in one direction that show light or dark by their tilt; the photo sets the colour of every fibre, and a combing movement lays the pile in waves.  Short fibres on a jittered net lean with a wave that runs over the carpet; the side that faces the light
 * is bright, the other dark.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the combing wave runs (integrated)
 *   audioSpread  -> the length of the pile (smoothed)
 *
 * Knobs: sizeP (the fineness of the fibres), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.02 + 0.02 * (1.0 - clamp(sizeP, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float len = (0.8 + 1.2 * clamp(audioSpread, 0.0, 1.0)) * S * 1.5;
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec3 col = imgLod(p * 0.85 + 0.5, 1.2) * 0.1;
    vec3 L = normalize(vec3(-0.6, 0.5, 0.6));
    for (int dy = -1; dy <= 2; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 B = (cj + 0.5 + 0.45 * (h - 0.5) * 2.0) * S;
            float wave = sin(3.0 * B.x - 6.0 * t + 1.5 * B.y);
            float lean = 0.5 * wave + (h.y - 0.5) * 0.4;
            vec2 dir = normalize(vec2(lean, 1.0));
            vec2 T = B + dir * len;
            float d = sdSeg(p, B, T) / S;
            float w = 0.2 + 0.1 * h.x;
            float al = 1.0 - smoothstep(w * 0.6, w, d);
            float tilt = lean;
            vec3 n = normalize(vec3(dir.x, 0.3, 0.9));
            float lit = 0.35 + 0.8 * clamp(dot(n, L) + 0.3, 0.0, 1.0);
            vec3 c = imgLod(B * 0.85 + 0.5, 1.3);
            c = mix(vec3(luma(c)), c, 1.35);
            float tipv = clamp(dot(p - B, T - B) / max(dot(T - B, T - B), 1e-6), 0.0, 1.0);
            col = mix(col, c * lit * (0.6 + 0.7 * tipv) * 1.3, al);
        }
    finish(col);
}

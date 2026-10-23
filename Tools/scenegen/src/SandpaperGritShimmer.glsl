//@doc
 * @brief SANDPAPER GRIT SHIMMER: sandpaper: grains in dense packing with edges that reflect the light at changing places; the photo sets the colour of the grains.  A dense field of tiny angular grains, each with its own random facet normal, glints when the light passes the right angle; the light wanders and the
 * glints blink on and off softly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the grain size (smoothed)
 *   audioAdvance -> the light wanders (integrated)
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.006 + 0.008 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float la = 0.025 * audioAdvance + 0.05 * sceneTime;
    vec3 L = normalize(vec3(0.7 * cos(la), 0.7 * sin(0.9 * la), 0.55));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float d1 = 1e3;
    vec2 best = vec2(0.0);
    vec2 bid = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d1 = d; best = pt; bid = cj; }
        }
    vec2 nxy = (hash22(bid + 23.0) - 0.5) * 1.1;
    vec3 N = normalize(vec3(nxy, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    vec3 c = imgLod(best * S * 0.85 + 0.5, 1.6);
    c = mix(vec3(luma(c)), c, 1.35);
    float tone = 0.45 + 0.7 * hash21(bid + 5.0);
    vec3 grit = mix(vec3(0.35, 0.28, 0.22), c, 0.5) * tone;
    float edge = smoothstep(0.0, 0.2, 0.7 - d1);
    vec3 col = grit * (0.55 + 0.45 * edge) + vec3(1.0, 0.95, 0.85) * spec * 1.2 * (0.4 + 0.6 * luma(c));
    finish(col * 1.2);
}

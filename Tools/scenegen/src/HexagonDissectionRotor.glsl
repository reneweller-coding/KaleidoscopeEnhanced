//@doc
 * @brief HEXAGON DISSECTION ROTOR: the hexagon divided into seven smaller ones, each turned by the same angle (19.1 degrees, the angle of the seven-fold
 * dissection) and each divided again: rosettes of the photo that turn within themselves, level in level, in a flower that never ends.  The
 * turns grow with the swell and the flower winds slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far each level turns the next (the twist)
 *   audioPhase      -> the flower winds (integrated)
 *
 * Knobs: levelsP (how many levels), hueP.
//@params levelsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.05 + 0.4 * audioPhase;
    vec2 q = rot2(t) * p * 1.2;
    float tw = 0.333473 * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    int levels = 1 + int(2.0 * clamp(levelsP, 0.0, 1.0));
    float acc = 0.0;
    float path = 0.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= levels) break;
        float best = dot(q, q);
        vec2 c = vec2(0.0);
        float id = 0.0;
        for (int j = 0; j < 6; ++j) {
            float a = 1.0471976 * float(j) + 0.5236;
            vec2 cj = 0.76 * vec2(cos(a), sin(a));
            float d = dot(q - cj, q - cj);
            if (d < best) { best = d; c = cj; id = float(j + 1); }
        }
        q = rot2(-tw) * (q - c) * 2.6457513;
        acc += tw;
        path = path * 7.0 + id;
    }
    vec2 uv = rot2(acc * 0.5) * q * 0.45 + 0.5;
    vec3 col = imgLod(uv, 1.3 * float(levels) + 0.3) * (0.82 + 0.3 * hash21(vec2(mod(path, 241.0), 6.0)));
    finish(col * 1.05);
}

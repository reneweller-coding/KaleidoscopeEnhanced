//@doc
 * @brief HAAR PYRAMID TILING: the photo laid out like a wavelet decomposition: in the top left quarter the half-size picture, in
 * the other three quarters the detail bands of that scale (horizontal, vertical and diagonal edges, shown as a grey wash
 * that carries the photo's own tint), and in the half-size picture again the same, down to the pixel.  The gain of
 * every band breathes on its own clock.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how deep the pyramid goes (the finest level fades in)
 *   audioSwell      -> the bands' gain
 *   audioPhase      -> every level's breathing (integrated)
 *
 * Knobs: depthP (how many levels), gainP (the base gain of the bands), hueP.
//@params depthP gainP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 q = vec2(p.x / 1.7778 + 0.5, 0.5 - p.y);
    float t = sceneTime * 0.5 + 3.0 * audioPhase;
    float depth = 3.0 + 2.0 * clamp(depthP, 0.0, 1.0) + 1.0 * clamp(audioSpread, 0.0, 1.0);
    float gain = (1.2 + 1.8 * clamp(gainP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = vec3(0.0);
    float lvl = 0.0;
    bool done = false;
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        if (q.x < 0.5 && q.y < 0.5) {
            q *= 2.0;
            lvl += 1.0;
        } else {
            vec2 loc = fract(q * 2.0);
            float e = 0.012 * exp2(0.5 * lvl);
            vec3 d;
            if (q.x >= 0.5 && q.y < 0.5) d = imgLod(loc + vec2(e, 0.0), lvl) - imgLod(loc - vec2(e, 0.0), lvl);
            else if (q.x < 0.5) d = imgLod(loc + vec2(0.0, e), lvl) - imgLod(loc - vec2(0.0, e), lvl);
            else d = imgLod(loc + vec2(e, e), lvl) - imgLod(loc - vec2(e, e), lvl);
            float g = gain * (1.0 + 0.5 * sin(0.7 * t + 1.7 * lvl)) * clamp(depth - lvl, 0.0, 1.0);
            vec3 tint = imgLod(loc, lvl + 1.0);
            col = tint * (0.5 + luma(d) * g * 3.5);
            done = true;
            break;
        }
    }
    if (!done) col = imgLod(q, 0.5 + lvl);
    finish(col);
}

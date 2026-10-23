//@doc
 * @brief NESTED WINDOW PARALLAX STACK: windows in windows: the photo appears in a window in which the photo appears in a window; every stage has a slight offset, and the stages move against each other.  Eight windows, each a little smaller than the one before, show the photo in their own frame; the deepest window that
 * contains the point is seen, the frames are drawn as thin lines and the centres swing slowly against each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of stages (smoothed)
 *   audioAdvance -> the stages swing against each other (integrated)
 *
 * Knobs: sizeP (the ratio of the windows), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float sc = 0.62 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float n = 4.0 + 4.0 * clamp(audioSpread, 0.0, 1.0);
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    vec2 q = p;
    vec3 col = imgLod(p * 0.85 + 0.5, 0.6);
    float edgeAcc = 0.0;
    vec2 off = vec2(0.0);
    float s = 1.0;
    for (int i = 1; i < 9; ++i) {
        float fi = float(i);
        if (fi > n) break;
        s *= sc;
        off += 0.06 * s * vec2(sin(t * (1.0 + 0.2 * fi) + 1.7 * fi), cos(t * (0.8 + 0.2 * fi) + 2.3 * fi));
        vec2 d = (p - off) / (s * vec2(asp, 1.0) * 0.5);
        if (abs(d.x) < 1.0 && abs(d.y) < 1.0) {
            vec2 uv = (p - off) / s;
            vec3 c = imgLod(uv * 0.85 + 0.5 + 0.02 * vec2(cos(fi), sin(fi)), 0.6);
            float tint = 0.9 + 0.2 * sin(fi);
            col = c * tint * 1.05;
            float e = max(abs(d.x), abs(d.y));
            edgeAcc = max(edgeAcc, 1.0 - smoothstep(0.0, 0.02, abs(e - 1.0)));
        }
    }
    col = mix(col, vec3(0.05, 0.05, 0.07), edgeAcc * 0.8);
    finish(col);
}

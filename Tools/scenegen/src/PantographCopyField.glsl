//@doc
 * @brief PANTOGRAPH COPY FIELD: pantograph joints that carry one movement to many scales at once: the photo appears as a copy in every joint, larger or smaller, and follows the same path -- a Lissajous curve traced by the pen of the master
 * and by every copy in its own size, thin rods running from the master point to each copy.  The windows of the copies overlap in rounded squares.  The scale follows the swell of the music, the path the phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the scale of the copies
 *   audioPhase      -> the path is traced (integrated)
 *
 * Knobs: pathP (the size of the path), hueP.
//@params pathP
//@audio audioSwell
//@body
/**  The distance of a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float t = 0.05 * sceneTime + 0.2 * audioPhase;
    vec2 path = (0.25 + 0.5 * clamp(pathP, 0.0, 1.0)) * vec2(sin(1.0 * t + 0.5), sin(1.5 * t));
    float sc0 = 0.6 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = imgLod(p * 0.8 + 0.5, 4.5) * 0.35;
    vec2 master = vec2(-0.75 * asp * 0.5, -0.3);
    for (int k = 0; k < 9; ++k) {
        float fk = float(k);
        vec2 cc = vec2((mod(fk, 3.0) - 1.0) * 0.55 * asp * 0.7, (floor(fk / 3.0) - 1.0) * 0.33);
        float sz = (0.14 + 0.08 * hash21(vec2(fk, 2.0))) * sc0;
        vec2 q = (p - cc) / sz;
        vec2 win = abs(q) - 0.9;
        float inside = smoothstep(0.06, 0.0, max(win.x, win.y));
        if (inside > 0.001) {
            vec2 uv = vec2(0.5) + (q * 0.5 * 0.35 + path * 0.8 * 0.5 * (0.5 + hash21(vec2(fk, 7.0)))) * 0.8;
            vec3 c = imgLod(uv + 0.1 * vec2(hash21(vec2(fk, 1.0)) - 0.5), 0.8);
            col = mix(col, c * 1.15, inside);
        }
        vec2 pen = cc + path * sz * 0.5;
        col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.012, 0.004, segD(p, master, pen)) * 0.5);
        col = mix(col, vec3(1.0, 0.9, 0.6), smoothstep(0.016, 0.006, length(p - pen)));
    }
    finish(col);
}

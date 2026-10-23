//@doc
 * @brief TELESCOPE MIRROR SEGMENTS: the hexagonal mirror segments of a great telescope, eighteen of them in two rings, each tilted a little: the photo breaks into as many images, and as the
 * mirror is aligned they close into one single picture.  The tilt falls away in the loud passages and opens in the soft.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the tilt closes in the forte (the segments align) and opens in the piano
 *   audioAdvance    -> the segments' slow wander (integrated)
 *
 * Knobs: tiltP (how wrong the segments start), hueP.
//@params tiltP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.04 * sceneTime + 0.3 * audioAdvance;
    float N = 3.2;
    vec2 q = p * N;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = floor((q - gv) * 2.0 + 0.5);
    float tilt = (1.0 - smoothstep(0.25, 0.9, clamp(audioSwell, 0.0, 1.0))) * (0.04 + 0.16 * clamp(tiltP, 0.0, 1.0));
    vec2 off = (hash22(cid) - 0.5) * 2.0 * tilt + 0.01 * vec2(sin(t + cid.x), cos(t + cid.y)) * (1.0 - 0.7 * smoothstep(0.25, 0.9, clamp(audioSwell, 0.0, 1.0)));
    vec3 col = imgLod(p * 0.8 + 0.5 + off, 0.4);
    float edge = smoothstep(0.0, 0.05, 0.5 - max(abs(gv.x * 0.866 + gv.y * 0.5), max(abs(gv.y), abs(gv.x * 0.866 - gv.y * 0.5))));
    col *= 0.85 + 0.2 * edge;
    finish(col * 1.05);
}

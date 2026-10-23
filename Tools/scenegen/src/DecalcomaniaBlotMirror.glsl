//@doc
 * @brief DECALCOMANIA BLOT MIRROR: decalcomania: paint is pressed between two sheets and pulled apart, and branched, mirrored blots arise; the photo sets the colours, and the blots grow and divide symmetrically.  A ridged noise makes the viscous fingers, a threshold that rises makes them grow, the whole is
 * folded on a mirror axis that slowly turns, and the colours are the photo's at the warped place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the pulling apart: the threshold of the fingers
 *   audioAdvance -> the mirror axis turns (integrated)
 *
 * Knobs: sizeP (the scale of the fingers), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float ax = 0.03 * audioAdvance + 0.02 * sceneTime;
    vec2 q = rot2(ax) * p;
    q.x = abs(q.x);
    float sc = 2.5 + 3.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = 0.03 * sceneTime;
    vec2 w = vec2(fbm(q * sc * 0.6 + vec2(t, 0.0)), fbm(q * sc * 0.6 + vec2(5.0, -t))) - 0.5;
    vec2 qq = q + 0.35 * w;
    float rid = 1.0 - abs(fbm(qq * sc + vec2(0.0, t)) - 0.5) * 2.0;
    float rid2 = 1.0 - abs(fbm(qq * sc * 2.3 + vec2(7.0, -t)) - 0.5) * 2.0;
    float f = 0.65 * rid + 0.35 * rid2 + 0.25 * (0.5 - length(q) * 0.8);
    float thr = 0.78 - 0.25 * clamp(audioSwell, 0.0, 1.0) - 0.06 * sin(0.05 * sceneTime);
    float blot = smoothstep(thr, thr + 0.07, f);
    vec3 c = imgLod(rot2(-ax) * vec2(qq.x, qq.y) * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.35);
    vec3 paper = vec3(0.94, 0.92, 0.86);
    vec3 paint = c * (0.7 + 0.5 * rid2) * 1.1;
    float edge = smoothstep(thr, thr + 0.02, f) * (1.0 - smoothstep(thr + 0.02, thr + 0.07, f));
    finish(mix(paper, paint, blot) - vec3(edge * 0.15));
}

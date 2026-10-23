//@doc
 * @brief KINETOSCOPE PEEPHOLE IRIS: the view through the eyepiece of a kinetoscope: a round cut-out shows the photo, at the edge there are veils and the rim of a lens, and the cut-out wanders on a lemniscate; up to four eyepieces interlock, each of them swelling and
 * shrinking in its own slow rhythm.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the eyepieces wander on the lemniscate (integrated)
 *   audioSwell   -> the common size of the eyepieces
 *
 * Knobs: sizeP (the eyepieces' base size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.04 * audioAdvance + 0.06 * sceneTime;
    float R = 0.26 + 0.2 * clamp(sizeP, 0.0, 1.0) + 0.03 * clamp(audioSwell, 0.0, 1.0);
    float cover = 0.0;
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 4; ++k) {
        float ph = t + 1.5708 * float(k);
        float den = 1.0 + sin(ph) * sin(ph);
        vec2 cen = vec2(0.62 * cos(ph) / den, 0.45 * sin(ph) * cos(ph) / den);
        float Rk = R * (0.65 + 0.35 * sin(0.17 * sceneTime + 1.9 * float(k)));
        vec2 d = p - cen;
        float dl = length(d) / Rk;
        float w = 1.0 - smoothstep(0.85, 1.0, dl);
        float rim = smoothstep(0.82, 0.94, dl) * (1.0 - smoothstep(0.96, 1.02, dl));
        vec3 c = imgLod(p * 0.85 + 0.5 + 0.02 * vec2(sin(ph), cos(ph)), 0.5);
        c *= 1.0 - 0.5 * dl * dl;
        c = mix(c, vec3(0.9, 0.8, 0.6) * luma(c), 0.5 * smoothstep(0.5, 1.0, dl));
        c += 0.25 * rim * vec3(0.9, 0.85, 0.7);
        acc = max(acc, c * (w + rim * 0.6));
        cover = max(cover, w);
    }
    vec3 bg = imgLod(p * 0.8 + 0.5, 2.2) * 0.2;
    finish(max(acc, bg) * 1.2);
}

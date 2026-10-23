//@doc
 * @brief THRESHOLD SEESAW SPIN: the photo divided at a brightness threshold: the dark half turns one way about the middle of
 * the picture and the light half the other, each drawn only where its own brightness lies on its own side of the
 * threshold, and the threshold wanders.  The parts join where the turns come back to nothing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the threshold wanders with it
 *   audioAdvance    -> the turns (integrated, never a jump)
 *
 * Knobs: turnP (how far the halves turn), thresholdP (the base threshold), hueP.
//@params turnP thresholdP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 2.0 * audioAdvance;
    float th = 0.35 + 0.3 * clamp(thresholdP, 0.0, 1.0) + 0.12 * (clamp(audioSwell, 0.0, 1.0) - 0.5);
    float ang = (0.3 + 0.7 * clamp(turnP, 0.0, 1.0)) * sin(0.4 * t);
    vec2 q1 = rot2(ang) * p, q2 = rot2(-ang) * p;
    vec3 c1 = imgLod(q1 * 0.8 + 0.5, 0.4), c2 = imgLod(q2 * 0.8 + 0.5, 0.4);
    float w1 = 1.0 - smoothstep(th - 0.05, th + 0.05, luma(c1));
    float w2 = smoothstep(th - 0.05, th + 0.05, luma(c2));
    vec3 c0 = imgLod(p * 0.8 + 0.5, 0.4);
    vec3 col = (c1 * w1 + c2 * w2 + c0 * 0.02) / (w1 + w2 + 0.02);
    finish(col * 1.05);
}

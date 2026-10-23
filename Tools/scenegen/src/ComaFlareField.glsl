//@doc
 * @brief COMA FLARE FIELD: coma: every bright point of the photo away from the optical axis turns into a comet-shaped blur with a tail that points radially
 * outward, and the blurs grow with the distance from the axis; the axis wanders.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the axis wanders with the melody (smoothed)
 *   audioSwell      -> the coma's width
 *   audioPhase      -> the axis's slow drift (integrated)
 *
 * Knobs: reachP (the base length of the tails), hueP.
//@params reachP
//@audio audioSwell audioMelodyPitch
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.1 + 0.8 * audioPhase;
    vec2 ax = 0.25 * vec2(sin(0.6 * t), cos(0.4 * t)) + 0.1 * vec2(clamp(audioMelodyPitch, 0.0, 1.0) - 0.5, 0.0);
    vec2 d = p - ax;
    float r = length(d);
    vec2 dir = d / max(r, 1e-3);
    float reach = (0.05 + 0.18 * clamp(reachP, 0.0, 1.0)) * (0.5 + 1.2 * r) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 base = imgLod(uv, 0.5) * 0.55;
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 12; ++i) {
        float s = float(i) / 11.0;
        float w = 1.0 - s;
        vec2 q = uv + dir * s * reach * 0.8 + vec2(-dir.y, dir.x) * (s * s) * reach * 0.25 * sin(1.0 + 0.0 * float(i));
        vec3 c = imgLod(q, 0.5 + 2.0 * s);
        float hi = smoothstep(0.45, 0.85, luma(c));
        acc += c * hi * w;
        ws += w;
    }
    vec3 col = base + acc / ws * 1.1;
    finish(col);
}

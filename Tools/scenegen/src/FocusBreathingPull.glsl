//@doc
 * @brief FOCUS BREATHING PULL: focus breathing: when a lens is focused its angle of view changes; the photo swells and shrinks in rings from the middle, pulling the edges after it,
 * while the plane of sharpness travels through the depth (the brightness of the photo stands for depth: what lies at the focus is sharp, the rest soft).
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the focus's position (integrated, slow)
 *   audioSwell      -> the breath's depth
 *
 * Knobs: breathP (the base breathing), softP (the base softness off the focus), hueP.
//@params breathP softP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.08 * sceneTime + 0.5 * audioPhase;
    float ph = sin(t);
    float r = length(p);
    float amp = (0.02 + 0.06 * clamp(breathP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    float z = 1.0 + amp * ph * (0.4 + 1.2 * r);
    vec2 pp = p * z;
    vec2 uv = pp * 0.8 + 0.5;
    float depth = luma(imgLod(uv, 2.5));
    float focus = 0.5 + 0.35 * sin(0.7 * t + 1.0);
    float lod = 0.2 + (1.0 + 4.5 * clamp(softP, 0.0, 1.0)) * smoothstep(0.0, 0.5, abs(depth - focus));
    finish(imgLod(uv, lod) * 1.05);
}

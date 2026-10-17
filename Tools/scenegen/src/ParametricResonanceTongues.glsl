//@doc
 * @brief PARAMETRIC RESONANCE TONGUES: the Mathieu equation x'' + (a - 2 q cos 2t) x = 0, the swing pumped by
 * standing up and squatting -- over the plane of a and q its stability chart shows tongues of resonance rising from
 * a = 1, 4, 9 ...: inside them the motion grows, outside it stays bounded.  Every pixel integrates one period and
 * reads the Floquet trace; inside the tongues the field swings, faster the deeper it lies, and the photo swings
 * with it; outside it rests.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the drive: inside the tongues the field swings harder
 *   audioAdvance    -> the window slides along a (integrated)
 *   audioBeatPhase  -> the swinging's phase (continuous)
 *   audioKick       -> the tongue edges flash (light)
 *
 * Knobs: rangeP (how much of the chart), swingP (how far the photo swings), photoP (photo share), hueP.
//@params rangeP swingP photoP
//@audio audioBass audioKick audioBeatPhase
//@body
void main()
{
    vec2 p = screenP();
    float range = 6.0 + 10.0 * clamp(rangeP, 0.0, 1.0);
    float a = (p.x / 1.7777778 + 0.5) * range + 4.0 * (0.5 + 0.5 * sin(0.01 * sceneTime + 0.002 * audioAdvance)) - 1.0;
    float q = abs(p.y) * 2.0 * range * 0.6;                     // mirrored about the middle: q from 0 outward
    // one period (pi) of two solutions: (1, 0) and (0, 1), velocity Verlet
    vec2 x = vec2(1.0, 0.0), v = vec2(0.0, 1.0);
    float dt = 3.14159265 / 64.0, t = 0.0;
    for (int i = 0; i < 64; ++i) {
        float w2 = a - 2.0 * q * cos(2.0 * t);
        v -= 0.5 * dt * w2 * x;
        x += dt * v;
        t += dt;
        w2 = a - 2.0 * q * cos(2.0 * t);
        v -= 0.5 * dt * w2 * x;
    }
    float tr = x.x + v.y;                                       // the monodromy matrix's trace
    float unstable = smoothstep(2.0, 2.2, abs(tr));
    float growth = log(max(abs(tr), 1.0) + 1e-3);
    float drive = 0.5 + 0.8 * clamp(audioBass, 0.0, 1.0);
    float swing = unstable * sin(6.2831853 * audioBeatPhase + growth * 3.0) * drive;
    vec2 uv = p * 0.7 + 0.5 + vec2(0.0, 0.02 + 0.06 * clamp(swingP, 0.0, 1.0)) * swing;
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.1 + 0.15 * growth + 0.03 * audioPhase);
    vec3 col = mix(photo * 0.35 + tone * 0.05, mix(tone * 1.2, photo * 1.3, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0))
                   * (0.7 + 0.3 * swing), unstable);
    float edge = abs(dFdx(unstable)) + abs(dFdy(unstable));
    col += mix(tone, vec3(1.0), 0.6) * min(edge * 3.0, 1.0) * (0.4 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

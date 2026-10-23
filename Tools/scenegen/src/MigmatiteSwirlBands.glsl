//@doc
 * @brief MIGMATITE SWIRL BANDS: migmatite: bands of melted and of solid rock kneaded into swirls; the photo gives the lighter and the darker bands: stripes whose course is bent again and again by a flow that folds them over
 * themselves, so that the bands run in loops and whirls like marbled paper.  The kneading follows the swell and goes on slowly with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the kneading (how far the stripes are bent)
 *   audioAdvance    -> the flow goes on (integrated)
 *
 * Knobs: bandP (how fine the bands are), hueP.
//@params bandP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.01 * sceneTime + 0.03 * audioAdvance;
    float kn = 0.2 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = p;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        q += kn * vec2(fbm(q * 2.0 + vec2(fi * 3.1, t)) - 0.5, fbm(q * 2.0 + vec2(5.0 + fi * 2.3, -t)) - 0.5);
    }
    float N = 6.0 + 12.0 * clamp(bandP, 0.0, 1.0);
    float s = q.x * N * 0.5 + q.y * N * 0.3;
    float f = fract(s);
    vec3 c = imgLod(q * 0.8 + 0.5, 1.0);
    float band = smoothstep(0.35, 0.5, abs(f - 0.5) + 0.2 * (luma(c) - 0.5));
    finish(c * mix(0.35, 1.25, band) * 1.05);
}

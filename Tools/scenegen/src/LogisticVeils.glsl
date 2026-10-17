//@doc
 * @brief LOGISTIC VEILS: the bifurcation diagram of the logistic map x -> r x (1 - x) hung as veils -- each column a
 * value of r, its brightness the density of the orbit there: one bright thread splitting in two, four, eight,
 * dissolving into the chaotic veils with their dark windows of order.  Mirrored about the middle and rolling
 * endlessly sideways through the parameter range, as if the curtains were drawn past.  The veils glow in the
 * photo's colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the range of r shown: quiet music lingers in the period doublings, loud music in the chaos
 *   audioDrop       -> a drop lights the veils up (light)
 *   audioAdvance    -> the curtains roll (integrated)
 *   audioKick       -> the threads flash (light)
 *
 * Knobs: spanP (how wide a range of r), glowP (how soft the threads are), photoP (photo share), hueP.
//@params spanP glowP photoP
//@audio audioSwell audioKick audioDrop
//@body
void main()
{
    vec2 p = screenP();
    vec2 q = vec2(p.x, abs(p.y));
    // the window of r: a slow back and forth between 2.9 and 4, pushed toward the chaos by the music
    float roll = 0.5 + 0.5 * sin(0.02 * sceneTime + 0.004 * audioAdvance);
    float lo = 3.35 + 0.35 * roll * (0.6 + 0.4 * clamp(audioSwell, 0.0, 1.0));   // always reaching into the chaos
    float span = 0.2 + 0.4 * clamp(spanP, 0.0, 1.0);
    float r = clamp(lo + (q.x / 1.7777778 + 0.5) * span, 2.5, 4.0);
    float y = 1.0 - q.y * 2.0;                                  // x of the map, 0 at the edges .. 1 in the middle
    float pix = 2.0 / resolution.y;
    float sig = pix * (1.5 + 4.0 * clamp(glowP, 0.0, 1.0));
    // the orbit's density at this height: count the orbit points falling near it (after a run-in)
    float x = 0.3;
    for (int i = 0; i < 60; ++i) x = r * x * (1.0 - x);
    float dens = 0.0;
    for (int i = 0; i < 160; ++i) {
        x = r * x * (1.0 - x);
        float d = (x - y) / sig;
        dens += exp(-d * d);
    }
    dens = 1.0 - exp(-dens * 0.12);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.0, 0.2 * (r - 3.4));
    vec3 photo = imgLod(uv, 1.0);
    vec3 tone = imgPalette(0.25 + 0.5 * (r - 2.9) + 0.03 * audioPhase);
    vec3 veil = mix(tone * 1.3, photo * 1.4, 0.3 + 0.5 * clamp(photoP, 0.0, 1.0));
    vec3 col = imgLod(uv, 3.0) * 0.08
               + veil * dens * (0.8 + 0.6 * clamp(audioKick, 0.0, 1.0) * dens + 0.5 * clamp(audioDrop, 0.0, 1.0));
    finish(col);
}

//@doc
 * @brief PARTICLE LIFE CLUSTERS: the look of "particle life" -- swarms of
 * glowing particles of several species that attract and repel each other by
 * simple asymmetric rules, so they organise into living forms: cells with
 * membranes of one colour around a nucleus of another, chains that crawl,
 * rings that spin, hunters chasing prey, all drifting and re-forming
 * without end.  Rendered here as a field: every cell of a jittered grid
 * holds an organism whose layered rings of particles orbit, pulse and
 * split; neighbouring organisms merge where they touch.  Colours come from
 * the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the organisms crawl (integrated, jump-free)
 *   audioPhase      -> the rings spin (integrated)
 *   audioSpread     -> organism size
 *   audioRoughness  -> the membranes wobble
 *   audioHigh       -> the particles sparkle (light)
 *   audioSwell      -> the glow (slow)
 *
 * Knobs: speciesP (how many species/rings), densityP (particles per ring),
 * sizeP, hueP.
//@params speciesP densityP sizeP
//@audio audioPhase audioSpread audioRoughness audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float px = 1.0 / resolution.y;
    float cell = (0.28 + 0.22 * clamp(sizeP, 0.0, 1.0)) * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float crawl = 0.03 * sceneTime + 0.25 * audioAdvance;
    vec2 q = p / cell + vec2(crawl, crawl * 0.6);
    vec2 gi = floor(q);
    int nS = 2 + int(clamp(speciesP, 0.0, 1.0) * 2.99);
    vec3 col = vec3(0.005, 0.006, 0.012);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.5 + 0.35 * vec2(sin(sceneTime * 0.07 + hash21(id) * 6.28), cos(sceneTime * 0.06 + hash21(id + 1.0) * 6.28));
        vec2 d = q - c;
        float r = length(d);
        if (r > 1.3) continue;
        float ang = atan(d.y, d.x);
        vec3 ph = imgLod(id * 0.113 + 0.5, 5.0);
        float h0 = (satOf(ph) > 0.2) ? hue_of(ph) : hueP * 0.159 + hash21(id) * 0.3;
        // Rings of particles, one per species, each spinning at its own rate.
        for (int s = 0; s < 4; ++s) {
            if (s >= nS) break;
            float fs = float(s);
            float R = 0.12 + 0.2 * fs + 0.05 * sin(sceneTime * 0.3 + fs + hash21(id) * 6.0);
            R *= 1.0 + 0.08 * clamp(audioRoughness, 0.0, 1.0) * sin(ang * (3.0 + fs) + sceneTime);
            float n = floor(8.0 + 10.0 * fs * (0.5 + clamp(densityP, 0.0, 1.0)));
            float spin = (mod(fs, 2.0) < 0.5 ? 1.0 : -1.0) * (0.25 + 0.15 * fs) * (sceneTime * 0.3 + 2.0 * audioPhase);
            float a = ang - spin;
            float k = floor(a / 6.2831853 * n + 0.5);
            float ak = (k / n) * 6.2831853 + spin;
            vec2 pp = vec2(cos(ak), sin(ak)) * R;
            float dd = length(d - pp);
            float pr = (0.028 + 0.01 * fs) * (1.1 - 0.4 * clamp(densityP, 0.0, 1.0));
            vec3 sc = hsv2rgb(vec3(fract(h0 + fs * 0.27), 0.85, 1.0));
            float glow = smoothstep(pr, pr * 0.3, dd) * 1.3 + exp(-dd / (pr * 2.5)) * 0.25 * (0.6 + 0.8 * swell);
            float tw = 0.8 + 0.2 * sin(sceneTime * 4.0 + k * 1.7 + fs);
            col += sc * glow * tw * (0.8 + 0.6 * hi);
        }
        // The nucleus.
        vec3 nc = hsv2rgb(vec3(fract(h0 + 0.5), 0.6, 1.0));
        col += nc * exp(-r * 14.0) * 0.6 * (0.6 + 0.6 * swell);
    }
    finish(col);
}

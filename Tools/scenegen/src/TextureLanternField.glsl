//@doc
 * @brief TEXTURE LANTERN FIELD: looking straight up into a night sky full of
 * floating paper lanterns -- hundreds of glowing lanterns at every depth,
 * the near ones large and soft with the photograph printed on their paper
 * (each shows a different piece of it, lit from within), the far ones
 * small warm points, all drifting slowly upward and away, turning gently.
 * No horizon, no ground: the field of lanterns is endless and mirrors
 * without seams; the sky between them is deep blue with a warm haze.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lanterns drift (integrated, jump-free)
 *   audioSpread     -> how deep the field reaches (more layers)
 *   audioBass       -> the flames inside glow brighter (light)
 *   audioMode       -> the flame colour: amber in minor, rose-gold in major (slow blend)
 *   audioSwell      -> the warm haze between them (slow)
 *   audioHigh       -> the flames flicker (light)
 *
 * Knobs: densityP (how many), sizeP (lantern size), photoP (how much the
 * paper shows the photo), hueP.
//@params densityP sizeP photoP
//@audio audioSpread audioBass audioMode audioSwell audioHigh
//@expr densityP = clamp(0.5 + 0.3*swell + 0.2*seed2, 0.0, 1.0)
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float px = 1.0 / resolution.y;
    float drift = 0.02 * sceneTime + 0.25 * audioAdvance;

    // Night sky with a warm haze from all the lanterns.
    vec3 col = mix(vec3(0.02, 0.03, 0.09), vec3(0.08, 0.05, 0.1), 0.5 + 0.5 * fbm3(p * 1.5 + drift * 0.3));
    vec3 flameC = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.45, 0.3), clamp(audioMode, 0.0, 1.0));
    col += flameC * 0.04 * (0.5 + 0.8 * swell);

    // Layers from far (small) to near (big); each a jittered grid of lanterns.
    int nL = 4 + int(clamp(audioSpread, 0.0, 1.0) * 2.99);
    for (int L = 6; L >= 0; --L) {
        if (L >= nL) continue;
        float fl = float(L);
        float z = 1.0 + fl * 0.9;                       // depth
        float s = (0.35 + 0.35 * clamp(sizeP, 0.0, 1.0)) / z;
        vec2 q = p / s + vec2(fl * 7.1, drift * (1.8 / z) * 10.0 + fl * 3.3);
        vec2 gi = floor(q);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl * 13.0) > 0.12 + 0.25 * clamp(densityP, 0.0, 1.0)) continue;
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl);
            vec2 d = q - c;
            // A lantern seen from below: a rounded box with a darker rim at
            // the bottom opening where the flame sits.
            float w = 0.13 + 0.04 * hash21(id + 2.0);
            float turn = 0.3 * sin(sceneTime * 0.1 + hash21(id) * 6.28);
            d = rot2(turn) * d;
            // a paper lantern from below: round-cornered, slightly barrel-shaped
            float box = length(max(abs(d) * vec2(1.0 + 0.3 * d.y * d.y / (w * w), 1.0) - vec2(w, w * 1.3), 0.0)) - 0.06;
            float aa = px / s * 1.5;
            float cov = smoothstep(aa, -aa, box);
            if (cov <= 0.0) {
                // glow halo in the haze
                col += flameC * exp(-max(box, 0.0) * 7.0) * 0.1 * (0.6 + 0.8 * bass) / z;
                continue;
            }
            // The paper: the photo printed on it, lit from within.
            vec2 puv = id * 0.137 + d * 0.4 + 0.5;
            vec3 paper = imgLod(puv, 1.0 + fl * 0.6);
            vec3 tint = mix(flameC, glowColour(paper, id * 0.3, hueP * 0.159), 0.2) * vec3(1.1, 0.85, 0.6);
            // Warm light through thin paper: the photo only as the paper's pattern.
            vec3 lit = tint * mix(1.0, 0.45 + 1.1 * luma(paper), clamp(photoP, 0.0, 1.0) * 0.8) * mix(vec3(1.0), paper / max(luma(paper), 0.05) * 0.8, 0.35 * clamp(photoP, 0.0, 1.0));
            // Brighter toward the flame (the lantern's lower centre).
            float core = exp(-length(d) * 9.0);
            float flick = 1.0 + 0.25 * hi * sin(sceneTime * 9.0 + hash21(id) * 20.0);
            vec3 lc = lit * (0.6 + 2.2 * core) * (0.8 + 0.6 * bass) * flick;
            // Frame ribs of the lantern, faintly darker.
            float ribs = smoothstep(0.02, 0.0, abs(abs(d.x) - w * 0.5)) * 0.25;
            lc *= 1.0 - ribs;
            // Far lanterns fade into the haze.
            lc = mix(lc, flameC * 0.6, smoothstep(2.0, 6.0, z) * 0.6);
            col = mix(col, lc, cov);
        }
    }
    finish(col);
}

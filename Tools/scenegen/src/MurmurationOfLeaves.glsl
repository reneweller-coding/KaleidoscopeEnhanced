//@doc
 * @brief MURMURATION OF LEAVES: a storm of round leaves moving like a flock of starlings -- thousands of leaf discs
 * swirl through the frame together, gathering into a great dark shape that stretches, folds, splits and pours into
 * itself again, thinning to a few stragglers at its edges.  Every leaf tumbles as it flies (its disc foreshortening
 * as it turns edge-on) and wears the photo's colour from where it flies.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flock's shape folds and pours (integrated: the music's drive)
 *   audioSwell      -> the flock gathers denser
 *   audioKick       -> the leaves catch the light (light)
 *
 * Knobs: densityP (how many leaves), sizeP (the leaves' size), photoP (photo share), hueP.
//@params densityP sizeP photoP
//@audio audioSwell audioKick
//@body
/**  The flock's shape: a folding, drifting density (domain-warped noise), high inside the flock.
 *
 * @param x  The point. (in)
 * @param t  The shape's time. (in)
 *
 * @return
 *   The density, 0..1.
 **/
float flock(vec2 x, float t)
{
    vec2 w = vec2(fbm(x * 1.3 + vec2(0.2 * t, -0.1 * t)), fbm(x * 1.3 + vec2(5.2, 1.3) - vec2(0.13 * t, 0.17 * t)));
    float n = fbm(x * 1.1 + 1.6 * w + vec2(0.07 * t, 0.0));
    return smoothstep(0.42, 0.62, n);
}

void main()
{
    vec2 p = screenP();
    float t = 0.25 * sceneTime + 0.8 * audioAdvance;
    float sp = 0.034 - 0.012 * clamp(densityP, 0.0, 1.0);
    float rl = sp * (0.4 + 0.12 * clamp(sizeP, 0.0, 1.0));
    vec2 q = p - vec2(0.05, 0.02) * t;                          // the leaves' frame drifts with the flock
    vec2 cell = floor(q / sp);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.35 + 0.5, 4.5) * 0.25 + tone * 0.05;
    float gather = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 h = hash22(cc);
        vec2 c = (cc + 0.5 + 0.7 * (h - 0.5)) * sp;
        // each leaf flutters about its place
        float ph = 6.2831853 * h.x + t * (2.0 + 2.0 * h.y);
        c += sp * 0.35 * vec2(sin(ph), cos(1.3 * ph));
        vec2 world = c + vec2(0.05, 0.02) * t;
        float dens = flock(world, t);
        float exist = smoothstep(h.y - 0.08, h.y + 0.08, dens * (0.8 + 0.5 * gather) + 0.02);
        if (exist < 0.001) continue;
        // the tumble: the disc foreshortened along its spin axis
        float spin = t * (1.5 + 2.0 * h.x) + 6.2831853 * h.y;
        vec2 ax = vec2(cos(6.2831853 * h.x), sin(6.2831853 * h.x));
        vec2 d = q - c;
        float along = dot(d, ax), across = dot(d, vec2(-ax.y, ax.x));
        float squash = 0.25 + 0.75 * abs(cos(spin));
        float dl = length(vec2(along / squash, across));
        float leaf = smoothstep(rl, rl * 0.7, dl) * exist;
        if (leaf > 0.001) {
            vec3 photo = imgLod(world * 0.55 + 0.5, 1.0);
            float lit = 0.55 + 0.45 * cos(spin) * cos(spin);
            vec3 cl = mix(tone * 1.2, photo * 1.4, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * lit * (0.9 + 0.5 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, cl * (0.6 + 0.4 * smoothstep(rl, 0.0, dl)), leaf);
        }
    }
    finish(col * 1.35);
}

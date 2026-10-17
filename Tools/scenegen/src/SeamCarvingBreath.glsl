//@doc
 * @brief SEAM CARVING BREATH: the photo breathing content-aware, in the manner of seam carving -- the picture is
 * squeezed and stretched where it matters least: its empty, even stretches give way while its edges and details
 * keep their size.  Along every row and every column the picture's own unimportance is summed and the frame is
 * shared out anew by it, so the photo swells and shrinks unevenly, like a living thing, around its firm parts.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how deeply it breathes
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: breathP (the base breath), rateP (the breath's pace), photoP (how sharp the picture stays), hueP.
//@params breathP rateP photoP
//@audio audioSwell
//@body
/**  Maps a position across the frame to where the picture comes from, by sharing the frame out along one line in
 * proportion to a weight that is low where the picture is busy.
 *
 * @param s      The position across the frame (0..1). (in)
 * @param uv0    The line's start in the photo. (in)
 * @param dirv   The line's direction and length in the photo. (in)
 * @param kappa  How strongly the even parts give way (signed: swell or shrink). (in)
 *
 * @return
 *   The position along the line in the photo (0..1).
 **/
float carveMap(float s, vec2 uv0, vec2 dirv, float kappa)
{
    float cum[25];
    cum[0] = 0.0;
    for (int i = 0; i < 24; ++i) {
        vec2 u = uv0 + dirv * ((float(i) + 0.5) / 24.0);
        float e = clamp(abs(luma(imgLod(u, 4.5)) - luma(imgLod(u, 7.0))) * 7.0, 0.0, 1.0);   // how busy the picture is here
        float w = max(1.0 + kappa * (0.5 - e), 0.15);           // even parts weigh more (or less) than busy ones
        cum[i + 1] = cum[i] + w;
    }
    float target = s * cum[24];
    float r = 0.0;
    for (int i = 0; i < 24; ++i) {
        if (cum[i + 1] >= target) { r = (float(i) + (target - cum[i]) / max(cum[i + 1] - cum[i], 1e-5)) / 24.0; break; }
    }
    return r;
}

void main()
{
    vec2 sp = gl_FragCoord.xy / resolution;
    float breath = sin((0.25 + 0.4 * clamp(rateP, 0.0, 1.0)) * sceneTime);
    float kappa = breath * (0.5 + 1.2 * clamp(breathP, 0.0, 1.0)) * (0.6 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    vec2 drift = 0.05 * vec2(sin(0.017 * sceneTime + 0.01 * audioAdvance), cos(0.013 * sceneTime));
    vec2 base = vec2(0.5) - vec2(0.45 * resolution.x / resolution.y, 0.45) * 0.62 + drift;
    vec2 span = vec2(0.9 * resolution.x / resolution.y, 0.9) * 0.62;
    float u = carveMap(sp.x, base + vec2(0.0, span.y * sp.y), vec2(span.x, 0.0), kappa);
    float v = carveMap(sp.y, base + vec2(span.x * u, 0.0), vec2(0.0, span.y), -kappa);
    vec2 uv = base + span * vec2(u, v);
    vec3 col = imgLod(uv, 0.4 * (1.0 - clamp(photoP, 0.0, 1.0)));
    finish(col * 1.05);
}

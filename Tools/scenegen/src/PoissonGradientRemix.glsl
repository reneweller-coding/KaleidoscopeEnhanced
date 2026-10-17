//@doc
 * @brief POISSON GRADIENT REMIX: blending in the gradient domain -- the edges and fine structure of one picture set
 * into the broad surfaces and colours of another, as Poisson image editing does: one picture's Laplacian pyramid
 * above a cut-off level, the other's below it.  The two are the current photo and the one shown before it (gliding
 * over to their new pictures when the photos change).  With every section the cut-off moves, so sometimes only the
 * finest grain of the one rides on the other, sometimes all its forms; both pictures drift, so the seams of the remix
 * keep moving.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section moves the cut-off level (gliding over four seconds)
 *   audioAdvance    -> both pictures drift (integrated)
 *
 * Knobs: cutP (the base cut-off), contrastP (how strongly the edges are set in), photoP (how the second photo is
 * framed: turned and shifted a little), hueP.
//@params cutP contrastP photoP
//@audio audioSectionId audioSectionAge
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.05 * vec2(sin(0.018 * sceneTime + 0.01 * audioAdvance), cos(0.015 * sceneTime));
    vec2 uvA = 0.5 + p * 0.5 + drift;
    float cut2 = clamp(photoP, 0.0, 1.0);
    vec2 uvB = 0.5 + rot2(0.6 * (cut2 - 0.5)) * (p * 0.5 - 0.7 * drift) + 0.08 * vec2(-cut2, cut2);
    // the cut-off level: below it the second picture, above it the first one's detail
    float k = max(audioSectionId, 0.0);
    float lvNow = 1.5 + 3.0 * hash11(k * 1.37 + 0.2), lvBefore = 1.5 + 3.0 * hash11((k - 1.0) * 1.37 + 0.2);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    float cutLv = mix(lvBefore, lvNow, m) + 1.5 * (clamp(cutP, 0.0, 1.0) - 0.5);
    float gain = 1.0 + 0.8 * clamp(contrastP, 0.0, 1.0);
    vec3 col = imgB(uvB, cutLv);                                // the second photo's broad surfaces
    vec3 prev = imgLod(uvA, cutLv);
    for (int i = 0; i < 6; ++i) {
        float lv = cutLv - float(i + 1);
        if (lv < -0.5) break;
        vec3 l = imgLod(uvA, max(lv, 0.0));
        col += (l - prev) * gain;                               // the first picture's detail above the cut
        prev = l;
    }
    finish(max(col, 0.0) * 1.05);
}

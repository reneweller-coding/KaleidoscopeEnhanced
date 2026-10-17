//@doc
 * @brief PHOTO MEAN SHIFT BLOOMS: mean-shift segmentation in motion -- every point climbs, a few steps, toward the
 * densest crowd of like colours around it in place and colour together, and takes the colour it arrives at.  The
 * picture gathers into blooms of flat colour that draw together and open again as the reach of the climb swells and
 * shrinks; the photo drifts beneath, so the blooms keep finding new shapes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the climb's reach: the blooms draw together on loud passages
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: reachP (the base reach), likeP (how alike colours must be to gather), photoP (photo share), hueP.
//@params reachP likeP photoP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.016 * sceneTime + 0.01 * audioAdvance), cos(0.012 * sceneTime));
    vec2 x = p * 0.5 + 0.5 + drift;
    float hs = (0.016 + 0.02 * clamp(reachP, 0.0, 1.0)) * (0.5 + 1.1 * clamp(audioSwell, 0.0, 1.0)) * (0.8 + 0.4 * sin(0.21 * sceneTime));
    float hr = 0.08 + 0.25 * clamp(likeP, 0.0, 1.0);
    vec3 c = imgLod(x, 1.0);
    for (int it = 0; it < 5; ++it) {
        vec2 sx = vec2(0.0);
        vec3 sc = vec3(0.0);
        float sw = 0.0;
        for (int k = 0; k < 8; ++k) {
            float a = 0.7853982 * float(k) + 0.39 * float(it);
            vec2 y = x + hs * vec2(cos(a), sin(a));
            vec3 cy = imgLod(y, 1.8);
            vec3 d = cy - c;
            float w = exp(-dot(d, d) / (hr * hr));
            sx += y * w; sc += cy * w; sw += w;
        }
        sw += 1.0; sx += x; sc += c;                            // the point itself
        x = sx / sw;
        c = sc / sw;
    }
    vec3 col = mix(c, imgLod(p * 0.5 + 0.5 + drift, 0.0), 0.15 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.07);
}

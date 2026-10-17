//@doc
 * @brief LAPLACIAN PYRAMID EQUALIZER: the photo taken apart into its frequency bands -- the Laplacian pyramid, from the
 * broad masses down to the finest grain -- and put back together with every band turned up or down by a band of the
 * music: the bass lifts the big forms, the mids the middle structures, the highs the fine detail.  Slow waves of
 * emphasis run across the frame, band by band, so the picture's structure ripples with the sound.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSubBass .. audioHigh -> each lifts its own band of the photo (seven bands)
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: depthP (how far the music bends the bands), waveP (the waves of emphasis), photoP (how much colour comes back
 * besides the bands), hueP.
//@params depthP waveP photoP
//@audio audioSubBass audioBass audioLowMid audioMid audioUpperMid audioHigh audioRolloff
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = 0.5 + rot2(0.05 * sin(0.023 * sceneTime)) * p * (0.55 + 0.04 * sin(0.017 * sceneTime))
              + 0.07 * vec2(sin(0.019 * sceneTime + 0.01 * audioAdvance), cos(0.015 * sceneTime));
    float depth = 0.6 + 1.6 * clamp(depthP, 0.0, 1.0);
    float bandsA[7];
    bandsA[0] = audioRolloff; bandsA[1] = audioHigh; bandsA[2] = audioUpperMid; bandsA[3] = audioMid;
    bandsA[4] = audioLowMid; bandsA[5] = audioBass; bandsA[6] = audioSubBass;
    vec3 col = imgLod(uv, 7.0);                                 // the broadest mass
    vec3 prev = col;
    for (int k = 6; k >= 0; --k) {
        float fk = float(k);
        vec3 lk = imgLod(uv, fk);
        vec3 band = lk - prev;                                  // this level's detail over the next broader one
        prev = lk;
        // the band's gain: its music band, carried across the frame by a slow wave of its own
        float dirA = 1.3 * fk + 0.05 * sceneTime;
        float wave = sin(dot(p, vec2(cos(dirA), sin(dirA))) * (2.0 + 0.6 * fk) - 0.4 * sceneTime - 0.9 * fk);
        float g = 0.55 + depth * clamp(bandsA[k], 0.0, 1.5) + 0.45 * clamp(waveP, 0.0, 1.0) * wave;
        col += band * g;
    }
    vec3 plain = imgLod(uv, 0.0);
    col = mix(col, plain, 0.15 * clamp(photoP, 0.0, 1.0));
    finish(max(col, 0.0) * 1.05);
}

//@doc
 * @brief HISTOGRAM FLOW MATCH: the colours of one picture carried over into another's by optimal transport along each
 * colour channel -- every value of the first picture moves to the value at the same rank in the second, so the
 * first keeps its forms but takes on the second's whole palette.  The two are the current photo and the one shown
 * before it (gliding over to their new pictures when the photos change).  On each change of harmony the colours
 * flow one way or back, in patches that drift across the frame, so the palette pours over in waves rather than all at
 * once.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony sends the colours over or back (gliding)
 *   audioAdvance    -> the pictures and the patches drift (integrated)
 *
 * Knobs: patchP (the patches' size), cutP (how the second photo is framed: turned and shifted a little), photoP (how
 * far the flow goes), hueP.
//@params patchP cutP photoP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.05 * vec2(sin(0.017 * sceneTime + 0.01 * audioAdvance), cos(0.014 * sceneTime));
    vec2 uvA = 0.5 + p * 0.5 + drift;
    float cut = clamp(cutP, 0.0, 1.0);
    vec2 offB = 0.08 * vec2(cut, -cut);
    mat2 RB = rot2(0.6 * (cut - 0.5));
    // sixteen samples of each picture: their values per channel, sorted, are the two distributions
    float aS[16], bR[16], bG[16], bB[16];
    vec3 aC[16];
    for (int i = 0; i < 16; ++i) {
        vec2 g = (vec2(float(i % 4), float(i / 4)) + 0.5) / 4.0 - 0.5;
        aC[i] = imgLod(0.5 + g * 0.9 + drift, 4.0);
        vec3 b = imgB(0.5 + RB * (g * 0.9 - drift) + offB, 4.0);   // the second photo
        bR[i] = b.r; bG[i] = b.g; bB[i] = b.b;
    }
    for (int a = 1; a < 16; ++a) {
        for (int k = a; k > 0; --k) {
            if (bR[k - 1] > bR[k]) { float t = bR[k]; bR[k] = bR[k - 1]; bR[k - 1] = t; }
            if (bG[k - 1] > bG[k]) { float t = bG[k]; bG[k] = bG[k - 1]; bG[k - 1] = t; }
            if (bB[k - 1] > bB[k]) { float t = bB[k]; bB[k] = bB[k - 1]; bB[k - 1] = t; }
        }
    }
    vec3 c = imgLod(uvA, 0.0);
    // each channel's rank in the first picture (soft), then the second picture's value at that rank
    vec3 q = vec3(0.0);
    for (int i = 0; i < 16; ++i) q += smoothstep(-0.04, 0.04, c - aC[i]);
    q = clamp(q / 16.0, 0.0, 1.0) * 15.0;
    ivec3 i0 = ivec3(floor(q)), i1 = min(i0 + 1, ivec3(15));
    vec3 f = fract(q);
    vec3 target = vec3(mix(bR[i0.x], bR[i1.x], f.x), mix(bG[i0.y], bG[i1.y], f.y), mix(bB[i0.z], bB[i1.z], f.z));
    // how far the flow has gone: over on one change of harmony, back on the next, in drifting patches
    float h = max(audioHarmAdvance, 0.0);
    float hs = floor(h) + smoothstep(0.2, 0.8, fract(h));
    float tri = 1.0 - abs(mod(hs, 2.0) - 1.0);
    float sz = 1.5 + 3.0 * (1.0 - clamp(patchP, 0.0, 1.0));
    float patchN = fbm(p * sz + vec2(0.05 * sceneTime, -0.03 * sceneTime) + 0.02 * audioAdvance);
    float t = smoothstep(0.0, 1.0, clamp(0.2 + 0.6 * tri + 1.2 * (patchN - 0.5), 0.0, 1.0)) * (0.6 + 0.4 * clamp(photoP, 0.0, 1.0));
    vec3 col = mix(c, target, t);
    finish(col * 1.05);
}

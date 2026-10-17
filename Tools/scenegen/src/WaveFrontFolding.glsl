//@doc
 * @brief WAVEFRONT FOLDING: wavefronts leaving a wavy source curve -- each front is the curve moved out along its
 * normals by the travel time, and as they travel the concave parts focus, fold over themselves and strike
 * cusps and swallowtails; their envelope is a bright caustic.  The fronts stream outward one after another,
 * mirrored about the source, so the frame is filled with nested, folding lines over the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the fronts stream outward, one per beat (continuous)
 *   audioSwell      -> the source's waviness: how hard the fronts fold
 *   audioKick       -> the caustics flash (light)
 *
 * Knobs: frontsP (how many fronts on screen), waveP (the source's wavelength), photoP (photo share), hueP.
//@params frontsP waveP photoP
//@audio audioSwell audioKick audioBeatPhase
//@body
void main()
{
    vec2 p = screenP();
    vec2 q = vec2(p.x, abs(p.y));                               // mirrored about the source line
    int nf = 4 + int(6.0 * clamp(frontsP, 0.0, 1.0));
    float amp = 0.04 + 0.08 * clamp(audioSwell, 0.0, 1.0);
    float kx = 6.2831853 * (2.0 + 3.0 * clamp(waveP, 0.0, 1.0));
    float drift = 0.02 * sceneTime;
    float lineSum = 0.0, caus = 0.0;
    float spacing = 0.5 / float(nf);
    for (int f = 0; f < 10; ++f) {
        if (f >= nf) break;
        float T = (float(f) + fract(audioBeatPhase)) * spacing;  // this front's travel time
        // the front: points s on the source y0(s) = amp cos(kx s), moved by T along the normal; find the samples
        // closest to q among 48 along the visible stretch
        float best = 1e9;
        float dens = 0.0;
        for (int i = 0; i < 48; ++i) {
            float s = q.x + (float(i) / 47.0 - 0.5) * 0.6;
            float y0 = amp * cos(kx * (s - drift));
            float dy = -amp * kx * sin(kx * (s - drift));
            vec2 nrm = normalize(vec2(-dy, 1.0));
            vec2 pt = vec2(s, y0) + nrm * T;
            float d = length(q - pt);
            best = min(best, d);
            dens += exp(-d * d * 20000.0);
        }
        lineSum += exp(-best * best * 30000.0);
        caus += max(dens - 1.0, 0.0);                             // several branches of a front meet: a caustic
    }
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(0.3 + 0.1 * q.y * 4.0 + 0.03 * audioPhase);
    vec3 col = photo * (0.25 + 0.55 * clamp(photoP, 0.0, 1.0) + 0.25 * min(lineSum, 1.0));
    col += mix(tone, vec3(1.0), 0.4) * min(lineSum, 1.0) * 0.5;
    col += mix(tone, vec3(1.0), 0.7) * min(caus * 0.4, 1.0) * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

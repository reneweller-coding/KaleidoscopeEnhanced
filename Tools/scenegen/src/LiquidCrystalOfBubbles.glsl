//@doc
 * @brief LIQUID CRYSTAL OF BUBBLES: a raft of round bubbles whose sizes follow the music -- every bubble listens to one
 * band of the spectrum and swells while its band sounds, shrinks when it falls quiet.  The raft orders itself into
 * a close hexagonal packing when the bubbles are alike, tears open into gaps when some of them shrink away, and
 * coarsens when a few grow large and crowd their neighbours aside.  Each bubble holds the photo, lensed by its dome.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum   -> each bubble's size follows its own band (32 bands)
 *   audioAdvance    -> the raft drifts and its order slips (integrated)
 *   audioKick       -> the bubbles' rims flash (light)
 *
 * Knobs: sizeP (the raft's spacing), orderP (how close to a perfect packing), photoP (photo share), hueP.
//@params sizeP orderP photoP
//@audio audioSpectrum[32] audioKick
//@body
void main()
{
    vec2 p = screenP();
    float a = 0.07 + 0.06 * clamp(sizeP, 0.0, 1.0);
    vec2 drift = vec2(0.02 * sceneTime + 0.05 * audioAdvance, 0.006 * sceneTime);
    vec2 q = p + drift;
    vec2 sk = vec2(q.x - q.y * 0.57735, q.y * 1.1547) / a;
    vec2 base = floor(sk);
    float disorder = 0.45 * (1.0 - clamp(orderP, 0.0, 1.0));
    float tw = 0.25 * sceneTime + 0.6 * audioAdvance;
    vec3 tone = imgPalette(0.5 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.35 + 0.5, 4.0) * 0.18;
    float bestF = -1e9;
    vec3 bestCol = col;
    for (int j = -2; j <= 2; ++j) for (int i = -2; i <= 2; ++i) {
        vec2 c = base + vec2(float(i), float(j));
        vec2 h = hash22(c);
        vec2 site = vec2(c.x + 0.5 * c.y, c.y * 0.8660254) * a;
        site += a * disorder * (vec2(noise2(c * 0.7 + tw), noise2(c * 0.7 + 5.0 + tw)) - 0.5) * 2.0;
        int band = int(h.x * 31.99);
        float lvl = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        float r = a * (0.18 + 0.5 * lvl) * (0.8 + 0.4 * h.y);
        vec2 d = q - site;
        float dl = length(d);
        // the bubble in front: the one whose surface lies highest here (a power diagram of domes)
        float f = r * r - dl * dl;
        if (f > 0.0 && f > bestF) {
            bestF = f;
            float z = sqrt(f) / r;                              // the dome's height, 0 at the rim .. 1 at the top
            vec2 lens = d / r * (1.0 - z) * 0.08;
            vec3 photo = imgLod((site - drift) * 0.5 + 0.5 + lens + d * 0.6, 0.6);
            vec3 cb = mix(tone * 1.2, photo * 1.4, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.55 + 0.6 * z);
            float rim = smoothstep(0.25, 0.0, z);
            cb += mix(tone, vec3(1.0), 0.6) * rim * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
            cb += pow(max(1.0 - length(d / r - vec2(-0.35, 0.35)), 0.0), 6.0) * 0.5;   // a highlight
            bestCol = cb;
        }
    }
    col = bestF > -1e8 ? bestCol : col;
    finish(col);
}

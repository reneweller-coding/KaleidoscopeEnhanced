//@doc
 * @brief KALEIDO SAND MANDALA: a sand mandala in the photo's colours that fills the frame to its corners: rings of
 * symmetric patterns laid grain by grain, new rings growing at the outside while the old ones at the middle blow
 * away in drifts of loose sand.  The mandala lives in log-radius, so growing outward and blowing away inward are
 * one steady shift, and the cycle has no end: a ring is born at the rim, travels inward as new ones arrive outside
 * it, and dissolves at the middle.  Each ring is a symmetric band (its own petal count) read from the photo; the sand
 * is round grains on a lattice in the same coordinates, so the grains stay round.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the laying: within each phrase the newest ring fills in, grain by grain (a smooth wave)
 *   audioChromaHue -> the key sets the rings' symmetry (the light of two counts cross-faded)
 *   audioAdvance   -> the rings travel inward (integrated)
 *
 * Knobs: ringP (the rings' width), grainP (the grains' size), hueP.
//@params ringP grainP
//@audio audioPhrasePos audioChromaHue
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float W = 0.3 + 0.25 * clamp(ringP, 0.0, 1.0);              // a ring's width in log radius
    float shift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float sym = 6.0 + 4.0 * (0.5 + 0.5 * sin(audioChromaHue));
    float sk = floor(sym), sm = smoothstep(0.2, 0.8, sym - sk);
    float r = max(length(p), 1e-4);
    float u = log(r) / W + shift;                                // rings travel inward as shift grows
    float ring = floor(u);
    float fu = u - ring;
    float th = atan(p.y, p.x);
    // the ring's pattern: petals of its own count, read from the photo across the ring and round the petal
    float hr = fract(sin(ring * 12.9898) * 43758.5453);
    vec3 pat = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float n = (j == 0 ? sk : sk + 1.0) + 2.0 * floor(hr * 3.0);
        float sec = 6.2831853 / n;
        float a = abs(mod(th + hr * 6.2831853, sec) - 0.5 * sec) / (0.5 * sec);
        vec3 photo = imgLod(vec2(0.15 + 0.7 * a, 0.15 + 0.7 * abs(fu * 2.0 - 1.0)) * 0.8 + vec2(0.1 * hr, 0.05), 1.2);
        float l = luma(photo);
        vec3 c = mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.3 + 1.2 * l), 0.5);
        pat += c * (j == 0 ? 1.0 - sm : sm);
    }
    // the sand: round grains on a lattice in (log r, angle) -- conformal, so they stay round
    float grainN = floor(90.0 - 40.0 * clamp(grainP, 0.0, 1.0));
    vec2 g = vec2(u * W, th) * grainN / 6.2831853;
    vec2 gid = floor(g);
    float hg = fract(sin(dot(gid, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 gat = gid + 0.5 + 0.3 * (vec2(fract(hg * 7.3), fract(hg * 3.1)) - 0.5);
    float grain = smoothstep(0.5, 0.2, length(g - gat));
    // laying and blowing: a ring is full in the middle of its life; at the rim (newest) it fills grain by grain as
    // the phrase goes on, near the middle (oldest) it thins out grain by grain
    float age = -log(r) / W;                                     // 0 at the rim, growing inward
    float lay = smoothstep(-0.2, 0.6, age + 0.8 * (0.5 - 0.5 * cos(6.2831853 * audioPhrasePos)) - hg * 0.6);
    float blow = smoothstep(7.5, 5.5, age + hg * 0.8);          // only the innermost rings blow away
    float sand = lay * blow;
    vec3 col = pat * (0.6 + 0.4 * grain) * sand;
    // loose drifts where the sand blows: a soft glow of the family
    col += famCol(fh, 0.4) * 0.08 * (1.0 - blow) * grain;
    col *= smoothstep(0.0, 0.04, min(fu, 1.0 - fu)) * 0.25 + 0.75;
    finish(col);
}

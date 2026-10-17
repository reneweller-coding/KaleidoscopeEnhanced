//@doc
 * @brief COULOMB EXPLOSION BLOOM: a cloud of round charges blown apart by its own repulsion -- a Coulomb explosion.
 * The cloud is densest in the middle, so the charges there are pushed hardest relative to where they start: they
 * overtake those farther out, and the cloud does not simply swell but piles itself into a bright shell racing
 * outward, with a thinning core behind it.  Every phrase a new cloud gathers and bursts, fading in as the last one
 * fades out; every charge is a bead coloured by the photo at the place it started.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> each phrase one cloud: gathering, bursting, fading (continuous across the phrases)
 *   audioSwell      -> how hard the cloud bursts
 *   audioKick       -> the beads flash (light)
 *
 * Knobs: chargeP (how many charges), spreadP (the cloud's size), photoP (photo share), hueP.
//@params chargeP spreadP photoP
//@audio audioPhrasePos audioSwell audioKick
//@body
float gSig = 0.1;          // the cloud's width
float gKick = 1.0;         // how hard it bursts
float gTau = 0.0;          // the time since the burst

/**  Where a charge starting at radius r0 stands now: driven out by the charge inside its radius (Gaussian cloud).
 *
 * @param r0  The starting radius. (in)
 *
 * @return
 *   The radius now.
 **/
float radiusNow(float r0)
{
    float Q = 1.0 - exp(-r0 * r0 / (2.0 * gSig * gSig));
    float v = gKick * sqrt(Q / max(r0, 1e-4)) * 0.12;
    return r0 + v * gTau * (1.0 - exp(-gTau / 0.5));
}

void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    gSig = 0.06 + 0.05 * clamp(spreadP, 0.0, 1.0);
    gKick = 0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    gTau = 3.2 * prog;
    float alpha = smoothstep(0.0, 0.05, prog) * (1.0 - smoothstep(0.92, 1.0, prog));
    vec2 ctr = 0.15 * vec2(sin(0.05 * sceneTime), cos(0.037 * sceneTime));
    vec2 q = p - ctr;
    float r = length(q);
    vec2 dir = q / max(r, 1e-5);
    float sp = 0.012 - 0.005 * clamp(chargeP, 0.0, 1.0);
    vec3 tone = imgPalette(0.6 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    // every starting radius that lands here now (more than one inside the shell, where charges have overtaken)
    float prevF = radiusNow(0.0) - r;
    float prevR0 = 0.0;
    float glow = 0.0;
    for (int k = 1; k <= 28; ++k) {
        float r0 = float(k) / 28.0 * 4.5 * gSig;
        float fv = radiusNow(r0) - r;
        if (sign(fv) != sign(prevF)) {
            float rc = mix(prevR0, r0, prevF / (prevF - fv));
            vec2 x0 = dir * rc;
            vec2 g = x0 / sp;
            vec2 cell = floor(g);
            for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
                vec2 cc = cell + vec2(float(i), float(j));
                vec2 site = (cc + 0.5 + 0.35 * (hash22(cc) - 0.5)) * sp;
                float rs = length(site);
                float dens = exp(-rs * rs / (2.0 * gSig * gSig));
                float exist = smoothstep(hash21(cc + 3.3) - 0.05, hash21(cc + 3.3) + 0.05, dens * 1.2);
                if (exist < 0.001) continue;
                vec2 now = site / max(rs, 1e-5) * radiusNow(rs);
                float d = length(q - now);
                float rad = sp * 0.5;
                float bead = smoothstep(rad, rad * 0.45, d) * exist;
                glow += exp(-d * d / (rad * rad * 4.0)) * 0.08 * exist;
                if (bead > 0.001) {
                    vec3 photo = imgLod((site + ctr) * 0.9 + 0.5, 1.0);
                    vec3 cb = mix(tone * 1.4, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.5 * clamp(audioKick, 0.0, 1.0));
                    col = mix(col, cb, bead * alpha);
                }
            }
        }
        prevF = fv;
        prevR0 = r0;
    }
    col += tone * glow * alpha * 1.5;
    finish(col * 1.4);
}

//@doc
 * @brief PHONON LATTICE WAVES: a crystal lattice of light points with sound waves running through it: each point
 * swings about its rest place, carried by a few plane waves whose strengths come from the music's spectrum -- the
 * loudest bands become the strongest waves -- so the lattice ripples, compresses and shears in moving patterns.
 * Every wave has its own direction, wavelength and polarisation (along its travel, compressing; or across it,
 * shearing); the displacement is their sum.  Each pixel checks the lattice points of its cell and its neighbours.
 * The points' light is shades of one colour family from the photo, brighter where the lattice is squeezed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> the waves' strengths: six bands, six waves
 *   audioAdvance      -> the waves run (integrated)
 *
 * Knobs: latticeP (the lattice' spacing), ampP (the waves' base amplitude), hueP.
//@params latticeP ampP
//@audio audioSpectrum[32]
//@body
/**  The lattice' displacement at a rest place.
 *
 * @param r     The rest place. (in)
 * @param t     The waves' phase. (in)
 * @param amp   The waves' base amplitude. (in)
 *
 * @return
 *   The displacement.
 **/
vec2 displace(vec2 r, float t, float amp)
{
    vec2 u = vec2(0.0);
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        vec2 dir = vec2(cos(1.05 * fk + 0.3), sin(1.05 * fk + 0.3));
        float kk = 4.0 + 3.0 * fk;
        float A = amp * (0.4 + 0.6 * clamp(audioSpectrum[2 + 5 * k], 0.0, 1.0)) / (1.0 + 0.3 * fk);
        vec2 pol = mod(fk, 2.0) < 0.5 ? dir : vec2(-dir.y, dir.x);
        u += A * pol * sin(kk * dot(dir, r) - (2.0 + 0.4 * fk) * t);
    }
    return u;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.045 + 0.03 * clamp(latticeP, 0.0, 1.0);
    float amp = S * (0.2 + 0.15 * clamp(ampP, 0.0, 1.0));
    float t = 0.3 * sceneTime + 1.2 * audioAdvance;
    vec2 g0 = floor(p / S + 0.5);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int k = 0; k < 9; ++k) {
        vec2 cid = g0 + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        vec2 r = cid * S;
        vec2 u = displace(r, t, amp);
        // how squeezed the lattice is here: the displacement's divergence, numerically
        float div = (displace(r + vec2(S, 0.0), t, amp).x - u.x + displace(r + vec2(0.0, S), t, amp).y - u.y) / S;
        float d = length(p - r - u);
        float size = S * 0.14;
        float g = smoothstep(size, size * 0.6, d) + 0.15 * exp(-d / (size * 2.0));
        float sq = smoothstep(0.4, -0.4, div);                      // squeezed: bright; stretched: dim
        col += famLight(fh, 0.4 - 0.3 * div, 0.4 * sq) * g * (0.25 + 1.5 * sq);
    }
    finish(famExpose(col, 2.38, 1.00, 0.05, fh));
}

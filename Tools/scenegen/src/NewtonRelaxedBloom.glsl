//@doc
 * @brief NEWTON RELAXED BLOOM: Newton's method for a polynomial whose roots wander, but relaxed -- each step goes
 * only part of the way (or too far): instead of the knife-sharp basins of the plain method, the basins swell into
 * soft, petal-like blooms with lace at their seams, and where the relaxation overshoots, new rings of petals open.
 * Each root's basin is its own cut of the photo, shaded by how fast it converged.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> the roots' positions: the strongest pitch classes pull roots toward their angles (smoothed)
 *   audioSwell      -> the relaxation (loud: overshoot, more petals)
 *   audioPhase      -> the roots turn as a whole (integrated)
 *   audioKick       -> the seams flash (light)
 *
 * Knobs: rootsP (how many roots: 3 to 6), relaxP (the base relaxation), photoP (photo share), hueP.
//@params rootsP relaxP photoP
//@audio audioSwell audioKick audioChroma[12]
//@body
/**  Complex multiplication.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   a b.
 **/
vec2 cmulN(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
/**  Complex division.
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   a / b.
 **/
vec2 cdivN(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-8); }

void main()
{
    vec2 p = screenP();
    int n = 3 + int(3.99 * clamp(rootsP, 0.0, 1.0));
    vec2 root[6];
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        // the root's angle, nudged by the pitch class it sits on
        float pc = mod(fk * 12.0 / float(n), 12.0);
        float pull = clamp(audioChroma[int(pc)], 0.0, 1.0);
        float a = 6.2831853 * fk / float(n) + 0.04 * audioPhase + 0.3 * sin(0.03 * sceneTime + fk);
        root[k] = (0.55 + 0.25 * pull + 0.1 * sin(0.05 * sceneTime + 2.0 * fk)) * vec2(cos(a), sin(a));
    }
    float relax = 0.75 + 0.6 * clamp(relaxP, 0.0, 1.0) + 0.35 * clamp(audioSwell, 0.0, 1.0);
    vec2 z = p * 1.5;
    float it = 0.0;
    for (int i = 0; i < 40; ++i) {
        // p'(z) / p(z) = sum 1 / (z - r_k): the Newton step is z -= relax / sum
        vec2 s = vec2(0.0);
        for (int k = 0; k < 6; ++k) {
            if (k >= n) break;
            s += cdivN(vec2(1.0, 0.0), z - root[k]);
        }
        vec2 stepZ = cdivN(vec2(relax, 0.0), s);
        z -= stepZ;
        it += exp(-dot(stepZ, stepZ) * 400.0);
        if (dot(stepZ, stepZ) < 1e-8) break;
    }
    int best = 0;
    float bd = 1e9;
    for (int k = 0; k < 6; ++k) {
        if (k >= n) break;
        float d = length(z - root[k]);
        if (d < bd) { bd = d; best = k; }
    }
    float fb = float(best);
    float speed = clamp(it / 40.0, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.29, 0.53) * fb;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(fb / float(n) + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo, 0.35 + 0.55 * clamp(photoP, 0.0, 1.0)) * (0.35 + 0.9 * speed);
    float seam = abs(dFdx(fb)) + abs(dFdy(fb));
    col += mix(tone, vec3(1.0), 0.5) * min(seam, 1.0) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

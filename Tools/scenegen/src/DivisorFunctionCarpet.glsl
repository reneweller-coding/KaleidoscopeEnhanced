//@doc
 * @brief DIVISOR FUNCTION CARPET: the number n = x + W y is turned into brightness by its number of divisors: the primes are dark lines, the smooth numbers bright spots, and as the width W changes new patterns appear -- ripples of
 * diagonals where W has many divisors, fine lattices where it has few.  The brightness is tinted by the photo at each cell.  The width W wanders with the drive of the music (the pattern for W and for W + 1 crossing over).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the width W wanders (integrated; crossing over from one whole width to the next)
 *   audioSwell      -> the contrast
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell
//@body
/**  The number of divisors of an integer.
 *
 * @param n  The integer, 1..6400. (in)
 *
 * @return
 *   The number of divisors.
 **/
int divisorCount(int n)
{
    int c = 0;
    for (int i = 1; i < 81; ++i) {
        if (i * i > n) break;
        if (n % i == 0) c += (i * i == n) ? 1 : 2;
    }
    return c;
}
/**  The picture for one whole width.
 *
 * @param cell  The cell. (in)
 * @param W     The width. (in)
 *
 * @return
 *   The brightness.
 **/
float divBright(ivec2 cell, int W)
{
    int n = 1 + (cell.x + W * cell.y) % 6399;
    return clamp(log2(float(divisorCount(n))) / 4.5, 0.0, 1.0);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float cs = 0.02 + 0.016 * clamp(sizeP, 0.0, 1.0);
    vec2 g = vec2((p.x + 0.5 * asp) / cs, (0.5 - p.y) / cs);
    ivec2 cell = ivec2(floor(g));
    float Wf = 30.0 + 22.0 * (0.5 + 0.5 * sin(0.02 * audioAdvance + 0.005 * sceneTime));
    int W0 = int(floor(Wf));
    float b = mix(divBright(cell, W0), divBright(cell, W0 + 1), smoothstep(0.0, 1.0, fract(Wf)));
    vec3 c = imgLod(p * 0.8 + 0.5, 1.5);
    float k = 1.0 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    vec2 f = fract(g) - 0.5;
    float box = smoothstep(0.55, 0.42, max(abs(f.x), abs(f.y)));
    finish(c * (0.08 + 1.4 * pow(b, k)) * mix(0.85, 1.0, box));
}

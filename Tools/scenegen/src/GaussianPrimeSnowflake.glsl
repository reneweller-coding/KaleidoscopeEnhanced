//@doc
 * @brief GAUSSIAN PRIME SNOWFLAKE: the Gaussian primes in the complex plane form eight-fold flakes: every lattice point that is a Gaussian prime is a field showing a piece of the photo, the space between stays dark grey; the
 * primes run out from the middle in a snowflake of fine structure that is the same turned and mirrored eight ways.  The radius of the flake follows the drive of the music (it breathes out and in), the size of the fields the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the radius of the flake breathes (integrated)
 *   audioSpread     -> the size of the fields (how many are seen)
 *
 * Knobs: sizeP (the size of the fields), hueP.
//@params sizeP
//@audio audioSpread
//@body
/**  Whether an integer is a rational prime.
 *
 * @param n  The integer, 0..2000. (in)
 *
 * @return
 *   True for a prime.
 **/
bool isPrimeInt(int n)
{
    if (n < 2) return false;
    for (int i = 2; i < 46; ++i) {
        if (i * i > n) break;
        if (n % i == 0) return false;
    }
    return true;
}
/**  Whether a Gaussian integer is a Gaussian prime.
 *
 * @param a  The real part. (in)
 * @param b  The imaginary part. (in)
 *
 * @return
 *   True for a Gaussian prime.
 **/
bool isGaussPrime(int a, int b)
{
    a = abs(a); b = abs(b);
    if (a == 0) return b % 4 == 3 && isPrimeInt(b);
    if (b == 0) return a % 4 == 3 && isPrimeInt(a);
    return isPrimeInt(a * a + b * b);
}
void main()
{
    vec2 p = screenP();
    float N = (14.0 + 14.0 * (1.0 - clamp(sizeP, 0.0, 1.0))) * (0.85 + 0.3 * (1.0 - clamp(audioSpread, 0.0, 1.0)));
    vec2 g = p * N;
    ivec2 ci = ivec2(floor(g + 0.5));
    vec2 f = g - vec2(ci);
    float R = 12.0 + 8.0 * sin(0.03 * audioAdvance + 0.01 * sceneTime);
    float inFlake = smoothstep(R, R - 3.0, length(vec2(ci)));
    float prime = isGaussPrime(ci.x, ci.y) ? 1.0 : 0.0;
    vec3 c = imgLod(vec2(ci) / N * 0.8 + 0.5 + f * 0.6 / N * 0.8, 0.9);
    float box = smoothstep(0.5, 0.4, max(abs(f.x), abs(f.y)));
    vec3 ground = vec3(0.1) + 0.08 * imgLod(p * 0.8 + 0.5, 4.0);
    finish(mix(ground, c * 1.25, prime * box * inFlake));
}

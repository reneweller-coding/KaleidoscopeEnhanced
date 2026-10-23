//@doc
 * @brief PASCAL RESIDUE CARPET: Pascal's triangle modulo n -- the Sierpinski triangle at n = 2, and at the other primes carpets of triangles with ever finer holes: the photo carries the residues as colour (the zero residue stays dark,
 * the others are the photo's colour at the cell, lighter the larger the residue), the pattern mirrored through the picture so that triangles stand in every orientation.  The modulus glides through 2, 3, 5 and 7 with the chords
 * of the music (crossing over, never a jump), the depth of the rows follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the modulus glides through 2, 3, 5, 7 (crossing over)
 *   audioSwell      -> the depth of the rows (finer holes fading in)
 *
 * Knobs: sizeP (the size of the carpet), hueP.
//@params sizeP
//@audio audioHarmAdvance audioSwell
//@body
/**  Pascal's triangle modulo a prime, by Lucas's theorem.
 *
 * @param r  The row. (in)
 * @param k  The place in the row. (in)
 * @param p  The prime, 2, 3, 5 or 7. (in)
 *
 * @return
 *   The residue, 0..p-1.
 **/
int pascalMod(int r, int k, int p)
{
    int res = 1;
    for (int i = 0; i < 8; ++i) {
        if (r == 0 && k == 0) break;
        int rd = r % p, kd = k % p;
        if (kd > rd) return 0;
        int b = 1;
        for (int j = 1; j <= 6; ++j) {
            if (j > kd) break;
            b = b * (rd - j + 1) / j;
        }
        res = (res * (b % p)) % p;
        r /= p; k /= p;
    }
    return res;
}
/**  The carpet for one modulus.
 *
 * @param p    The pixel. (in)
 * @param pr   The modulus. (in)
 * @param nr   The rows (a power of the modulus is neat). (in)
 *
 * @return
 *   The colour.
 **/
vec3 pascalCarpet(vec2 p, int pr, float nr)
{
    float X = 1.0 - abs(fract(p.x * 0.5 + 0.5) * 2.0 - 1.0);
    float Y = 1.0 - abs(fract(-p.y * 0.5 + 0.25) * 2.0 - 1.0);
    ivec2 cell = ivec2(min(vec2(X, Y) * nr, vec2(nr - 1.0)));
    int res = pascalMod(cell.y, cell.x, pr);
    vec3 c = imgLod((vec2(cell) + 0.5) / nr * 0.8 + 0.5, 1.2);
    float v = res == 0 ? 0.0 : 0.45 + 0.65 * float(res) / float(pr - 1);
    return c * (0.08 + v * 1.15);
}
void main()
{
    vec2 p = screenP();
    float kp = 3.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance - 1.0)) * 0.999;
    int k0 = int(floor(kp));
    int pa = k0 == 0 ? 2 : (k0 == 1 ? 3 : 5);
    int pb = k0 == 0 ? 3 : (k0 == 1 ? 5 : 7);
    float na = pa == 2 ? 64.0 : (pa == 3 ? 81.0 : 125.0);
    float nb = pb == 3 ? 81.0 : (pb == 5 ? 125.0 : 49.0);
    float sz = 0.3 + 0.5 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / sz;
    float d = clamp(0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0), 0.5, 1.0);
    vec3 col = mix(pascalCarpet(q, pa, na * d), pascalCarpet(q, pb, nb * d), smoothstep(0.0, 1.0, fract(kp)));
    finish(col);
}

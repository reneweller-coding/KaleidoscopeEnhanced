//@doc
 * @brief BITWISE XOR CASCADE: binary patterns -- x XOR y, x AND y, x OR y -- as a carpet of cells over which the photo lies as a palette: the value of every cell picks a colour out of the photo; the carpet scrolls, and at every bar it
 * grows by one more binary place, so the patterns of fine triangles that fill in are born in the order of the bits.  The scroll is the drive of the music, the number of places follows the phrase (one more each bar, crossing over smoothly).
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the number of binary places (one more each bar, crossing over)
 *   audioAdvance    -> the scroll (integrated; the pattern for the shift and for the next shift crossing over)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioAdvance
//@body
/**  The palette value of a cell: the photo at a place chosen by the bits.
 *
 * @param x     The cell column. (in)
 * @param y     The cell row. (in)
 * @param bits  The number of binary places. (in)
 * @param op    The operation, 0 xor, 1 and, 2 or. (in)
 *
 * @return
 *   The colour.
 **/
vec3 xorCell(int x, int y, int bits, int op)
{
    int m = (1 << bits) - 1;
    int v = op == 0 ? ((x ^ y) & m) : (op == 1 ? ((x & y) & m) : ((x | y) & m));
    float t = float(v) / float(m);
    return imgLod(vec2(0.08 + 0.84 * t, 0.3 + 0.4 * fract(float(v) * 0.618)), 2.0);
}
/**  The picture for one shift and a number of places.
 *
 * @param cell  The cell. (in)
 * @param sh    The whole shift. (in)
 * @param bits  The number of places. (in)
 * @param op    The operation. (in)
 *
 * @return
 *   The colour.
 **/
vec3 xorPic(ivec2 cell, int sh, int bits, int op) { return xorCell(abs(cell.x + sh), abs(cell.y), bits, op); }
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float cs = 0.016 + 0.016 * clamp(sizeP, 0.0, 1.0);
    vec2 g = vec2((p.x + 0.5 * asp) / cs, (0.5 - p.y) / cs);
    ivec2 cell = ivec2(floor(g));
    float sh = 0.4 * audioAdvance + 0.5 * sceneTime;
    int s0 = int(floor(sh));
    float bf = 3.0 + 5.0 * rhyPhrase();
    int b0 = int(floor(bf));
    int op = int(mod(floor(0.02 * sceneTime), 3.0));
    float fb = smoothstep(0.0, 1.0, fract(bf));
    float fs = smoothstep(0.0, 1.0, fract(sh));
    vec3 a0 = mix(xorPic(cell, s0, b0, op), xorPic(cell, s0 + 1, b0, op), fs);
    vec3 a1 = mix(xorPic(cell, s0, b0 + 1, op), xorPic(cell, s0 + 1, b0 + 1, op), fs);
    vec2 f = fract(g) - 0.5;
    float box = smoothstep(0.55, 0.45, max(abs(f.x), abs(f.y)));
    finish(mix(a0, a1, fb) * mix(0.8, 1.1, box) * 1.05);
}

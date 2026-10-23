//@doc
 * @brief ORIENTATION WEAVE THREADS: the direction field of the photo as a fabric: at every point of a lattice two threads cross, one along the photo's edge there and one across it, going over and under in turn, the threads
 * shaded round and carrying the photo's colour at the crossing; the fabric follows the lines of the photo, so the picture is the photo woven.  A twist runs along the threads with the drive of the music, and the width of the
 * threads follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the width of the threads
 *   audioAdvance    -> the twist runs along the threads (integrated)
 *
 * Knobs: sizeP (the size of the crossings), hueP.
//@params sizeP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.1 - 0.05 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / s);
    vec2 f = fract(p / s) - 0.5;
    vec2 cp = (cell + 0.5) * s;
    vec2 cuv = cp * 0.8 + 0.5;
    float e = 0.012;
    vec2 gr = vec2(luma(imgLod(cuv + vec2(e, 0.0), 3.0)) - luma(imgLod(cuv - vec2(e, 0.0), 3.0)),
                   luma(imgLod(cuv + vec2(0.0, e), 3.0)) - luma(imgLod(cuv - vec2(0.0, e), 3.0)));
    float th = atan(gr.y, gr.x) + 1.5707963;
    vec2 u = rot2(-th) * f;
    float w = 0.12 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    float tA = smoothstep(w, w - 0.05, abs(u.y));
    float tB = smoothstep(w, w - 0.05, abs(u.x));
    float inCell = smoothstep(0.62, 0.5, length(f));
    float par = mod(cell.x + cell.y, 2.0);
    float shA = 0.65 + 0.5 * cos(abs(u.y) / w * 1.5707963) + 0.12 * sin(14.0 * u.x - 0.3 * audioAdvance);
    float shB = 0.65 + 0.5 * cos(abs(u.x) / w * 1.5707963) + 0.12 * sin(14.0 * u.y + 0.3 * audioAdvance);
    vec3 c = imgLod(cuv, 1.5);
    vec3 cA = c * shA, cB = c * shB * 0.92;
    vec3 col = vec3(0.03) + 0.1 * imgLod(p * 0.8 + 0.5, 4.0);
    float topA = par < 0.5 ? 1.0 : 0.0;
    col = mix(col, topA > 0.5 ? cB : cA, (topA > 0.5 ? tB : tA) * inCell);
    col = mix(col, topA > 0.5 ? cA : cB, (topA > 0.5 ? tA : tB) * inCell * (1.0 - 0.0));
    finish(col * 1.15);
}

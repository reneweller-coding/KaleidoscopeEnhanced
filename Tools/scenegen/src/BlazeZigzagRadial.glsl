//@doc
 * @brief BLAZE ZIGZAG RADIAL: Riley's "Blaze": stripes run out from the middle, but their edges are zigzags, and the zigzag of every stripe turns against its neighbour's, so that the whole disc seems to whirl and swell.  The stripes
 * are filled with the photo's colour, light and dark by turns.  The number of stripes follows the key (crossing over), the twist of the zigzags follows the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of stripes (crossing over)
 *   audioAdvance    -> the twist of the zigzag (integrated)
 *
 * Knobs: zigP (how large the zigzag is), hueP.
//@params zigP
//@audio audioHarmAdvance
//@body
/**  The picture with a given number of stripes.
 *
 * @param p  The pixel. (in)
 * @param n  The stripes. (in)
 *
 * @return
 *   The colour.
 **/
vec3 blazeStripes(vec2 p, float n)
{
    float r = length(p) + 0.001, a = atan(p.y, p.x);
    float tw = 0.05 * audioAdvance + 0.02 * sceneTime;
    float zr = r * 9.0 - tw;
    float tri = abs(fract(zr) - 0.5) * 2.0;
    float amp = 0.15 + 0.4 * clamp(zigP, 0.0, 1.0);
    float s = (a / 6.2831853 + 0.5) * n + amp * (tri - 0.5) * 2.0;
    float st = mod(floor(s), 2.0);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.0);
    return c * mix(0.12, 1.25, st);
}
void main()
{
    vec2 p = screenP();
    float n = 2.0 * (8.0 + 6.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float n0 = 2.0 * floor(0.5 * n);
    finish(mix(blazeStripes(p, n0), blazeStripes(p, n0 + 2.0), smoothstep(0.0, 1.0, fract(0.5 * n))));
}

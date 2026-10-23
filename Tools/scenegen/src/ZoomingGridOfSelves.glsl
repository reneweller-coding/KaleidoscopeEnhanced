//@doc
 * @brief ZOOMING GRID OF SELVES: a grid of copies of the photo that themselves contain a grid; the picture zooms endlessly into the middle of a cell and shows the same grid again and again, with a turn at each stage.  Neighbouring scales (each three times finer, turned by a step) are cross-faded as the zoom runs, so
 * the picture never ends.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the turn per stage follows the key (integrated)
 *   audioAdvance     -> the zoom runs (integrated)
 *
 * Knobs: sizeP (the number of cells per stage), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
/**  One stage of the zooming grid: copies of the photo on a grid that is G^n times finer, turned by n steps.
 *
 * @param p  The point. (in)
 * @param n  The stage number. (in)
 * @param G  The cells per stage. (in)
 * @param stepAng  The turn per stage. (in)
 *
 * @return
 *   The colour.
 **/
vec3 stage(vec2 p, float n, float G, float stepAng)
{
    vec2 q = rot2(n * stepAng) * p * pow(G, n);
    vec2 cell = floor(q * 0.5 + 0.5);
    vec2 f = fract(q * 0.5 + 0.5) - 0.5;
    vec3 c = imgLod(f * 0.88 + 0.5, 0.6 + 0.3 * log2(max(pow(G, n), 1.0)) * 0.0);
    float edge = smoothstep(0.0, 0.03, 0.5 - max(abs(f.x), abs(f.y)));
    return c * (0.6 + 0.4 * edge);
}
void main()
{
    vec2 p = screenP();
    float G = 3.0 + 1.5 * clamp(sizeP, 0.0, 1.0);
    float stepAng = 0.2 + 0.15 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float zt = 0.03 * audioAdvance + 0.04 * sceneTime;
    float lz = fract(zt);
    float zz = pow(G, lz);
    float w = smoothstep(0.0, 1.0, lz);
    vec2 pp = p * 1.0;
    vec3 a = stage(pp * zz, 0.0, G, stepAng);
    vec3 b = stage(rot2(stepAng) * pp * (zz / G), 0.0, G, stepAng);
    finish(mix(a, b, w) * 1.15);
}

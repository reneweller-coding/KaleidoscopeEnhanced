//@doc
 * @brief LEAF DAPPLE DRIFT: dappled light under the crown of a tree: spots of sun that wander in the wind and look like pebbles on the photo: three layers of leaves at different heights, each drifting its own way, let the light through
 * only where their gaps overlap, so the sun falls in soft round flecks of different size on the picture, the photo bright and warm in them and cool and dark in the shade.  The thickness of the foliage follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the thickness of the foliage (more spread, more and smaller flecks)
 *   audioAdvance    -> the wind (integrated)
 *
 * Knobs: leafP (the size of the leaves), hueP.
//@params leafP
//@audio audioSpread
//@body
/**  The photo lit by a warm light and shaded by a soft shadow.
 *
 * @param c    The photo's colour. (in)
 * @param sh   The shadow, 0 lit .. 1 in shade. (in)
 * @param den  How dark the shade is, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 lightAndShade(vec3 c, float sh, float den)
{
    vec3 lit = c * vec3(1.12, 1.03, 0.88) * 1.1;
    vec3 shade = c * vec3(0.55, 0.66, 0.82) * (1.0 - 0.6 * den);
    return mix(lit, shade, clamp(sh, 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.05 * audioAdvance;
    float sc = 2.0 + 3.5 * (1.0 - clamp(leafP, 0.0, 1.0));
    float thick = 0.48 + 0.12 * clamp(audioSpread, 0.0, 1.0);
    float light = 1.0;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        vec2 wind = vec2(cos(1.7 * fi + 0.5), sin(2.3 * fi)) * t * (1.0 + 0.6 * fi);
        float cov = smoothstep(thick - 0.07, thick + 0.07, fbm(p * sc * (1.0 + 0.55 * fi) + wind + 7.0 * fi));
        light *= 1.0 - cov;
    }
    float sh = 1.0 - smoothstep(0.02, 0.35, light);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.85));
}

//@doc
 * @brief DAMASCENE FOLDED STEEL: Damascus steel: layers of hard and soft steel are folded, forged and etched, and the folds show as clouds and waves; the photo lies as the colour of the tempering (blue, gold, violet) on the layers.  A coordinate field is folded again and again, the layer bands are
 * its level lines, and the etching shows the height as light and shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the number of folds (the fineness of the layers)
 *   audioAdvance -> the wave of the layers runs on (integrated)
 *
 * Knobs: sizeP (the scale of the waves), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The layer pattern of folded steel: a sine of a folded, noise-bent coordinate.
 *
 * @param p  The point. (in)
 * @param n  The fineness of the layers. (in)
 * @param t  The time. (in)
 * @param sc  The scale. (in)
 *
 * @return
 *   The layer value 0..1.
 **/
float damask(vec2 p, float n, float t, float sc)
{
    vec2 q = p * sc;
    q.x += 0.6 * fbm(q * 0.9 + vec2(0.0, 0.03 * t));
    q.y += 0.6 * fbm(q * 0.9 + vec2(5.0, -0.02 * t));
    float v = q.x * 6.0 + 2.0 * sin(q.y * 3.0 + 0.1 * t) + 1.5 * fbm(q * 2.0);
    return 0.5 + 0.5 * sin(v * n);
}
void main()
{
    vec2 p = screenP();
    float t = 0.5 * audioAdvance + 0.6 * sceneTime;
    float sc = 0.8 + 1.4 * clamp(sizeP, 0.0, 1.0);
    float n = 1.0 + 1.6 * clamp(audioSwell, 0.0, 1.0);
    float b = damask(p, n, t, sc);
    float e = 0.004;
    float bx = damask(p + vec2(e, 0.0), n, t, sc) - b;
    float by = damask(p + vec2(0.0, e), n, t, sc) - b;
    float relief = (bx * 0.6 + by * 0.8) / e * 0.012;
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    vec3 temper = mix(vec3(0.08, 0.1, 0.22), c * 1.25, 0.35 + 0.55 * b);
    temper = mix(temper, vec3(0.9, 0.75, 0.35) * luma(c), 0.2 * (1.0 - b));
    vec3 steel = vec3(0.55, 0.57, 0.62) * (0.35 + 0.65 * b);
    vec3 col = mix(steel, temper, 0.78) + relief;
    finish(col * 1.1);
}

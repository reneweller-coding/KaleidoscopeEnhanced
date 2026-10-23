//@doc
 * @brief TRIPLANAR BLEND BANDS FLOW: triplanar projection: three projections of the photo from three axes are mixed by the normal; the picture shows a relief of bands in which the projections meet at edges.  A drifting height field gives the normal; the photo is read along the three axes at the surface point and the
 * three readings are mixed by the cubes of the normal's components.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the sharpness of the mix and the height of the relief
 *   audioAdvance -> the field drifts (integrated)
 *
 * Knobs: sizeP (the scale of the relief), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The height field of the triplanar relief (two octaves of noise).
 *
 * @param p  The point. (in)
 * @param sc  The scale. (in)
 * @param t  The time. (in)
 *
 * @return
 *   The height.
 **/
float hf(vec2 p, float sc, float t)
{
    return 0.5 * fbm(p * sc + vec2(0.0, 0.02 * t)) + 0.25 * fbm(p * sc * 2.1 + vec2(3.0, -0.03 * t));
}
void main()
{
    vec2 p = screenP();
    float sc = 1.2 + 2.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = 0.5 * audioAdvance + 0.6 * sceneTime;
    float H = 1.0 + 3.0 * clamp(audioSwell, 0.0, 1.0);
    float h = hf(p, sc, t) * H;
    float e = 0.004;
    float hx = (hf(p + vec2(e, 0.0), sc, t) * H - h) / e;
    float hy = (hf(p + vec2(0.0, e), sc, t) * H - h) / e;
    vec3 n = normalize(vec3(-hx, -hy, 1.0));
    float sharp = 2.0 + 4.0 * clamp(audioSwell, 0.0, 1.0);
    vec3 w = pow(abs(n), vec3(sharp));
    w /= w.x + w.y + w.z;
    vec3 cx = imgLod(vec2(p.y, h * 0.6) * 0.85 + 0.5, 0.8);
    vec3 cy = imgLod(vec2(p.x, h * 0.6) * 0.85 + 0.5, 0.8);
    vec3 cz = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col = cx * w.x + cy * w.y + cz * w.z;
    float lit = 0.55 + 0.7 * max(dot(n, normalize(vec3(-0.5, 0.6, 0.65))), 0.0);
    finish(col * lit * 1.15);
}

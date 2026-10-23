//@doc
 * @brief YARDANG WIND RIDGES: yardangs: wind-ground ridges in the desert, long and streamlined; the photo sets hardness and colour of the layers, and the wind forms the ridges, which wander slowly.  The height field is stretched noise along the wind direction, the hard layers (bright places of the photo) stand
 * up higher, and the surface is lit from the side.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the wind direction turns slowly and the ridges wander (integrated)
 *   audioSpread  -> the width of the ridges (smoothed)
 *
 * Knobs: sizeP (the scale of the ridges), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
/**  The height of the yardang field: noise stretched along the wind.
 *
 * @param p  The point. (in)
 * @param ang  The angle. (in)
 * @param wd  The width of the ridges. (in)
 * @param t  The time. (in)
 *
 * @return
 *   The height.
 **/
float yh(vec2 p, float ang, float wd, float t)
{
    vec2 q = rot2(-ang) * p;
    float sc = 2.0 + 3.0 * (1.0 - wd);
    float h = fbm(vec2(q.x * sc * 0.25 + 0.0 * t, q.y * sc * 1.6 + 0.01 * t));
    h += 0.4 * fbm(vec2(q.x * sc * 0.6, q.y * sc * 3.2 + 4.0 + 0.012 * t));
    return h;
}
void main()
{
    vec2 p = screenP();
    float ang = 0.4 + 0.01 * audioAdvance + 0.01 * sceneTime;
    float wd = clamp(sizeP, 0.0, 1.0) * 0.7 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    float t = sceneTime;
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    float hard = luma(c);
    float h = yh(p, ang, wd, t) + 0.5 * hard;
    float e = 0.004;
    float hx = yh(p + vec2(e, 0.0), ang, wd, t) + 0.5 * luma(imgLod((p + vec2(e, 0.0)) * 0.85 + 0.5, 1.0)) - h;
    float hy = yh(p + vec2(0.0, e), ang, wd, t) + 0.5 * luma(imgLod((p + vec2(0.0, e)) * 0.85 + 0.5, 1.0)) - h;
    vec3 n = normalize(vec3(-hx / e * 0.05, -hy / e * 0.05, 1.0));
    float dif = 0.45 + 0.8 * max(dot(n, normalize(vec3(-0.6, 0.5, 0.65))), 0.0);
    vec3 sand = mix(vec3(0.7, 0.5, 0.32), c * 1.1, 0.5);
    finish(sand * dif * (0.7 + 0.5 * h) * 1.2);
}

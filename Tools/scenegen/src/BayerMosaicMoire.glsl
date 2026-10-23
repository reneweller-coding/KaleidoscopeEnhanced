//@doc
 * @brief BAYER MOSAIC MOIRE: the photo through the colour-filter grid of a sensor and a deliberately naive demosaic: where the picture has detail near the grid's frequency the well-known false colours and zipper patterns appear, here as a maze that
 * shifts as the photo slides through the grid frequency.  Each sensor pixel keeps one colour channel; the other two are averaged from the neighbours that have them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the photo's slow zoom through the grid frequency
 *   audioSwell   -> the strength of the false colours
 *
 * Knobs: sizeP (the sensor pixel size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The value a sensor pixel keeps: one colour channel of the photo, chosen by its place in the Bayer grid.
 *
 * @param ij  The sensor cell. (in)
 * @param uvc  The photo coordinate of the cell's centre. (in)
 *
 * @return
 *   The kept channel.
 **/
float bayerVal(ivec2 ij, vec2 uvc)
{
    vec3 c = imgLod(uvc, 0.0);
    bool ex = (ij.x & 1) == 0;
    bool ey = (ij.y & 1) == 0;
    return (ex && ey) ? c.r : ((!ex && !ey) ? c.b : c.g);
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float s = (2.2 + 2.2 * clamp(sizeP, 0.0, 1.0)) * resolution.y / 270.0;
    float z = 0.8 + 0.35 * sin(0.04 * sceneTime + 0.02 * audioAdvance);
    vec2 p = screenP();
    ivec2 ij0 = ivec2(floor(fc / s));
    vec3 acc = vec3(0.0);
    vec3 cnt = vec3(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            ivec2 ij = ij0 + ivec2(dx, dy);
            vec2 pc = ((vec2(ij) + 0.5) * s - 0.5 * resolution) / resolution.y;
            float v = bayerVal(ij, pc * z + 0.5);
            bool ex = (ij.x & 1) == 0;
            bool ey = (ij.y & 1) == 0;
            if (ex && ey) { acc.r += v; cnt.r += 1.0; }
            else if (!ex && !ey) { acc.b += v; cnt.b += 1.0; }
            else { acc.g += v; cnt.g += 1.0; }
        }
    vec3 col = acc / max(cnt, vec3(1.0));
    vec3 ref = imgLod((fc - 0.5 * resolution) / resolution.y * z + 0.5, 0.8);
    col = mix(ref, col, 0.45 + 0.55 * clamp(audioSwell, 0.0, 1.0));
    finish(col * 1.15);
}

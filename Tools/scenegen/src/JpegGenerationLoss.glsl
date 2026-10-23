//@doc
 * @brief JPEG GENERATION LOSS: generation loss: the photo is saved again and again, each round with a small shift of the block grid; the block edges, rings and colour patches pile up and turn the picture into a repetition of its own mistakes.  Four grids of
 * different offsets each keep the brightness in coarse steps and the colour in blocks of double size, and the number of rounds in force glides.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the number of generations in force (one to four)
 *   audioAdvance -> the grids shift (integrated)
 *
 * Knobs: sizeP (the block size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  One generation of the block coding: brightness in coarse steps per block, colour in blocks of double size.
 *
 * @param fc  The pixel coordinate. (in)
 * @param o  The offset of the block grid. (in)
 * @param Bb  The block size per 270 lines. (in)
 * @param px  The pixel scale (render height / 270). (in)
 * @param lv  The number of brightness steps. (in)
 *
 * @return
 *   The decoded colour.
 **/
vec3 jpegPass(vec2 fc, vec2 o, float Bb, float px, float lv)
{
    float B = Bb * px;
    vec2 cell = floor((fc + o) / B);
    vec2 cp = (cell + 0.5) * B - o;
    vec3 c = imgLod((cp - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(Bb) - 0.4);
    float y = luma(c);
    float yq = floor(y * lv + 0.5) / lv;
    vec2 o2 = o * 1.7;
    vec2 cell2 = floor((fc + o2) / (2.0 * B));
    vec2 cp2 = (cell2 + 0.5) * 2.0 * B - o2;
    vec3 c2 = imgLod((cp2 - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(2.0 * Bb) - 0.4);
    return vec3(yq) + (c2 - vec3(luma(c2))) * 1.3;
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float Bb = 8.0 + 10.0 * clamp(sizeP, 0.0, 1.0);
    float G = 1.0 + 3.0 * (0.5 + 0.5 * sin(0.06 * sceneTime + 1.5 * clamp(audioSwell, 0.0, 1.0)));
    float t = 0.01 * audioAdvance + 0.012 * sceneTime;
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int g = 0; g < 4; ++g) {
        float fg = float(g);
        vec2 o = Bb * px * vec2(0.37 * fg + 0.5 * sin(t + fg), 0.21 * fg + 0.5 * cos(1.3 * t + 2.0 * fg));
        float w = clamp(G - fg, 0.0, 1.0);
        sum += w * jpegPass(fc, o, Bb, px, 6.0 + 2.0 * fg);
        ws += w;
    }
    vec3 col = sum / max(ws, 1e-3);
    finish(col * 1.15);
}

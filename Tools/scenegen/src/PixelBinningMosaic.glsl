//@doc
 * @brief PIXEL BINNING MOSAIC: pixel binning: the sensor gathers 2x2, 4x4, 8x8 pixels into one, and the photo passes steadily through the mosaic sizes; in every size the blocks show their own mean, and the two grids of neighbouring sizes
 * blend into each other, so the picture goes from fine to coarse and back without a jump.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the block size wanders through the powers of two (integrated)
 *   audioSwell   -> the contrast of the blocks
 *
 * Knobs: sizeP (the smallest block), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The mean colour of the block of the given size that contains the pixel.
 *
 * @param fc  The pixel coordinate. (in)
 * @param Bb  The block size per 270 lines. (in)
 *
 * @return
 *   The colour.
 **/
vec3 binned(vec2 fc, float Bb)
{
    float B = Bb * resolution.y / 270.0;
    vec2 cell = floor(fc / B);
    vec2 c = (cell + 0.5) * B;
    vec2 pc = (c - 0.5 * resolution) / resolution.y;
    return imgLod(pc * 0.8 + 0.5, log2(Bb) - 0.6);
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float e = 1.0 + 3.0 * (0.5 + 0.5 * sin(0.06 * sceneTime + 0.05 * audioAdvance));
    e += 0.6 * clamp(sizeP, 0.0, 1.0);
    float e0 = floor(e);
    float fr = e - e0;
    vec3 a = binned(fc, exp2(e0));
    vec3 b = binned(fc, exp2(e0 + 1.0));
    vec3 col = mix(a, b, smoothstep(0.0, 1.0, fr));
    col = mix(vec3(luma(col)), col, 1.0 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    finish(col * 1.1);
}

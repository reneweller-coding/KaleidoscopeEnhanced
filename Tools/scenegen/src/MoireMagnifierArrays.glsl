//@doc
 * @brief MOIRE MAGNIFIER ARRAYS: two lens rasters, one carrying micro-images of the photo and one micro-lenses: the photo appears hugely enlarged and tilts as the rasters turn against one
 * another; the enlargement is the inverse of the rasters' mismatch, and the lenslets' grid shows as a fine texture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the turn of one raster against the other (integrated)
 *   audioSwell      -> the enlargement
 *
 * Knobs: pitchP (the rasters' pitch), hueP.
//@params pitchP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.04 * sceneTime + 0.25 * audioPhase;
    float P1 = 1.0, P2 = 1.0 / (1.0 + 0.04 + 0.05 * clamp(audioSwell, 0.0, 1.0));
    float th = 0.04 + 0.04 * sin(t);
    mat2 A = mat2(1.0 / P1, 0.0, 0.0, 1.0 / P1) - rot2(th) / P2;
    vec2 uv = A * p * 4.0 + 0.5;
    float N = 40.0 + 40.0 * clamp(pitchP, 0.0, 1.0);
    vec2 f = fract(p * N) - 0.5;
    float lens = smoothstep(0.5, 0.38, length(f));
    vec3 col = imgLod(uv, 0.8) * (0.7 + 0.35 * lens);
    col *= 1.0 - 0.12 * (1.0 - lens);
    finish(col * 1.05);
}

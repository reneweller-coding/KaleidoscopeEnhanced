//@doc
 * @brief TAKAGI BLANCMANGE WARP: the photo is displaced along the Takagi curve (the blancmange, continuous and differentiable nowhere): the edges run like coasts without a scale, new and jagged however far one looks in; the
 * photo is shifted in x by the curve of y and in y by the curve of x, so the picture is a coast of ever finer bays.  The depth of the roughness follows the spectral spread (finer bays fading in), the amplitude the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the amplitude of the displacement
 *   audioSpread     -> the depth of the roughness (finer bays fading in)
 *   audioAdvance    -> the curve drifts (integrated)
 *
 * Knobs: scaleP (the size of the curve), hueP.
//@params scaleP
//@audio audioSwell audioSpread
//@body
/**  The Takagi function (blancmange) of a coordinate, a number of levels deep, the last one faded in.
 *
 * @param x  The coordinate. (in)
 * @param D  The depth, real. (in)
 *
 * @return
 *   The curve's value (about 0..0.67).
 **/
float takagi(float x, float D)
{
    float s = 0.0, w = 1.0;
    for (int i = 0; i < 9; ++i) {
        float act = clamp(D - float(i), 0.0, 1.0);
        float v = abs(fract(x * w + 0.5) - 0.5);
        s += act * v / w;
        w *= 2.0;
    }
    return s;
}
void main()
{
    vec2 p = screenP();
    float sc = 1.0 + 3.0 * clamp(scaleP, 0.0, 1.0);
    float D = 3.0 + 5.0 * clamp(audioSpread, 0.0, 1.0);
    float t = 0.02 * audioAdvance + 0.005 * sceneTime;
    float A = (0.12 + 0.25 * clamp(audioSwell, 0.0, 1.0));
    float dx = takagi(p.y * sc + t, D) - 0.33;
    float dy = takagi(p.x * sc * 0.8 - t, D) - 0.33;
    vec2 uv = (p + A * vec2(dx, dy)) * 0.8 + 0.5;
    finish(imgLod(uv, 0.7) * 1.08);
}

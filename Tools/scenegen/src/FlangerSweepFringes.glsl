//@doc
 * @brief FLANGER SWEEP FRINGES: a flanger: the photo is mixed with a copy delayed by fractions of a pixel that swings slowly to and fro, so that stripes appear in the edges that open and close; the three colours have slightly different delays, and so the stripes are in colour.
 * The delay sweeps from nothing to a few pixels in a smooth wave, and the sign of the copy changes slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the sweep's phase (integrated)
 *   audioSwell   -> the sweep's width
 *
 * Knobs: sizeP (the greatest delay), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5 + 0.02 * vec2(sin(0.04 * sceneTime), cos(0.03 * sceneTime));
    float lfo = 0.5 + 0.5 * sin(0.12 * sceneTime + 0.08 * audioAdvance);
    float dmax = (0.004 + 0.012 * clamp(sizeP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float d = dmax * lfo * lfo;
    float sg = tanh(3.0 * sin(0.05 * sceneTime + 0.03 * audioAdvance));
    vec2 dir = vec2(0.8, 0.6);
    vec3 col;
    for (int k = 0; k < 3; ++k) {
        float dk = d * (1.0 + 0.35 * (float(k) - 1.0));
        float a = imgLod(uv, 0.3)[k];
        float b = imgLod(uv + dir * dk, 0.3)[k];
        float b2 = imgLod(uv - dir * dk, 0.3)[k];
        col[k] = a + sg * 0.9 * (0.5 * (b + b2) - a) * 2.2 + 0.0;
    }
    finish(clamp(col, 0.0, 1.4) * 1.1);
}

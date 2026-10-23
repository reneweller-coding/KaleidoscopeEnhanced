//@doc
 * @brief LUMA STRATA FLIGHT: a flight through the photo as a stack of sixteen translucent sheets cut by brightness (dark far,
 * bright near): the sheets rush past like cellophane, each enlarging round the centre as it nears and fading as it
 * passes, and the picture builds up only as the sum of the sheets in view.  Always the whole frame is sheets.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated)
 *   audioSpread     -> how many sheets are in view (the sheets' density)
 *   audioSwell      -> the sheets' translucence
 *
 * Knobs: depthP (how deep the stack is), speedP (the flight's speed), hueP.
//@params depthP speedP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float run = (0.4 + 0.8 * clamp(speedP, 0.0, 1.0)) * (0.05 * sceneTime + 1.5 * audioAdvance);
    float dens = 0.6 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        float d = fract(fi / 16.0 + run);                 // 0 far .. 1 near, wrapping while invisible
        float al = sin(3.14159265 * d);
        al *= al;
        float s = exp(-2.2 * (1.0 - d) * (0.5 + clamp(depthP, 0.0, 1.0)));
        vec2 uv = p * 0.8 * s + 0.5;
        vec3 c = imgLod(uv, 0.5 + 2.0 * (1.0 - d));
        float band = fi / 15.0;
        float m = max(0.0, 1.0 - abs(luma(c) - band) * 7.0);
        float w = m * al * dens;
        sum += c * w;
        wsum += w;
    }
    vec3 col = sum / max(wsum, 0.15);
    col *= 0.65 + 0.35 * smoothstep(0.0, 0.3, wsum);
    finish(col * (0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0)));
}

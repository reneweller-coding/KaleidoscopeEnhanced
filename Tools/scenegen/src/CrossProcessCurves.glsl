//@doc
 * @brief CROSS PROCESS CURVES: cross processing: every colour channel has an S-curve of its own, and the curves drift slowly, so that the shadows tip towards green, the lights towards yellow and the mid-tones towards magenta and back; the picture stays
 * sharp and drifts slowly, only its tone moves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the curves drift with the harmony (integrated)
 *   audioSpread      -> the steepness of the curves
 *
 * Knobs: sizeP (how far the curves part), hueP.
//@params sizeP
//@audio audioSpread audioHarmAdvance
//@body
float sCurve(float x, float k, float m)
{
    float y = clamp(x, 0.0, 1.0);
    float s = y + k * y * (1.0 - y) * (y - m) * 4.0;
    return clamp(s, 0.0, 1.2);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.06 * vec2(sin(0.06 * sceneTime), cos(0.045 * sceneTime));
    vec3 c = imgLod(uv, 0.3);
    float part = 0.25 + 0.55 * clamp(sizeP, 0.0, 1.0);
    float h = 0.35 * audioHarmAdvance + 0.05 * sceneTime;
    float st = 0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float kr = st * (0.9 + 0.5 * sin(h));
    float kg = st * (0.9 + 0.5 * sin(h + 2.1));
    float kb = st * (0.9 + 0.5 * sin(h + 4.2));
    vec3 o = vec3(sCurve(c.r, kr * part, 0.5 + 0.2 * sin(h * 0.7)),
                  sCurve(c.g, kg * part, 0.5 + 0.2 * sin(h * 0.7 + 2.1)),
                  sCurve(c.b, kb * part, 0.5 + 0.2 * sin(h * 0.7 + 4.2)));
    finish(o * 1.1);
}

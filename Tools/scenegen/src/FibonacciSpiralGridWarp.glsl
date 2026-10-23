//@doc
 * @brief FIBONACCI SPIRAL GRID WARP: pins on a phyllotaxis spiral whose angle and radius shift slightly with time: every pin pulls the photo along the spiral's tangent, a little more or less each, so the photo follows in spiral arms,
 * smoothly dragged; the arms wind in both the clockwise and the other way where the pins' pulls change sign.  The shift follows the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the pins' pull and the spiral's shift (integrated)
 *   audioSwell      -> the strength of the pull
 *
 * Knobs: pinP (the size of the spiral's scale), hueP.
//@params pinP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float c = 0.04 + 0.03 * clamp(pinP, 0.0, 1.0);
    float ga = 2.3999632 + 0.002 * sin(0.03 * audioPhase);
    float r = length(p);
    float k0 = r * r / (c * c);
    vec2 D = vec2(0.0);
    float ws = 0.0;
    float amp = 1.4 + 1.6 * clamp(audioSwell, 0.0, 1.0);
    for (int i = -20; i <= 20; ++i) {
        float k = floor(k0) + float(i);
        if (k < 0.0) continue;
        float rr = c * sqrt(k);
        float th = k * ga;
        vec2 sp = rr * vec2(cos(th), sin(th));
        vec2 tang = vec2(-sin(th), cos(th));
        float d2 = dot(p - sp, p - sp);
        float wk = exp(-d2 / (0.8 * c * c));
        float pull = sin(0.2 * audioPhase + 0.3 * k + 0.1 * sceneTime);
        D += wk * tang * pull * c * amp * 0.7;
        ws += wk;
    }
    D /= max(ws, 1e-3);
    finish(imgLod((p + D) * 0.8 + 0.5, 0.7) * 1.08);
}

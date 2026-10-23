//@doc
 * @brief FENCE CORRIDOR MOIRE: a flight through a corridor of fence planes set one behind the other, the photo behind them all: the
 * perspective of the grids lays moire fringes over the picture, running with the flight; each fence is a net of fine threads
 * that thickens as it nears and fades as it passes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated)
 *   audioPhrasePos  -> the distance between the fences swells and shrinks over the phrase (continuous)
 *   audioSwell      -> the threads' thickness
 *
 * Knobs: meshP (the nets' mesh), hueP.
//@params meshP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float run = 0.05 * sceneTime + 1.0 * audioAdvance;
    float gap = 1.0 + 0.4 * sin(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float m = 1.0;
    float N = 8.0 + 14.0 * clamp(meshP, 0.0, 1.0);
    for (int i = 0; i < 9; ++i) {
        float d = fract(float(i) / 9.0 + run / gap * 0.5);
        float s = 1.0 / (0.15 + 1.6 * d);
        vec2 q = p * s * N;
        vec2 f = abs(fract(q) - 0.5);
        float th = (0.03 + 0.05 * clamp(audioSwell, 0.0, 1.0)) * (0.5 + d * 1.5);
        float line = smoothstep(0.5 - th, 0.5 - th * 0.3, max(f.x, f.y));
        float fade = sin(3.14159265 * d);
        m *= 1.0 - 0.7 * line * fade * fade;
    }
    vec3 col = imgLod(uv, 0.5) * (0.12 + 1.0 * m);
    finish(col);
}

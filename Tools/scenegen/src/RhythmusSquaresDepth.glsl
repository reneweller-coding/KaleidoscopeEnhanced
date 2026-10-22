//@doc
 * @brief RHYTHMUS SQUARES DEPTH: after Hans Richter's "Rhythmus 21": squares and oblongs on many depth planes, growing,
 * shrinking and covering each other -- black, white and one tone of the photo -- as if the picture plane itself were
 * breathing in a rhythm.  Twelve rectangles, back to front, each growing and shrinking smoothly with the bar (a
 * cosine of the bar's phase, every one offset), sliding slowly in depth; the arrangement changes per phrase.  The
 * tone is one shade of the photo's colour family; the white is warm, the black deep.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase  -> the growing and shrinking (one breath per bar, continuous)
 *   audioPhrasePos -> the rectangles' arrangement drifts over each phrase (smooth)
 *   audioSwell     -> the tone's share against black and white
 *
 * Knobs: countP (how many rectangles), breathP (how far they breathe), hueP.
//@params countP breathP
//@audio audioBarPhase audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float count = 6.0 + 6.0 * clamp(countP, 0.0, 1.0);
    float breath = 0.15 + 0.35 * clamp(breathP, 0.0, 1.0);
    float tonePart = 0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 white = famLight(fh, 0.5, 0.85) * 0.95, tone = famCol(fh, 0.5) * 0.9, black = vec3(0.01);
    vec3 col = black;
    for (int i = 0; i < 12; ++i) {
        float fi = float(i);
        if (fi >= count) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        // its place drifts over the phrase (a closed loop, so the phrase's end meets its start)
        float a = 6.2831853 * (audioPhrasePos + h1);
        vec2 c = vec2(0.55 * (h1 - 0.5) + 0.12 * cos(a), 0.4 * (h2 - 0.5) + 0.08 * sin(a));
        // its size breathes with the bar, each offset in phase
        float b = 0.5 - 0.5 * cos(6.2831853 * (audioBarPhase + fi / count));
        vec2 size = vec2(0.12 + 0.35 * h2, 0.1 + 0.3 * fract(h1 * 3.7)) * (1.0 - breath + 2.0 * breath * b);
        vec2 d = abs(p - c) - size;
        float cover = smoothstep(0.003, -0.003, max(d.x, d.y));
        float tw = smoothstep(fract(h2 * 5.0) - 0.08, fract(h2 * 5.0) + 0.08, tonePart);   // the tone's share glides
        vec3 c3 = mix(mod(fi, 2.0) < 0.5 ? white : black, tone, tw);
        col = mix(col, c3, cover);
    }
    finish(col);
}

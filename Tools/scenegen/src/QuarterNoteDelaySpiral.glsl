//@doc
 * @brief QUARTER NOTE DELAY SPIRAL: a tempo echo: the photo is repeated at every quarter note, each repeat smaller, turned further and fainter, a delay drawn as a spiral of windows; the repeats follow the same movement the
 * main picture makes, a beat later each, so the movement runs down the spiral like an echo.  The feedback (how long the echoes last) rises with the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the main picture's slow movement; the echoes are the same movement one beat further back each
 *   audioSwell      -> the feedback: how many echoes stay visible
 *
 * Knobs: shrinkP (how much smaller each echo is), hueP.
//@params shrinkP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float b4 = rhyBar() * 4.0;
    float shrink = 0.74 + 0.16 * (1.0 - clamp(shrinkP, 0.0, 1.0));
    float fb = 0.55 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = imgLod((p + 0.04 * vec2(sin(1.5707963 * b4), cos(1.5707963 * b4))) * 0.8 + 0.5, 0.6);
    for (int k = 1; k < 10; ++k) {
        float fk = float(k);
        float m = 1.5707963 * (b4 - fk);
        float sc = pow(shrink, fk) * (1.0 + 0.08 * sin(m));
        float ang = 0.3 * fk + 0.18 * sin(m);
        vec2 q = rot2(-ang) * (p - 0.05 * fk * vec2(cos(0.8 * fk), sin(0.8 * fk))) / sc;
        vec2 d = abs(q) - vec2(0.62, 0.36);
        float inside = smoothstep(0.04, 0.0, max(d.x, d.y));
        vec3 c = imgLod(q * 0.8 + 0.5, 0.6);
        col = mix(col, c * (1.1 + 0.2 * sin(m)), inside * pow(fb, fk) * 0.9);
    }
    finish(col);
}

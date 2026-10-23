//@doc
 * @brief THREE AGAINST FOUR VEIL: two sets of lines whose periods stand to each other as three to four, tied to the bar: one set moves three lines through a bar, the other four, and where they cross
 * a moire forms, opening and closing again in time.  The veil lies over the photo and bends it a little where the lines are thick; the directions of the two sets turn once through a phrase, so the picture never repeats within the phrase and closes at its end.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the two sets run three and four lines a bar
 *   audioPhrasePos  -> the directions turn a half-turn a phrase (the lines look the same after it)
 *   audioSwell      -> the moire's contrast
 *
 * Knobs: lineP (how fine the lines), hueP.
//@params lineP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float bar = rhyBar(), ph = rhyPhrase();
    float f0 = 26.0 + 30.0 * clamp(lineP, 0.0, 1.0);
    float a0 = 0.3 + 3.1415927 * ph, b0 = 1.25 - 3.1415927 * ph;
    float sA = dot(p, vec2(cos(a0), sin(a0))) * f0 - 3.0 * bar;
    float sB = dot(p, vec2(cos(b0), sin(b0))) * f0 * 1.07 - 4.0 * bar;
    float lA = smoothstep(0.2, 0.5, abs(fract(sA) - 0.5));
    float lB = smoothstep(0.2, 0.5, abs(fract(sB) - 0.5));
    float cn = 0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float veil = (1.0 - cn * lA) * (1.0 - cn * lB);
    vec3 c = imgLod(uv + 0.012 * vec2(lA - lB, lB + lA - 1.0), 0.6);
    vec3 col = c * veil * 1.25 + 0.06 * imgLod(uv, 5.0) * (1.0 - veil);
    finish(col);
}

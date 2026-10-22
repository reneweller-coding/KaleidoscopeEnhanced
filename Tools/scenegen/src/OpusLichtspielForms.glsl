//@doc
 * @brief OPUS LICHTSPIEL FORMS: after Walter Ruttmann's "Lichtspiel Opus I": painted forms -- waves rolling in from
 * the side, wedges thrusting forward, discs swelling and parting -- interlocking and moving on, in rich colours.
 * Three kinds of form lie in layers, each layer playing its part (leading, answering, ground); with every new section
 * the parts pass on, the forms trading their places in the layering, cross-faded.  The colours are three tones of
 * the photo, calmed toward one colour family, saturated as painted film.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section passes the parts on (the forms trade layers, over six seconds)
 *   audioAdvance       -> the forms move on (integrated)
 *   audioSwell         -> the wedges thrust further and the discs swell
 *
 * Knobs: waveP (how many waves), formP (the forms' size), hueP.
//@params waveP formP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A colour: one of three tones of the photo, calmed toward the colour family.
 *
 * @param k   Which tone, 0..2. (in)
 * @param fh  The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone3(float k, float fh)
{
    vec3 c = imgLod(vec2(0.2 + 0.3 * k, 0.4 + 0.2 * sin(2.0 * k)), 5.5);
    float l = luma(c);
    return mix(c * 1.4, famCol(fh, 0.15 + 0.35 * k) * (0.6 + 0.8 * l), 0.5);
}

/**  A form's coverage: waves (0), wedges (1) or discs (2).
 *
 * @param p      The point. (in)
 * @param kind   The form. (in)
 * @param t      The motion's phase. (in)
 * @param size   The forms' size. (in)
 * @param waves  How many waves. (in)
 * @param push   The swell's push. (in)
 *
 * @return
 *   0..1.
 **/
float form(vec2 p, float kind, float t, float size, float waves, float push)
{
    if (kind < 0.5) {
        float y = 0.25 * sin(waves * p.x * 3.0 - 1.3 * t) + 0.12 * sin(waves * p.x * 5.0 + 0.7 * t) - 0.15;
        return smoothstep(0.006, -0.006, p.y - y);
    }
    if (kind < 1.5) {
        // wedges thrusting from the left, their tips sliding forward and back
        vec2 q = vec2(p.x + 0.9 - (0.6 + 0.4 * push) * (0.5 + 0.5 * sin(0.8 * t)), p.y - 0.25 * sin(0.5 * t));
        float wedge = max(abs(q.y) * 3.0 * size - (-q.x), -q.x - 1.2);
        return smoothstep(0.006, -0.006, wedge);
    }
    float cover = 0.0;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        vec2 c = vec2(0.5 * sin(0.4 * t + 2.1 * fi), 0.25 * cos(0.33 * t + 1.7 * fi));
        float r = size * (0.18 + 0.1 * fi) * (1.0 + 0.4 * push);
        cover = max(cover, smoothstep(0.006, -0.006, length(p - c) - r));
    }
    return cover;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float t = 0.15 * sceneTime + 0.6 * audioAdvance;
    float size = 0.7 + 0.6 * clamp(formP, 0.0, 1.0);
    float waves = 0.6 + 0.8 * clamp(waveP, 0.0, 1.0);
    float push = clamp(audioSwell, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float sA = mod(max(audioSectionPrev, 0.0), 3.0), sB = mod(max(audioSectionId, 0.0), 3.0);
    vec3 col = tone3(2.0, fh) * 0.12;                            // the ground
    // three layers, back to front; the form in each layer passes on with the section
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float kA = mod(fl + sA, 3.0), kB = mod(fl + sB, 3.0);
        float cA = form(p, kA, t + fl, size, waves, push), cB = form(p, kB, t + fl, size, waves, push);
        vec3 c3 = tone3(fl, fh) * (0.85 + 0.25 * fl);
        col = mix(col, c3, mix(cA, cB, m) * 0.92);
    }
    finish(col);
}

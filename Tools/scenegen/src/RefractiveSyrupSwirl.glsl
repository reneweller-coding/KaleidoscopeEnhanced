//@doc
 * @brief REFRACTIVE SYRUP SWIRL: clear liquids of different densities swirl together in front of the photo, invisible
 * themselves and seen only by the way they bend the picture behind: streaks of syrup in water, drawn out into
 * filaments, wobbling the photo along their edges where the light bends hardest.  The liquids' refractive index is a
 * swirling field -- noise carried round a slowly turning flow -- and the photo is looked up displaced by the field's
 * gradient; the strongest bends catch thin bright lines.  Each phrase a fresh streak pours in as a curved band.  The
 * photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the liquids mix (integrated): the swirl turns and draws the streaks out
 *   audioSwell     -> how strongly the streaks bend the picture
 *   audioPhrasePos -> each phrase a fresh streak pours in and stirs through (it fades in and out over the phrase)
 *
 * Knobs: streakP (how fine the streaks are), bendP (the base bend), hueP.
//@params streakP bendP
//@audio audioSwell audioPhrasePos
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  The liquids' refractive index at a place.
 *
 * @param p      The place. (in)
 * @param mixT   The mixing's progress. (in)
 * @param fine   How fine the streaks are. (in)
 * @param pour   The fresh streak's strength. (in)
 *
 * @return
 *   The index (relative).
 **/
float index(vec2 p, float mixT, float fine, float pour)
{
    // a swirl: turned more near its middle, turning on with the mixing
    vec2 c = vec2(0.25 * sin(0.3 * mixT), 0.15 * cos(0.23 * mixT));
    vec2 d = p - c;
    vec2 q = c + rot2(1.6 * exp(-2.5 * dot(d, d)) * sin(0.4 * mixT)) * d;
    float n = fbm(q * fine + vec2(0.3 * mixT, -0.2 * mixT));
    // the fresh streak: a curved band poured across the picture
    float band = q.y - 0.25 * sin(2.0 * q.x + 0.5 * mixT) - 0.1 * (fbm(3.0 * q + mixT) - 0.5);
    return n + pour * 0.6 * exp(-band * band / 0.004);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float fine = 2.0 + 2.5 * clamp(streakP, 0.0, 1.0);
    float bend = (0.03 + 0.03 * clamp(bendP, 0.0, 1.0)) * (0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    float mixT = 0.05 * sceneTime + 0.2 * audioAdvance;
    float pour = sin(3.14159265 * clamp(audioPhrasePos, 0.0, 1.0));
    const float e = 0.004;
    float n0 = index(p, mixT, fine, pour);
    vec2 gr = vec2(index(p + vec2(e, 0.0), mixT, fine, pour) - n0, index(p + vec2(0.0, e), mixT, fine, pour) - n0) / e;
    vec2 seen = p + gr * bend;
    vec3 col = tone(imgLod(seen * 0.6 + 0.5, 0.5), fh);
    float g = length(gr);
    col *= 1.0 - 0.08 * smoothstep(1.0, 4.0, g);
    col += famLight(fh, 0.6, 0.85) * smoothstep(3.0, 7.0, g) * 0.25;
    finish(col);
}

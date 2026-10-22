//@doc
 * @brief OSTINATO RINGS: the music's recurring patterns as turning rings of light: each ring shows the onsets of its
 * last cycle round its circumference -- a beat, half a bar, a bar, two bars -- so a pattern that repeats with the
 * ring's cycle stands still on it as a fixed figure turning once per cycle, while anything that does not repeat smears
 * round.  The scene keeps the last four seconds of onsets in a field of its own and also measures the bar's length
 * there; a place on a ring at an angle behind the ring's turning marker shows the onset as long ago as that share of
 * the cycle.  The bar's length is smoothed and every ring's turning is integrated there too, so a new measurement
 * never jumps the markers.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset    -> the rings' figures: the onsets of each ring's last cycle (kept for four seconds)
 *   audioBarPhase -> the cycles' lengths (the bar's length, measured) and the rings' turning
 *   audioSwell    -> the rings' glow
 *
 * Knobs: sizeP (the rings' size), widthP (the rings' width), hueP.
//@params sizeP widthP
//@audio audioOnset audioBarPhase audioSwell
//@state 256 2 60 32
//@body
/**  A ring's cycle: a beat, half a bar, a bar or two bars.
 *
 * @param k    The ring. (in)
 * @param bar  The bar's length (s). (in)
 *
 * @return
 *   The cycle's length (s), at most four seconds.
 **/
float cycleOf(int k, float bar)
{
    return min(bar * (k == 0 ? 0.25 : k == 1 ? 0.5 : k == 2 ? 1.0 : 2.0), 4.0);
}

/**  The state pass: row 0 the onsets of the last four seconds (newest in cell 0); row 1, cell 0 the bar's length,
 * cells 1 to 4 the rings' turning.
 *
 * @return
 *   Row 0: the onset; row 1, cell 0: x the bar's length (s), y the time in the bar, z the last bar phase, w the
 *   length smoothed; cells 1 to 4: x the ring's phase.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.y == 0) {
        if (c.x == 0) return vec4(clamp(audioOnset, 0.0, 1.0), 0.0, 0.0, 1.0);
        if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
        return texelFetch(texState, ivec2(c.x - 1, 0), 0);
    }
    float bp = clamp(audioBarPhase, 0.0, 1.0);
    vec4 old = stateFrame < 0.5 ? vec4(2.0, 0.0, bp, 2.0) : texelFetch(texState, ivec2(0, 1), 0);
    if (c.x > 0) {
        float ph = stateFrame < 0.5 ? 0.0 : texelFetch(texState, c, 0).x;
        return vec4(fract(ph + 1.0 / (60.0 * cycleOf(c.x - 1, old.w))), 0.0, 0.0, 1.0);
    }
    float t = old.y + 1.0 / 60.0;
    float len = old.x;
    if (bp < old.z - 0.5) {                                           // a bar has ended
        len = clamp(mix(len, t, 0.3), 1.0, 4.0);
        t = 0.0;
    }
    return vec4(len, t, bp, mix(old.w, len, 0.01));
}

/**  The music's onset as it was a while ago.
 *
 * @param age  How long ago, in seconds. (in)
 *
 * @return
 *   The onset then (0 beyond four seconds).
 **/
float onsetAgo(float age)
{
    return texture(texState, vec2(clamp(age * 60.0 - stateFrac, 0.0, 254.0) + 0.5, 0.5) / stateRes).r * (1.0 - smoothstep(3.6, 4.2, age));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float size = 0.9 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float wr = 0.03 + 0.03 * clamp(widthP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float barLen = texelFetch(texState, ivec2(0, 1), 0).w;
    float r = length(p), a = atan(p.y, p.x);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float P = cycleOf(k, barLen);
        float R = size * (0.14 + 0.15 * fk);
        float ring = exp(-pow((r - R) / wr, 2.0));
        float marker = 6.2831853 * fract(texelFetch(texState, ivec2(k + 1, 1), 0).x + stateFrac / (60.0 * P));   // "now"
        float back = fract((marker - a) / 6.2831853);                    // how far behind the marker, as a share of the cycle
        float on = onsetAgo(back * P);
        col += famLight(fh, 0.25 + 0.15 * fk, 0.4 + 0.4 * on) * ring * (0.08 + 1.3 * on) * glow;
        col += famLight(fh, 0.5, 0.9) * ring * exp(-pow(back * 6.2831853 * R / 0.01, 2.0)) * 0.4;   // the marker
    }
    finish(col);
}

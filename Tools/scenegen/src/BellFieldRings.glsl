//@doc
 * @brief BELL FIELD RINGS: a field of twelve floating glowing bells, large and small, one for every pitch class, and
 * when a note or a chord sounds the bells of its tones ring: they brighten and send rings of light spreading out over
 * the dark, which overlap with the rings of the others.  A place lights with the onset of as long ago as a ring from the
 * bell needed to reach it, weighted by how strongly the bell's tone sounded then -- the scene keeps the last four
 * seconds of onsets and the chroma in a field of its own.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset     -> the bells ring and send out rings (kept for four seconds)
 *   audioChroma    -> which bells ring: the tones that sound, a chord ringing several at once
 *   audioAdvance   -> the bells sway (integrated)
 *   audioSwell     -> the rings' glow
 *   audioBeatPhase -> a soft pulse on every beat, so quiet passages with weak onsets keep their light
 *
 * Knobs: bellP (the bells' size), ringP (how fast the rings spread), hueP.
//@params bellP ringP
//@audio audioOnset audioBeatPhase audioChroma[12] audioSwell
//@state 256 3 60
//@body
/**  The state pass: the onsets of the last four seconds weighted by the chroma, three rows of four tones, the newest
 * in column 0.
 *
 * @return
 *   The onset's weight for the row's four tones.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) {
        float mx = 1e-3;
        for (int i = 0; i < 12; ++i) mx = max(mx, audioChroma[i]);
        int b = 4 * c.y;
        vec4 ch = vec4(audioChroma[b], audioChroma[b + 1], audioChroma[b + 2], audioChroma[b + 3]) / mx;
        return max(clamp(audioOnset, 0.0, 1.0), 0.4 * exp(-10.0 * clamp(audioBeatPhase, 0.0, 1.0))) * pow(clamp(ch, 0.0, 1.0), vec4(2.0));
    }
    if (stateFrame < 0.5) return vec4(0.0);
    return texelFetch(texState, ivec2(c.x - 1, c.y), 0);
}

/**  How strongly a bell's tone was struck so long ago.
 *
 * @param i    The bell (the pitch class). (in)
 * @param age  How long ago (s). (in)
 *
 * @return
 *   The weighted onset.
 **/
float struck(int i, float age)
{
    vec4 h = stLin(vec2(clamp(age * 60.0 - stateFrac, 0.0, 254.0) + 0.5, float(i / 4) + 0.5));
    int k = i - 4 * (i / 4);
    return (k == 0 ? h.x : k == 1 ? h.y : k == 2 ? h.z : h.w) * (1.0 - smoothstep(3.6, 4.2, age));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float sz = 0.06 + 0.03 * clamp(bellP, 0.0, 1.0);
    float C = 0.35 + 0.35 * clamp(ringP, 0.0, 1.0);
    float sway = 0.04 * sceneTime + 0.16 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 12; ++i) {
        float fi = float(i);
        vec2 c = vec2(1.5 * (fract(fi * 0.7548777 + 0.2) - 0.5), 0.85 * (fract(fi * 0.5698403 + 0.5) - 0.5));
        c += 0.03 * vec2(sin(sway + 2.0 * fi), cos(0.8 * sway + 3.0 * fi));
        float R = sz * (1.5 - 0.8 * fi / 11.0);
        vec2 d = p - c;
        float r = length(d);
        vec3 tone = famLight(fh, 0.2 + 0.6 * fi / 11.0, 0.4);
        // the rings: the onset of as long ago as a ring needed to get here
        float age = max(r - R, 0.0) / C;
        col += tone * struck(i, age) * exp(-0.6 * age) * smoothstep(0.9 * R, R, r) * 0.5 * glow;
        // the bell: a round crown over a flaring mouth, brightening while it rings
        float ringing = struck(i, 0.08);
        float y = d.y / R, ax = abs(d.x) / R;
        float hw = 0.45 + 0.55 * pow(1.0 - smoothstep(-0.95, 0.3, y), 2.0);
        float sd = y > 0.3 ? length(vec2(ax, y - 0.3)) - 0.45 : ax - hw;
        float open = step(-0.95, y);
        float body = (1.0 - smoothstep(-0.03, 0.03, sd)) * open;
        float rim = exp(-pow(sd / 0.05, 2.0)) * open + exp(-pow((y + 0.95) / 0.05, 2.0)) * step(ax, 1.0);
        col += tone * (body * (0.08 + 0.8 * ringing) + rim * (0.2 + 0.4 * ringing));
    }
    finish(col);
}

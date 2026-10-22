//@doc
 * @brief REVERB LIGHT REFLECTIONS: every onset sends out a ring of light that reflects off the walls of an unseen hall
 * and dies away -- the echo made visible: the direct ring first, then its reflections from each wall, then the
 * reflections of reflections, overlapping into a shimmering reverberation that fades.  The hall's reflections are image
 * sources (the source mirrored in the walls, and mirrored again); a place lights with the onset as it was as long ago as
 * the light from each image needed to reach it, weaker with every reflection -- the scene keeps the last four seconds of
 * onsets in a field of its own.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> every onset sends out a ring and its echoes (kept for four seconds)
 *   audioAdvance -> the source wanders through the hall (integrated)
 *   audioSwell   -> the rings' glow
 *   audioBeatPhase -> a soft pulse on every beat, so quiet passages with weak onsets keep their light
 *
 * Knobs: hallP (the hall's size), decayP (how long the echoes last), hueP.
//@params hallP decayP
//@audio audioOnset audioBeatPhase audioSwell
//@state 256 1 60
//@body
/**  The state pass: the onsets of the last four seconds, the newest in cell 0, each step moving them one cell on.
 *
 * @return
 *   The onset this cell keeps, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) return vec4(max(clamp(audioOnset, 0.0, 1.0), 0.4 * exp(-10.0 * clamp(audioBeatPhase, 0.0, 1.0))), 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    return texelFetch(texState, ivec2(c.x - 1, 0), 0);
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
    return stLin(vec2(clamp(age * 60.0 - stateFrac, 0.0, 254.0) + 0.5, 0.5)).r * (1.0 - smoothstep(3.6, 4.2, age));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 W = vec2(1.0, 0.6) * (0.9 + 0.4 * clamp(hallP, 0.0, 1.0));
    float keep = 0.45 + 0.35 * clamp(decayP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 S = vec2(0.6 * W.x * sin(run), 0.6 * W.y * cos(0.7 * run));
    const float C = 0.9;                                              // the light's speed in the hall
    float acc = 0.0;
    for (int i = -2; i <= 2; ++i) {
        for (int j = -2; j <= 2; ++j) {
            vec2 img = vec2(float(i) * 2.0 * W.x + (abs(i) % 2 == 0 ? S.x : -S.x),
                            float(j) * 2.0 * W.y + (abs(j) % 2 == 0 ? S.y : -S.y));
            float order = float(abs(i) + abs(j));
            float age = length(p - img) / C;
            acc += onsetAgo(age) * pow(keep, order) * exp(-0.35 * age);
        }
    }
    vec3 col = famCol(fh, 0.45) * 0.015 + famLight(fh, 0.4, 0.4) * acc * 0.7 * glow;
    col += famLight(fh, 0.5, 0.8) * exp(-dot(p - S, p - S) / 0.0006) * 0.6;   // the source
    finish(col);
}

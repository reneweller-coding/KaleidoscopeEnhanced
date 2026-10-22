//@doc
 * @brief DOWNBEAT RIPPLE POOL: a pool of light, and on every beat a small drop falls into it at a new place, on every
 * bar's first beat a bigger one, on every new phrase the biggest; their rings spread and overlap into interference over
 * the whole surface and fade.  A small field of the scene's own keeps the last sixteen drops -- each its moment, its
 * place and its size, written into the next slot when the beat phase wraps (or the bar's, or a phrase begins) -- and
 * the surface lights where each drop's ring has reached by now; a ring shades the water like a wave, bright on its
 * crest and dark in its trough.  The water is toned by the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> every beat drops a small drop into the pool at a new place
 *   audioBarPhase  -> every bar's first beat a bigger one
 *   audioPhrasePos -> every new phrase the biggest
 *   audioSwell     -> the water's glow
 *
 * Knobs: speedP (how fast the rings spread), widthP (the rings' width), hueP.
//@params speedP widthP
//@audio audioBeatPhase audioBarPhase audioPhrasePos audioSwell
//@state 17 1 60 32
//@body
/**  The state pass: sixteen drop slots and a seventeenth that remembers the last bar phase, the drop count, the
 * phrase position and the last beat phase.
 *
 * @return
 *   A drop: its time, x, y, size; or the bookkeeping: last bar phase, drops so far, last phrase position, last beat phase.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float bp = clamp(audioBarPhase, 0.0, 1.0), pp = clamp(audioPhrasePos, 0.0, 1.0), bt = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return j == 16 ? vec4(bp, 0.0, pp, bt) : vec4(-100.0, 0.0, 0.0, 0.0);
    vec4 book = texelFetch(texState, ivec2(16, 0), 0);
    bool phrase = pp < book.z - 0.5, bar = bp < book.x - 0.5;
    bool drop = bt < book.w - 0.5 || bar || phrase;
    if (j == 16) return vec4(bp, drop ? mod(book.y + 1.0, 1600.0) : book.y, pp, bt);
    if (drop && j == int(mod(book.y, 16.0))) {
        vec2 at = vec2(1.5 * (fract(book.y * 0.7548777 + 0.13) - 0.5), 0.85 * (fract(book.y * 0.5698403 + 0.37) - 0.5));
        return vec4(stateFrame / 60.0, at, phrase ? 1.0 : bar ? 0.6 : 0.3);
    }
    return texelFetch(texState, ivec2(j, 0), 0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float C = 0.25 + 0.25 * clamp(speedP, 0.0, 1.0);
    float w = 0.02 + 0.02 * clamp(widthP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float now = (stateFrame - 1.0 + stateFrac) / 60.0;                // the newest step's time carried on
    float wave = 0.0;
    for (int j = 0; j < 16; ++j) {
        vec4 d = texelFetch(texState, ivec2(j, 0), 0);
        float age = now - d.x;
        if (age < 0.0 || age > 6.0) continue;
        float r = length(p - d.yz);
        float x = (r - C * age * (0.6 + 0.6 * d.w)) / (w * (0.6 + 0.6 * d.w) * (1.0 + age * 0.3));
        wave += d.w * sin(x * 3.0) * exp(-x * x * 0.5) * exp(-0.6 * age) * smoothstep(0.0, 0.1, age);
    }
    vec3 water = famCol(fh, 0.45) * (0.1 + 0.06 * fbm(3.0 * p + 0.02 * now));
    vec3 col = water + famLight(fh, 0.5, 0.6) * max(wave, 0.0) * 1.3 * glow - water * min(max(-wave, 0.0), 1.0) * 0.8;
    finish(max(col, vec3(0.0)));
}

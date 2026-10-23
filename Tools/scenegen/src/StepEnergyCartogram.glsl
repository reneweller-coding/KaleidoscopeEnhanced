//@doc
 * @brief STEP ENERGY CARTOGRAM: the picture as a map of the groove: four tracks (bass drum, snare, hi-hat, the rest) of sixteen steps each, and the width of every cell is the energy the music had on that step, averaged over the last
 * bars (in a small field of the scene's own); loud steps are wide cells showing the photo close, quiet steps narrow ones showing it from afar, and a light runs through the steps with the bar.  Every cell is a piece of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioKick/Snare/Hat/Mid -> the energy of the step, averaged over the bars (the width of the cell, its zoom)
 *   audioBarPhase   -> the light that runs through the sixteen steps
 *
 * Knobs: contrastP (how much wider the loud steps are), hueP.
//@params contrastP
//@audio audioKick audioSnare audioHat audioMid
//@state 16 4 30 32
//@body
/**  The state pass: the energy of every step on every track, a running average over the bars.
 *
 * @return
 *   x the average energy of this step on this track, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    float old = stateFrame < 0.5 ? 0.0 : texelFetch(texState, c, 0).x;
    float cur = floor(rhyBar() * 16.0);
    float e = c.y == 0 ? audioKick : (c.y == 1 ? audioSnare : (c.y == 2 ? audioHat : audioMid));
    float w = float(c.x) == cur ? 0.06 : 0.0;
    return vec4(old + (clamp(e, 0.0, 1.0) - old) * w, 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float row = clamp(floor((0.5 - p.y) * 4.0), 0.0, 3.0);
    float x01 = p.x / asp + 0.5;
    float mx = 0.05;
    for (int k = 0; k < 16; ++k) mx = max(mx, texelFetch(texState, ivec2(k, int(row)), 0).x);
    float k2 = 0.6 + 1.6 * clamp(contrastP, 0.0, 1.0);
    float sum = 0.0;
    for (int k = 0; k < 16; ++k) sum += 0.3 + k2 * texelFetch(texState, ivec2(k, int(row)), 0).x / mx;
    float acc = 0.0, a0 = 0.0, wk = 1.0, en = 0.0, kk = 0.0;
    float xs = x01 * sum;
    for (int k = 0; k < 16; ++k) {
        float e = texelFetch(texState, ivec2(k, int(row)), 0).x / mx;
        float w = 0.3 + k2 * e;
        if (xs >= acc) { a0 = acc; wk = w; en = e; kk = float(k); }
        acc += w;
    }
    float f = (xs - a0) / wk;
    vec2 cc = vec2(((a0 + 0.5 * wk) / sum - 0.5) * asp, 0.5 - (row + 0.5) / 4.0);
    float z = 1.7 - 1.1 * en;
    vec3 c = imgLod((cc + (p - cc) * z) * 0.8 + 0.5, 0.5 + 1.2 * (z - 0.6));
    float fy = fract((0.5 - p.y) * 4.0);
    float joint = smoothstep(0.0, 0.03, min(f, 1.0 - f) * wk * 0.5) * smoothstep(0.0, 0.03, min(fy, 1.0 - fy));
    float lit = 0.62 + 0.45 * en + 0.7 * rhyBump(kk + 0.5, rhyBar() * 16.0, 16.0, 1.3);
    finish(c * lit * joint * 1.08);
}

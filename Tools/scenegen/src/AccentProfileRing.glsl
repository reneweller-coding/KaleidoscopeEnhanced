//@doc
 * @brief ACCENT PROFILE RING: the accent profile of the bar as a ring: every eighth is a segment whose size is the measured strength of the accents on it -- the one the strongest, the backbeats middling, the rest quiet,
 * averaged over the last bars in a small field of the scene's own -- and each segment shows the photo at its strength: a loud step is a long wedge showing the photo close, a quiet one a short wedge showing it from afar.  A light runs
 * round the ring with the bar.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> the strength of the accent on each eighth (averaged over the bars)
 *   audioBarPhase   -> the light that runs round the ring
 *
 * Knobs: reachP (how long the longest wedge is), hueP.
//@params reachP
//@audio audioOnset
//@state 8 1 30 32
//@body
/**  The state pass: the strength of the accent on each eighth of the bar, a running average over the bars.
 *
 * @return
 *   x the average strength of this eighth, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    float old = stateFrame < 0.5 ? 0.0 : texelFetch(texState, c, 0).x;
    float cur = floor(rhyBar() * 8.0);
    float w = float(c.x) == cur ? 0.05 : 0.0;
    return vec4(old + (clamp(audioOnset, 0.0, 1.0) - old) * w, 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float r = length(p);
    float f = fract(atan(p.x, p.y) / 6.2831853);
    float seg = floor(f * 8.0);
    float fs = fract(f * 8.0);
    float mx = 0.05;
    for (int k = 0; k < 8; ++k) mx = max(mx, texelFetch(texState, ivec2(k, 0), 0).x);
    float en = texelFetch(texState, ivec2(int(seg), 0), 0).x / mx;
    float R = 0.12 + (0.2 + 0.25 * clamp(reachP, 0.0, 1.0)) * (0.25 + 0.75 * en) + 0.04 * sin(0.2 * sceneTime + seg);
    float inside = smoothstep(R, R - 0.012, r) * smoothstep(0.0, 0.03, min(fs, 1.0 - fs));
    float z = 1.5 - 0.9 * en;
    vec3 c = imgLod(p * z * 0.8 + 0.5, 0.5 + 1.0 * (z - 0.6));
    float lit = 0.55 + 0.35 * en + 0.9 * rhyBump(seg + 0.5, rhyBar() * 8.0, 8.0, 1.0);
    vec3 ghost = imgLod(p * 0.8 + 0.5, 3.5) * 0.2;
    finish(mix(ghost, c * lit * 1.1, inside));
}

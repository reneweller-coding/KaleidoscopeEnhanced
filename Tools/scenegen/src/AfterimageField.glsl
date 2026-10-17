//@doc
 * @brief AFTERIMAGE FIELD: the eye's afterimage -- what was bright a moment ago glows on in its opponent colour.  The
 * photo drifts and turns slowly; a memory of what the eye saw lags behind it, and wherever the picture has moved on,
 * the memory shows through in complementary colours: red leaves cyan ghosts, yellow leaves violet ones.  The field
 * is never still, so the ghosts trail every edge.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the decay time: in quiet passages the afterimages linger
 *   audioPhase      -> the photo's turning (integrated)
 *   audioKick       -> the ghosts brighten (light)
 *
 * Knobs: driftP (how fast the photo moves), ghostP (how strong the afterimages are), turnP (how much it turns), hueP.
//@params driftP ghostP turnP
//@audio audioSwell audioKick
//@state 480 270 30
//@body
/**  The moving photo at a screen point, as the eye sees it now.
 *
 * @param p  The screen point. (in)
 *
 * @return
 *   The photo's colour there.
 **/
vec3 seen(vec2 p)
{
    float t = (0.12 + 0.25 * clamp(driftP, 0.0, 1.0)) * sceneTime;
    vec2 q = rot2((0.2 + 0.5 * clamp(turnP, 0.0, 1.0)) * sin(0.21 * sceneTime + 0.03 * audioPhase)) * p;
    q += 0.25 * vec2(sin(t * 2.3), cos(t * 1.7));
    return imgLod(q * (0.8 + 0.1 * sin(t)) + 0.5, 0.8);
}

/**  The eye's memory for this texel (the state pass): it follows what is seen, slowly.
 *
 * @return
 *   The remembered colour (rgb), 1.
 **/
vec4 stateStep()
{
    vec2 p = (vec2(stCell()) + 0.5) / stateRes * vec2(1.7777778, 1.0) - vec2(0.8888889, 0.5);
    vec3 now = seen(p);
    if (stateFrame < 0.5) return vec4(now, 1.0);
    float rate = 0.015 + 0.04 * clamp(audioSwell, 0.0, 1.0);   // loud: the memory catches up faster
    return vec4(mix(stAt(stCell()).rgb, now, rate), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec3 now = seen(p);
    vec3 mem = stLin((p + vec2(0.8888889, 0.5)) / vec2(1.7777778, 1.0) * stateRes).rgb;
    // the afterimage: where the memory is brighter than what is seen now, its opponent colour glows
    vec3 diff = max(mem - now, 0.0);
    vec3 opp = vec3(luma(diff)) * 2.0 - diff;                   // the opponent colour of what has faded
    float g = (1.2 + 1.8 * clamp(ghostP, 0.0, 1.0)) * (0.8 + 0.6 * clamp(audioKick, 0.0, 1.0));
    vec3 col = now * 0.7 + max(opp, 0.0) * g + diff * 0.2;
    finish(col);
}

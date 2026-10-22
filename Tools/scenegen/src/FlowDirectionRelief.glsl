//@doc
 * @brief FLOW DIRECTION RELIEF: a flow drawn as a relief of light: the direction of the flow at every place shows as a
 * lit or shaded slope, its speed as brightness, its streamlines as fine streaks running along it -- a landscape of
 * light that swirls round wandering vortices; each onset stirs in a further vortex that rises and dies away smoothly.
 * The velocity is the sum of point vortices and a slow drift; the relief's light is the cosine between the flow's
 * direction and a light direction; the streaks are noise read at a few points along the local streamline, carried
 * along it.  The onset's vortex follows the onsets smoothed in a small field of the scene's own.  Two tones of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the vortices wander and the streaks flow (integrated)
 *   audioOnset   -> the onsets stir in a further vortex (smoothed, so it rises and fades)
 *   audioSwell   -> the relief's brightness
 *
 * Knobs: vortexP (how many vortices), streakP (how fine the streaks are), hueP.
//@params vortexP streakP
//@audio audioOnset audioSwell
//@state 1 1 60
//@body
/**  The state pass: the onsets smoothed over about half a second.
 *
 * @return
 *   The smoothed onset, 0, 0, 1.
 **/
vec4 stateStep()
{
    float v = clamp(audioOnset, 0.0, 1.0);
    float old = stateFrame < 0.5 ? v : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, v, 0.05), 0.0, 0.0, 1.0);
}

/**  The flow's velocity at a place.
 *
 * @param p     The place. (in)
 * @param N     The number of vortices. (in)
 * @param run   The wandering's progress. (in)
 * @param kick  The onsets' vortex strength. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 flow(vec2 p, float N, float run, float kick)
{
    vec2 v = vec2(0.3, 0.05);
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        vec2 c = vec2(0.7 * sin(run * (0.4 + 0.1 * fi) + 2.1 * fi), 0.35 * cos(run * (0.33 + 0.12 * fi) + 1.3 * fi));
        vec2 r = p - c;
        float G = (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0) * 0.08;
        v += G * vec2(-r.y, r.x) / (dot(r, r) + 0.004);
    }
    vec2 r = p - vec2(0.2 * sin(0.7 * run), -0.1);
    v += kick * 0.15 * vec2(-r.y, r.x) / (dot(r, r) + 0.006);
    return v;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 3.0 * clamp(vortexP, 0.0, 1.0));
    float fine = 30.0 + 40.0 * clamp(streakP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float kick = texelFetch(texState, ivec2(0, 0), 0).r;
    vec2 v = flow(p, N, run, kick);
    float sp = length(v);
    vec2 dir = v / max(sp, 1e-4);
    float relief = 0.5 + 0.5 * dot(dir, normalize(vec2(-0.6, 0.8)));
    // the streaks: noise read along the local streamline and carried along it -- two layers, each carried only a
    // short way before it fades and starts again, so the carrying never runs away (a direction times an unbounded
    // clock would make the noise leap whenever the direction turns)
    float f1 = fract(4.0 * run), f2 = fract(4.0 * run + 0.5);
    float s1 = 0.0, s2 = 0.0;
    for (int k = -3; k <= 3; ++k) {
        s1 += noise2((p + dir * (float(k) * 0.012 - 0.05 * f1)) * fine);
        s2 += noise2((p + dir * (float(k) * 0.012 - 0.05 * f2)) * fine + 13.7);
    }
    float wl = abs(1.0 - 2.0 * f1);
    float s = (wl * s2 + (1.0 - wl) * s1) / 7.0;
    float bright = (0.25 + 0.75 * smoothstep(0.0, 1.5, sp)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = mix(famCol(fh, 0.2), famLight(fh, 0.8, 0.3), relief) * bright * (0.55 + 0.7 * s);
    finish(col);
}

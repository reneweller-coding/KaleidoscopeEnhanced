//@doc
 * @brief GREENBERG-HASTINGS WAVES: an excitable automaton -- a resting cell fires when enough neighbours fire, then
 * stays refractory for a while.  From scattered sparks the field organises into travelling fronts and rotating
 * spirals that fill the frame; where a front has passed, the photo is laid bare and slowly sinks back into the dark.
 * An endless, periodic field (a torus): it continues past the frame edges and mirrors without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> a spark: a short arc of fire at a wandering place, whose two open ends curl into a new
 *                      pair of spirals (structure)
 *   audioSwell      -> the brightness of the bared photo
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the fronts flash (light)
 *
 * Knobs: tailP (refractory length), reachP (neighbourhood: the square Moore one or a round disc of radius 2, whose
 * fronts are round), scaleP (cell size), hueP.
//@params tailP reachP scaleP
//@audio audioSwell audioOnset audioKick
//@state 480 270 40
//@body
/**  The number of states: resting, firing and the refractory ones.
 *
 * @return
 *   The number of states, 6..16.
 **/
float statesNow() { return floor(6.0 + 10.0 * clamp(tailP, 0.0, 1.0)); }

/**  One step of the excitable automaton for this cell (the state pass).
 *
 * @return
 *   State (0 resting, 1 firing, 2.. refractory), front glow, photo reveal, tail shade.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float n = statesNow();
    if (stateFrame < 0.5) {
        // scattered sparks with refractory tails behind them: broken fronts, which curl into spirals
        float r = stRand(0);
        float s = r < 0.06 ? 1.0 + floor(stRand(1) * (n - 1.0)) : 0.0;
        return vec4(s, 0.0, 0.0, 0.0);
    }
    vec4 c = stAt(ip);
    float s = c.r;
    float s2;
    if (s < 0.5) {
        bool disc = reachP > 0.3;                               // the disc of radius 2 (round fronts) or Moore
        float cnt = 0.0;
        for (int dy = -2; dy <= 2; ++dy)
            for (int dx = -2; dx <= 2; ++dx) {
                if (dx == 0 && dy == 0) continue;
                if (disc ? dx * dx + dy * dy > 5 : (abs(dx) > 1 || abs(dy) > 1)) continue;
                if (abs(stAt(ip + ivec2(dx, dy)).r - 1.0) < 0.5) cnt += 1.0;
            }
        s2 = cnt >= (disc ? 3.0 : 1.0) ? 1.0 : 0.0;
        if (stRand(2) < 1.0e-6) s2 = 1.0;                       // a rare spontaneous spark
    } else {
        s2 = s + 1.0 >= n ? 0.0 : s + 1.0;
    }
    // a short arc of fire, with refractory cells on one side: its open ends curl into a pair of spirals -- on an
    // onset, and every 300 steps by itself (a multiple of the 30-step slot: 400 met it only every 1200), so the
    // field never runs out of spiral cores
    float slot = floor(stateFrame / 30.0);
    vec2 at = vec2(hash11(slot * 3.17 + 0.3), hash11(slot * 5.91 + 0.7)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    d = rot2(6.2831853 * hash11(slot * 1.37)) * d;
    bool arc = abs(d.x) < 14.0 && abs(d.y) < 1.5;
    bool behind = abs(d.x) < 14.0 && d.y < -1.5 && d.y > -6.0;
    bool go = mod(stateFrame, 30.0) < 1.0 && (clamp(audioOnset, 0.0, 1.0) > 0.6 || mod(stateFrame, 300.0) < 1.0);
    if (go && arc) s2 = 1.0;
    if (go && behind) s2 = 2.0;
    bool firing = abs(s2 - 1.0) < 0.5;
    float glow = firing ? 1.0 : c.g * 0.8;
    float reveal = firing ? 1.0 : c.b * 0.992;
    float tail = s2 < 0.5 ? 0.0 : 1.0 - (s2 - 1.0) / max(n - 1.0, 1.0);
    return vec4(s2, glow, reveal, tail);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.55 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p + 0.02 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime)), zoom);
    vec4 c = stLin(cc);
    vec2 uv = cc / stateRes.y * 0.6;
    vec3 photo = imgLod(uv, 1.0);
    vec3 hot = imgPalette(0.15 + 0.5 * c.a + 0.03 * audioPhase);
    hot = mix(hot, vec3(luma(hot)), -0.4);                      // a little more saturated than the photo
    vec3 col = photo * (0.08 + (0.55 + 0.35 * clamp(audioSwell, 0.0, 1.0)) * c.b);   // bared where fronts passed
    col += hot * c.a * c.a * 0.55;                              // the refractory tail behind each front
    col += mix(hot, vec3(1.0), 0.35) * c.g * (0.9 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

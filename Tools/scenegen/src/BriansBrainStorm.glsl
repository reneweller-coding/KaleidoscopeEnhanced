//@doc
 * @brief BRIAN'S BRAIN STORM: Silverman's three-state automaton -- a resting cell fires when exactly two neighbours
 * fire, then it is dying for a step, then resting again.  The field never settles: a storm of gliders, rakes and
 * splinters races in every direction.  They paint the photo where they pass; their trails glow and fade like
 * smoke.  An endless, periodic field (a torus).
 *
 * Audio Reactivity (structure, not only light):
 *   audioLevel      -> the density: loud music kindles new sparks all over the field
 *   audioOnset      -> a burst of sparks at a wandering place (structure)
 *   audioSwell      -> the pace (quiet music skips steps, the storm slows)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the firing cells flash (light)
 *
 * Knobs: trailP (how long the trails glow), scaleP (cell size), hueP.
//@params trailP scaleP
//@audio audioSwell audioOnset audioKick
//@state 480 270 40
//@body
/**  One step of Brian's Brain for this cell (the state pass).
 *
 * @return
 *   State (0 resting, 1 firing, 2 dying), firing glow, trail, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        float r = stRand(0);
        return vec4(r < 0.12 ? 1.0 : (r < 0.24 ? 2.0 : 0.0), 0.0, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    // pace: in quiet music whole steps are skipped (every cell alike)
    if (stRandStep(0) > 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)) {
        float fade = 0.97 - 0.04 * (1.0 - clamp(trailP, 0.0, 1.0));
        return vec4(c.r, c.g * 0.85, c.b * fade, 1.0);
    }
    float s = c.r, s2;
    if (s > 1.5) s2 = 0.0;
    else if (s > 0.5) s2 = 2.0;
    else {
        float on = 0.0;
        for (int dy = -1; dy <= 1; ++dy)
            for (int dx = -1; dx <= 1; ++dx)
                if ((dx != 0 || dy != 0) && abs(stAt(ip + ivec2(dx, dy)).r - 1.0) < 0.5) on += 1.0;
        s2 = abs(on - 2.0) < 0.5 ? 1.0 : 0.0;
        if (stRand(1) < 3.0e-5 * clamp(audioLevel, 0.0, 1.0)) s2 = 1.0;
        float slot = floor(stateFrame / 20.0);
        vec2 at = vec2(hash11(slot * 1.91 + 0.2), hash11(slot * 6.13 + 0.5)) * stateRes;
        vec2 d = abs(vec2(ip) - at);
        d = min(d, stateRes - d);
        if (mod(stateFrame, 20.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.5 && length(d) < 7.0 && stRand(2) < 0.3)
            s2 = 1.0;
    }
    float firing = abs(s2 - 1.0) < 0.5 ? 1.0 : 0.0;
    float fade = 0.97 - 0.04 * (1.0 - clamp(trailP, 0.0, 1.0));
    return vec4(s2, max(firing, c.g * 0.6), max(firing, c.b * fade), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.5 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p + 0.02 * vec2(sin(0.037 * sceneTime), cos(0.029 * sceneTime)), zoom);
    vec4 s = stLin(cc);
    vec2 uv = cc / stateRes.y * 0.65;
    vec3 photo = imgLod(uv, 0.8);
    vec3 smoke = mix(photo, imgPalette(0.3 + 0.4 * s.b + 0.03 * audioPhase), 0.35);
    vec3 col = photo * 0.06 + smoke * s.b * 0.9;
    col += mix(imgPalette(0.7 + 0.03 * audioPhase), vec3(1.0), 0.5) * s.g * (0.9 + 0.9 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

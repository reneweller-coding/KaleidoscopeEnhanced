//@doc
 * @brief SOTO PENETRABLE: a glide through thousands of hanging coloured threads, as in Jesus Rafael Soto's
 * Penetrables: the threads hang from far above in a dense forest, slide past one another in parallax as the view moves
 * among them, and sway in time with the music.  The threads hang one in every cell of a ground grid; the ray walks the
 * cells it crosses on the ground plan and gathers every thread's glow by its distance on the screen; a thread swings
 * like a pendulum from its top, by the beats counted in a small field of the scene's own, a little later than its
 * neighbour.  The threads are shades of one colour family from the photo, the farther the dimmer.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the threads sway with the beats (counted, so the swing runs on smoothly)
 *   audioAdvance   -> the glide through the threads (integrated)
 *   audioSwell     -> the threads' glow
 *
 * Knobs: densityP (how dense the threads hang), swayP (how far they sway), hueP.
//@params densityP swayP
//@audio audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float glide = 0.2 * sceneTime + 0.7 * audioAdvance;
    float G = 0.42 - 0.2 * clamp(densityP, 0.0, 1.0);                // the grid's spacing
    float sway = 0.04 + 0.08 * clamp(swayP, 0.0, 1.0);
    vec2 cam = vec2(0.6 * sin(0.05 * glide), glide);                  // x and z of the eye on the ground plan
    vec2 dir = normalize(vec2(p.x / F, 1.0));
    vec3 col = famCol(fh, 0.4) * 0.03;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 last = vec2(-999.0);
    for (int s = 0; s < 60; ++s) {
        float t = 0.15 + float(s) * 0.5 * G;
        vec2 x = cam + dir * t;
        vec2 cell = floor(x / G);
        if (cell == last) continue;
        last = cell;
        for (int nb = -1; nb <= 1; ++nb) {
            vec2 cc = cell + vec2(float(nb), 0.0);
            vec2 h = hash22(cc);
            vec2 th = (cc + 0.15 + 0.7 * h) * G;                       // the thread's place on the ground plan
            float z = th.y - cam.y;
            if (z < 0.08) continue;
            float yTop = 1.6;
            float yw = p.y * z / F;                                    // the height this pixel looks at on the thread
            float swing = sway * sin(3.14159265 * beats / 2.0 + 0.7 * cc.x + 0.5 * cc.y) * (yTop - yw) / yTop;
            float sx = (th.x + swing - cam.x) / z * F;
            float d = abs(p.x - sx);
            float w = 0.0035 / z + 0.8 / resolution.y;
            float g = exp(-pow(d / w, 2.0)) + 0.15 * exp(-d / (3.0 * w));
            vec3 c = famLight(fh, 0.15 + 0.7 * h.y, 0.25);
            col += c * g * exp(-0.12 * z) * glow * (0.6 + 0.4 * h.x) * smoothstep(0.08, 0.4, z);
        }
    }
    finish(col);
}

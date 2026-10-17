//@doc
 * @brief WIREWORLD CIRCUITRY: Brian Silverman's Wireworld on a circuit board that grows out of the photo -- the
 * conductors are the photo's contour lines (its brightness in a few levels), so every picture is a different
 * board.  Electrons (a head and a tail) run along the traces, split at the forks, die in the dead ends and cancel
 * at the gates; the board drifts slowly, so the traces are always moving.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> electrons are fed in at a wandering contact (structure)
 *   audioSwell      -> how many electrons appear by themselves
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the electrons flash (light)
 *
 * Knobs: levelsP (how many contour levels: sparse or dense wiring), scaleP (cell size), driftP (how fast the board
 * drifts), hueP.
//@params levelsP scaleP driftP
//@audio audioSwell audioOnset audioKick
//@state 360 200 30
//@body
/**  Whether a cell is a conductor this step: a contour line of the drifting photo.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   True on a trace.
 **/
bool wireAt(ivec2 ip)
{
    float lv = 2.0 + 3.0 * clamp(levelsP, 0.0, 1.0);
    vec2 drift = (0.002 + 0.01 * clamp(driftP, 0.0, 1.0)) * sceneTime * vec2(1.0, 0.6);
    vec2 uv = vec2(ip) / stateRes.y * 0.55 + drift;
    float a = floor(luma(imgLod(uv, 3.5)) * lv);
    float b = floor(luma(imgLod(uv + vec2(1.0, 0.0) / stateRes.y * 0.55, 3.5)) * lv);
    float c = floor(luma(imgLod(uv + vec2(0.0, 1.0) / stateRes.y * 0.55, 3.5)) * lv);
    return a > b || a > c;                                      // one side of each contour only: a trace one cell wide
}

/**  One Wireworld step for this cell (the state pass).
 *
 * @return
 *   State (0 empty, 1 conductor, 2 electron head, 3 tail), head glow, conductor glow, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    bool wire = wireAt(ip);
    if (stateFrame < 0.5) return vec4(wire ? (stRand(0) < 0.01 ? 2.0 : 1.0) : 0.0, 0.0, wire ? 1.0 : 0.0, 1.0);
    vec4 c = stAt(ip);
    float s = c.r, s2 = 0.0;
    if (wire) {
        if (s > 2.5) s2 = 1.0;                                  // tail -> conductor
        else if (s > 1.5) s2 = 3.0;                             // head -> tail
        else {
            float heads = 0.0;
            for (int dy = -1; dy <= 1; ++dy)
                for (int dx = -1; dx <= 1; ++dx)
                    if ((dx != 0 || dy != 0) && abs(stAt(ip + ivec2(dx, dy)).r - 2.0) < 0.5) heads += 1.0;
            s2 = (heads > 0.5 && heads < 2.5) ? 2.0 : 1.0;
            if (s2 < 1.5 && stRand(1) < 6.0e-5 * (0.3 + clamp(audioSwell, 0.0, 1.0))) s2 = 2.0;
            // an onset feeds electrons in at a contact that wanders every 15 steps
            float slot = floor(stateFrame / 15.0);
            vec2 at = vec2(hash11(slot * 2.31 + 0.4), hash11(slot * 4.77 + 0.9)) * stateRes;
            vec2 d = abs(vec2(ip) - at);
            d = min(d, stateRes - d);
            if (mod(stateFrame, 15.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.5 && length(d) < 4.0) s2 = 2.0;
        }
    }
    float glow = abs(s2 - 2.0) < 0.5 ? 1.0 : c.g * 0.82;
    float trace = mix(c.b, wire ? 1.0 : 0.0, 0.25);
    return vec4(s2, glow, trace, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.35 + 0.25 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec2 drift = (0.002 + 0.01 * clamp(driftP, 0.0, 1.0)) * sceneTime * vec2(1.0, 0.6);
    vec2 uv = cc / stateRes.y * 0.55 + drift;
    vec3 photo = imgLod(uv, 1.0);
    vec3 board = photo * 0.28;                                  // the photo under the board
    vec3 copper = mix(imgPalette(0.1 + 0.03 * audioPhase), vec3(0.9, 0.7, 0.45) * luma(photo) * 2.0, 0.4);
    vec3 col = board + copper * s.b * 0.7;
    // the electrons with a soft halo (a ring of taps around the pixel), so a single cell reads as a round spark
    float halo = 0.0;
    for (int i = 0; i < 6; ++i) {
        float a = 1.047 * float(i);
        halo += stLin(cc + 1.6 * vec2(cos(a), sin(a))).g;
    }
    vec3 spark = mix(imgPalette(0.55 + 0.03 * audioPhase), vec3(1.0), 0.45);
    col += spark * (1.6 * s.g + 0.25 * halo) * (1.0 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

//@doc
 * @brief TURING-HOPF BLINKERS: the Brusselator reaction-diffusion system tuned to the point where a Turing and a Hopf
 * instability meet -- spots form as in a Turing pattern, but they blink, in and out of phase with their
 * neighbours, and the blinking travels across the field in waves while the spots slowly rearrange.  Every spot is a
 * lens that magnifies the photo beneath it while it is lit.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> b, the distance past the Hopf point: loud music blinks harder and faster
 *   audioOnset      -> a drop of the activator at a wandering place: a new blinking cluster (structure)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the lit spots flash (light)
 *
 * Knobs: spotP (the spots' size: the diffusion lengths), lensP (how strongly a spot magnifies), hueP.
//@params spotP lensP
//@audio audioSwell audioKick audioOnset
//@state 320 180 240
//@body
/**  One explicit step of the Brusselator (a = 2) for this cell (the state pass).
 *
 * @return
 *   u (activator), v (inhibitor), u smoothed, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float a = 2.0;
    if (stateFrame < 0.5) return vec4(a + 0.3 * (stRand(0) - 0.5), 2.6 + 0.3 * (stRand(1) - 0.5), a, 1.0);
    vec4 c = stAt(ip);
    float u = c.r, v = c.g;
    vec2 lap = stLap9(ip).rg;
    float sz = 1.0 + 1.5 * clamp(spotP, 0.0, 1.0);
    float du0 = 0.8 * sz, dv0 = 4.0 * sz;                      // Turing below the Hopf point: spots first, then they blink
    float b = 5.05 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float dt = 0.02;
    float u2 = u + dt * (a - (b + 1.0) * u + u * u * v + du0 * lap.x);
    float v2 = v + dt * (b * u - u * u * v + dv0 * lap.y);
    // an onset: a drop of activator at a place drawn every 40 steps
    float slot = floor(stateFrame / 40.0);
    vec2 at = vec2(hash11(slot * 2.9 + 0.3), hash11(slot * 5.3 + 0.7)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 40.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6) u2 += 1.5 * exp(-dot(d, d) / 20.0);
    u2 = clamp(u2, 0.0, 12.0);
    v2 = clamp(v2, 0.0, 12.0);
    return vec4(u2, v2, mix(c.b, u2, 0.2), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.55);
    vec4 s = stLin(cc);
    float lit = smoothstep(0.8, 3.8, s.b);
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).b - stLin(cc - vec2(1.0, 0.0)).b,
                  stLin(cc + vec2(0.0, 1.0)).b - stLin(cc - vec2(0.0, 1.0)).b);
    // a lit spot magnifies the photo beneath it (the coordinate pulled toward the spot's centre)
    vec2 uv = p * 0.7 + 0.5 - g * (0.004 + 0.012 * clamp(lensP, 0.0, 1.0)) + 0.005 * sceneTime * vec2(1.0, 0.5);
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(0.2 + 0.4 * lit + 0.03 * audioPhase);
    vec3 col = photo * (0.25 + 0.95 * lit) + mix(tone, vec3(1.0), 0.4) * lit * lit * 0.35
               * (0.6 + 0.9 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

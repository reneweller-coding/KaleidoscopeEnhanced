//@doc
 * @brief BISTABLE LABYRINTHS: a bistable FitzHugh-Nagumo medium with a fast-diffusing inhibitor (the Lee-Swinney
 * labyrinths): fronts between the two states bend, finger and fold into a labyrinth that slowly rebuilds itself --
 * corridors pinch off into spots, spots stretch into worms.  The two states are two cuts of the photo, the fronts
 * between them a bright seam.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioLevel      -> the balance a0 between the two states: loud passages tip the labyrinth toward spots of
 *                      one state, quiet ones toward the other (the field reshapes)
 *   audioOnset      -> a front kicked into a patch: new fingers grow from it (structure)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the seams flash (light)
 *
 * Knobs: balanceP (the base balance), widthP (corridor width), scaleP (the pattern on screen), hueP.
//@params balanceP widthP scaleP
//@audio audioKick audioOnset
//@state 320 180 600
//@body
/**  One explicit FitzHugh-Nagumo step for this cell (the state pass): u_t = u - u^3 - v + lap u,
 * v_t = eps (u - a1 v - a0) + delta lap v.
 *
 * @return
 *   u, v, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(fbm(vec2(ip) * 0.06) * 2.0 - 1.0 + 0.3 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    vec2 lap = stLap(ip).rg;
    float sc = 0.6 + 0.8 * clamp(widthP, 0.0, 1.0);
    float a0 = (clamp(balanceP, 0.0, 1.0) - 0.5) * 0.16 + 0.1 * (clamp(audioLevel, 0.0, 1.0) - 0.5);
    float eps = 0.04, a1 = 2.0, delta = 4.0, dt = 0.04;     // stable while 8 delta sc dt < 2
    float u = c.r, v = c.g;
    float u2 = u + dt * (u - u * u * u - v + sc * lap.x);
    float v2 = v + dt * (eps * (u - a1 * v - a0) + delta * sc * lap.y);
    // an onset kicks a patch at a place drawn every 30 steps into the other state
    float slot = floor(stateFrame / 30.0);
    vec2 at = vec2(hash11(slot * 2.2 + 0.4), hash11(slot * 3.6 + 0.2)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 30.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 7.0) u2 = -u2;
    return vec4(clamp(u2, -2.0, 2.0), clamp(v2, -2.0, 2.0), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.4 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    float u = stLin(cc).r;
    vec2 uv = p * 0.7 + 0.5 + 0.004 * sceneTime * vec2(0.6, 1.0);
    vec3 a = imgLod(uv, 0.6), b = imgLod(vec2(1.0 - uv.x, uv.y) * 1.15 + 0.2, 0.6);
    vec3 tA = imgPalette(0.05 + 0.03 * audioPhase), tB = imgPalette(0.55 + 0.03 * audioPhase);
    float w = smoothstep(-0.3, 0.3, u);
    vec3 col = mix(mix(b, b * tB * 1.7, 0.35) * 0.55, mix(a, a * tA * 1.7, 0.3) * 1.05, w);
    float seam = exp(-u * u * 10.0);
    col += mix(mix(tA, tB, 0.5), vec3(1.0), 0.5) * seam * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

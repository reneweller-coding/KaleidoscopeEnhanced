//@doc
 * @brief SWIFT-HOHENBERG MORPH: the Swift-Hohenberg equation, u_t = r u - (1 + lap)^2 u + g u^2 - u^3, the
 * archetype of pattern formation -- stripes (rolls) when g is small, hexagons when it is large, with defects that
 * creep, dislocations that climb and grain boundaries between both.  A slow wave of the control parameter sweeps the
 * field, so the pattern swells and fades in bands.  The pattern is pressed into glass: the photo behind it is
 * refracted by every roll and cell, and lit from above.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the control parameter r: loud passages deepen the pattern, quiet ones let it melt toward rolls
 *   audioMode       -> the symmetry-breaking g: major leans to hexagons, minor to rolls (the field reorganises)
 *   audioHarmChange -> a gentle disturbance (new defects)
 *   audioPhase      -> the light turns (integrated)
 *   audioKick       -> the crests flash (light)
 *
 * Knobs: hexP (the base of g: rolls or hexagons), scaleP (the pattern's size on screen), glassP (how strongly the
 * glass refracts), hueP.
//@params hexP scaleP glassP
//@audio audioSwell audioKick audioMode audioHarmChange
//@state 320 180 900
//@body
/**  One explicit Euler step of the Swift-Hohenberg equation for this cell (the state pass).  Cells are 0.75 apart
 * (8.4 cells a wavelength); the biharmonic is the 13-point stencil.
 *
 * @return
 *   u, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.2 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    float h2 = 0.5625, h4 = h2 * h2, dt = 0.01;
    float u = stAt(ip).r;
    float s4 = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r;
    float sd = stAt(ip + ivec2(1, 1)).r + stAt(ip - ivec2(1, 1)).r + stAt(ip + ivec2(1, -1)).r + stAt(ip + ivec2(-1, 1)).r;
    float sf = stAt(ip + ivec2(2, 0)).r + stAt(ip - ivec2(2, 0)).r + stAt(ip + ivec2(0, 2)).r + stAt(ip - ivec2(0, 2)).r;
    float lap = (s4 - 4.0 * u) / h2;
    float bih = (20.0 * u - 8.0 * s4 + 2.0 * sd + sf) / h4;
    // the control parameter: the music's swell, and a slow wave sweeping the field
    vec2 q = vec2(ip) / stateRes;
    float wave = 0.12 * sin(6.2831853 * (q.x + 0.5 * q.y) - 0.07 * sceneTime);
    float r = 0.08 + 0.35 * clamp(audioSwell, 0.0, 1.0) + wave;
    float g = 0.3 + 1.2 * clamp(hexP, 0.0, 1.0) * (0.5 + 0.5 * smoothstep(0.3, 0.7, audioMode));
    float du = r * u - (u + 2.0 * lap + bih) + g * u * u - u * u * u;
    float u2 = u + dt * du;
    // a change of harmony: a gentle disturbance, once per 60 steps at most
    if (mod(stateFrame, 60.0) < 1.0 && clamp(audioHarmChange, 0.0, 1.0) > 0.5) u2 += 0.15 * (stRand(1) - 0.5);
    return vec4(clamp(u2, -2.0, 2.0), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.45 + 0.4 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p + 0.02 * vec2(sin(0.023 * sceneTime), cos(0.019 * sceneTime)), zoom);
    float u = stLin(cc).r;
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).r - stLin(cc - vec2(1.0, 0.0)).r,
                  stLin(cc + vec2(0.0, 1.0)).r - stLin(cc - vec2(0.0, 1.0)).r) * 0.5;
    vec3 n = normalize(vec3(-g * 2.5, 1.0));
    vec2 uv = p * 0.75 + 0.5 + g * (0.03 + 0.1 * clamp(glassP, 0.0, 1.0));   // the photo refracted by the glass
    vec3 photo = imgLod(uv + 0.01 * sceneTime * vec2(1.0, 0.4), 0.5);
    float la = 0.4 * audioPhase + 0.05 * sceneTime;
    vec3 l = normalize(vec3(cos(la), sin(la), 1.4));
    float diff = 0.55 + 0.45 * dot(n, l);
    float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    vec3 tint = imgPalette(0.25 + 0.15 * u + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tint * 1.6, 0.25) * diff * (0.75 + 0.35 * u);
    col += mix(tint, vec3(1.0), 0.6) * spec * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

//@doc
 * @brief GINZBURG-LANDAU DEFECTS: defect turbulence of the complex Ginzburg-Landau equation, A_t = A + (1 + i a) lap A
 * - (1 + i b) |A|^2 A, past the Benjamin-Feir line: spiral cores are born in pairs, wander, and annihilate, and
 * between them the phase rolls in shock lines.  The phase is a local kaleidoscope angle: around every core the photo
 * turns once, so the picture is full of little whirlpools of itself; the cores themselves are dark.  An endless,
 * periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness  -> the dispersion a: rough music, wilder turbulence and smaller spirals
 *   audioPhase      -> the phase turns as a whole: every whirlpool turns the photo with the music (integrated)
 *   audioOnset      -> a kick of noise into a patch: new pairs of cores (structure)
 *   audioKick       -> the shock lines flash (light)
 *
 * Knobs: dispP (the base dispersion), twistP (how far the photo turns around a core), scaleP (cell size), hueP.
//@params dispP twistP scaleP
//@audio audioKick audioOnset audioRoughness
//@state 320 180 150
//@body
/**  One explicit step of the complex Ginzburg-Landau equation for this cell (the state pass).
 *
 * @return
 *   Re A, Im A, |A|, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.1 * (stRand(0) - 0.5), 0.1 * (stRand(1) - 0.5), 0.0, 1.0);
    float dt = 0.04;                                           // stable while (1 + alpha^2) dt < 0.5
    vec2 a = stAt(ip).rg;
    vec2 lap = stLap9(ip).rg;
    float alpha = 1.2 + 1.0 * clamp(dispP, 0.0, 1.0) + 0.7 * clamp(audioRoughness, 0.0, 1.0);
    float beta = -0.9;
    float m2 = dot(a, a);
    // (1 + i alpha) lap A  and  (1 + i beta) |A|^2 A
    vec2 dl = vec2(lap.x - alpha * lap.y, lap.y + alpha * lap.x);
    vec2 dn = m2 * vec2(a.x - beta * a.y, a.y + beta * a.x);
    vec2 a2 = a + dt * (a + dl - dn);
    // onsets: noise into a patch that wanders every 25 steps (new pairs of cores)
    float slot = floor(stateFrame / 25.0);
    vec2 at = vec2(hash11(slot * 2.71 + 0.3), hash11(slot * 6.37 + 0.1)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 25.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 6.0)
        a2 = 0.3 * vec2(stRand(2) - 0.5, stRand(3) - 0.5);
    return vec4(a2, length(a2), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.45 + 0.4 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    float ph = atan(s.g, s.r) + audioPhase * 0.3;
    float mag = clamp(length(s.rg), 0.0, 1.2);
    // the phase as a local kaleidoscope angle: the photo turns once around every core
    float tw = 0.04 + 0.1 * clamp(twistP, 0.0, 1.0);
    vec2 base = p * 0.7 + 0.5 + 0.008 * sceneTime * vec2(1.0, 0.5);
    vec3 photo = imgLod(base + tw * vec2(cos(ph), sin(ph)), 0.6);
    // shock lines: where the phase changes fastest
    vec2 sx = stLin(cc + vec2(1.0, 0.0)).rg, sy = stLin(cc + vec2(0.0, 1.0)).rg;
    float grad = length(vec2(atan(sx.y * s.x - sx.x * s.y, dot(sx, s.rg)), atan(sy.y * s.x - sy.x * s.y, dot(sy, s.rg))));
    vec3 tone = imgPalette(ph / 6.2831853 + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tone * 1.8, 0.3) * smoothstep(0.05, 0.75, mag);
    col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.5, 1.2, grad) * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

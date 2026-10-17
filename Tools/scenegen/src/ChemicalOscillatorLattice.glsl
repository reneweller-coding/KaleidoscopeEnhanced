//@doc
 * @brief CHEMICAL OSCILLATOR LATTICE: a field of chemical oscillators coupled to their neighbourhood (nonlocal
 * Kuramoto with a phase lag) -- phase waves run across it, spirals turn, and around their cores the order breaks
 * into a turbulent disc while the arms stay coherent: spiral chimeras, islands of order next to islands of chaos.
 * The phase shifts the photo: every oscillator reads the photo a little further along its cycle.  An endless,
 * periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the coupling strength: loud music orders the field, quiet music lets it fall apart
 *   audioChroma     -> the natural frequencies: every cell's pitch class sets how fast it wants to turn
 *   audioOnset      -> a new spiral seeded at a wandering place (structure)
 *   audioPhase      -> the palette turns (integrated)
 *   audioKick       -> the incoherent cores flash (light)
 *
 * Knobs: lagP (the phase lag: waves .. chimeras), reachP (the coupling radius), shiftP (how far the photo moves
 * along the cycle), hueP.
//@params lagP reachP shiftP
//@audio audioSwell audioKick audioOnset audioChroma[12]
//@state 320 180 120
//@body
/**  One step of nonlocal Kuramoto coupling for this cell (the state pass): the mean field is sampled on two rings
 * around the cell; the phase is kept as (cos, sin).
 *
 * @return
 *   cos theta, sin theta, local order 0..1, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    vec2 x = vec2(ip);
    if (stateFrame < 0.5) {
        // a few spiral seeds: the phase winds once around each
        float th = 0.0;
        for (int i = 0; i < 4; ++i) {
            vec2 at = vec2(hash11(float(i) * 2.9 + 0.1), hash11(float(i) * 4.3 + 0.5)) * stateRes;
            vec2 d = x - at;
            d -= stateRes * floor(d / stateRes + 0.5);
            th += (mod(float(i), 2.0) < 0.5 ? 1.0 : -1.0) * atan(d.y, d.x);
        }
        return vec4(cos(th), sin(th), 1.0, 1.0);
    }
    vec4 c = stAt(ip);
    float R = 3.0 + 6.0 * clamp(reachP, 0.0, 1.0);
    vec2 z = vec2(0.0);
    for (int i = 0; i < 16; ++i) {
        float a = 6.2831853 * (float(i) + 0.5) / 16.0;
        z += stLin(x + 0.5 + R * vec2(cos(a), sin(a))).rg;
        z += stLin(x + 0.5 + 0.5 * R * vec2(cos(a + 0.2), sin(a + 0.2))).rg;
    }
    z /= 32.0;
    float lag = 1.0 + 0.5 * clamp(lagP, 0.0, 1.0);             // 1.4 or so gives chimeras
    float th = atan(c.g, c.r);
    float K = 0.6 + 1.4 * clamp(audioSwell, 0.0, 1.0);
    // sum sin(theta_j - theta_i - lag) = Im(z e^{-i (theta + lag)})
    float ph = th + lag;
    float coup = z.y * cos(ph) - z.x * sin(ph);
    int pc = int(mod(floor(hash21(floor(x / 6.0)) * 12.0), 12.0));
    float omega = 0.15 + 0.25 * clamp(audioChroma[pc], 0.0, 1.0);
    float dt = 0.1;
    float th2 = th + dt * (omega + K * coup);
    // an onset seeds a spiral at a place drawn every 60 steps
    float slot = floor(stateFrame / 60.0);
    vec2 at = vec2(hash11(slot * 1.9 + 0.3), hash11(slot * 6.1 + 0.8)) * stateRes;
    vec2 d = x - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 60.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 12.0) th2 = atan(d.y, d.x);
    return vec4(cos(th2), sin(th2), length(z), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.6);
    vec4 s = stLin(cc);
    float th = atan(s.g, s.r);
    float order = clamp(s.b, 0.0, 1.0);
    // the photo read a little further along the cycle: the waves slide the picture back and forth
    float sh = 0.02 + 0.06 * clamp(shiftP, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + sh * vec2(cos(th), sin(th)) + 0.004 * sceneTime * vec2(1.0, 0.3);
    vec3 photo = imgLod(uv, 0.6);
    vec3 tone = imgPalette(th / 6.2831853 + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tone * 1.8, 0.35) * (0.45 + 0.55 * (0.5 + 0.5 * cos(th)));
    col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.7, 0.2, order) * (0.15 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

//@doc
 * @brief QUANTUM WALK CONES: a discrete-time quantum walk on the grid -- a two-state coin is turned at every cell,
 * then each half of the amplitude steps left or right (and on the next step up or down).  From a few points the
 * probability spreads not as a blur but in sharp, interfering cones, rings of fronts with fringes inside; when the
 * fronts meet across the torus they weave a quantum carpet.  New sources are set in from time to time while the old
 * pattern fades.  The probability lays bare the photo; the phase colours it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMode       -> the coin's angle (major and minor walk differently: wider or narrower cones)
 *   audioPhase      -> the coin's phase turns (integrated): the fringes slide
 *   audioOnset      -> new sources (structure)
 *   audioKick       -> the fronts flash (light)
 *
 * Knobs: coinP (the coin's base angle), sourcesP (how many sources), scaleP (cell size), hueP.
//@params coinP sourcesP scaleP
//@audio audioOnset audioKick audioMode
//@state 400 225 60
//@body
/**  One walk step for this cell (the state pass): the coin acts on the neighbour's two amplitudes, then the first
 * half arrives from the left (or below), the second from the right (or above).
 *
 * @return
 *   The two coin states' complex amplitudes (re, im, re, im).
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.0);
    bool xs = mod(stateFrame, 2.0) < 1.0;
    ivec2 e = xs ? ivec2(1, 0) : ivec2(0, 1);
    float th = 0.785398 + (clamp(coinP, 0.0, 1.0) - 0.5) * 0.9 + (audioMode > 0.5 ? 0.12 : -0.12);
    float ph = 0.05 * audioPhase;
    float ct = cos(th), sn = sin(th);
    vec2 rot = vec2(cos(ph), sin(ph));
    // the coin [[c, s], [s, -c]] with a phase on the second state, applied where the amplitude comes from
    vec4 a = stAt(ip - e);                                      // its first half moves on toward +e
    vec4 b = stAt(ip + e);                                      // its second half moves on toward -e
    vec2 up = ct * a.xy + sn * a.zw;
    vec2 dn = sn * b.xy - ct * b.zw;
    dn = vec2(dn.x * rot.x - dn.y * rot.y, dn.x * rot.y + dn.y * rot.x);
    vec4 psi = vec4(up, dn) * 0.9985;                           // the old pattern fades, slowly
    // sources: every 240 steps (and on onsets, every 40) a few points start a new walk
    float every = clamp(audioOnset, 0.0, 1.0) > 0.6 ? 40.0 : 240.0;
    if (mod(stateFrame, every) < 1.0 || stateFrame < 1.5) {
        float k = floor(stateFrame / 40.0);
        int count = 1 + int(4.0 * clamp(sourcesP, 0.0, 1.0));
        for (int i = 0; i < 5; ++i) {
            if (i >= count) break;
            ivec2 at = ivec2(vec2(hash11(k * 3.1 + float(i) * 7.3), hash11(k * 5.7 + float(i) * 2.9)) * stateRes);
            if (ip == at) psi += vec4(0.7071, 0.0, 0.0, 0.7071) * 6.0;
        }
    }
    return psi;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.55 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    // the probability over the 2 x 2 cells around the pixel (the walk fills one sublattice per step)
    ivec2 b = ivec2(floor(cc - 0.5));
    float prob = 0.0;
    vec2 amp = vec2(0.0);
    for (int i = 0; i < 4; ++i) {
        vec4 t = texelFetch(texState, stWrap(b + ivec2(i & 1, i >> 1)), 0);
        prob += dot(t, t);
        amp += t.xy + t.zw;
    }
    // logarithmic: the bright young fronts and the faint carpet they leave both read
    float lit = smoothstep(-4.8, -1.2, log(max(prob, 1e-9)) / 2.302585);
    float phase = atan(amp.y, amp.x) / 6.2831853;
    vec2 uv = cc / stateRes.y * 0.6;
    vec3 photo = imgLod(uv, 0.8);
    vec3 tone = imgPalette(phase + 0.03 * audioPhase);
    vec3 col = photo * 0.06 + mix(photo, tone, 0.5) * lit * 1.1;
    col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.85, 1.0, lit) * 0.4 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

//@doc
 * @brief MARGOLUS BILLIARD GAS: a reversible block automaton -- a gas of balls on the Margolus neighbourhood, flying
 * diagonally and bouncing off each other, every ball keeping its colour.  It starts as the photo: the light parts
 * one gas, the dark ones the other.  The gas mixes into a seething grey; then time runs backward, step for step,
 * and the picture un-mixes exactly until it stands again -- and the cycle begins anew.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> how far the two gases are shown apart (the colours separate toward the phrase's end)
 *   audioSwell      -> how much each gas shows its own cut of the photo
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the balls flash (light)
 *
 * Knobs: densityP (how many balls), spanP (how long one way of the cycle runs), scaleP (cell size), hueP.
//@params densityP spanP scaleP
//@audio audioSwell audioKick audioPhrasePos
//@state 320 180 60
//@body
/**  The steps of one way of the cycle (forward, then the same number backward).
 *
 * @return
 *   Steps one way.
 **/
float spanSteps() { return floor(180.0 + 300.0 * clamp(spanP, 0.0, 1.0)); }

/**  One step of the reversible gas for this cell (the state pass).  Forward step t uses the partition t mod 2;
 * backward, the same block map (an involution) is applied with the partitions in reverse order.
 *
 * @return
 *   Ball (0 or 1), its gas (0 or 1), ball of gas A, ball of gas B.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        vec2 uv = vec2(ip) / stateRes.y * 0.62;
        float l = luma(imgLod(uv, 3.0)), mean = luma(imgLod(vec2(0.5), 9.0));
        float ball = stRand(0) < 0.3 + 0.3 * clamp(densityP, 0.0, 1.0) ? 1.0 : 0.0;
        float gas = l > mean ? 1.0 : 0.0;                       // the light half of the photo one gas, the dark the other
        return vec4(ball, gas, ball * gas, ball * (1.0 - gas));
    }
    float n = spanSteps();
    float q = mod(stateFrame - 1.0, 2.0 * n);
    float par = q < n ? mod(q + 1.0, 2.0) : mod(2.0 * n - q, 2.0);
    int o = int(par);
    // the block: cells with offset o, local position (i, j)
    ivec2 lp = ip - ivec2(o);
    ivec2 b0 = ivec2(floor(vec2(lp) / 2.0)) * 2 + ivec2(o);
    ivec2 ij = ip - b0;
    vec4 tl = stAt(b0 + ivec2(0, 1)), tr = stAt(b0 + ivec2(1, 1)), bl = stAt(b0), br = stAt(b0 + ivec2(1, 0));
    float cnt = tl.r + tr.r + bl.r + br.r;
    bool diagA = cnt > 1.5 && cnt < 2.5 && tl.r > 0.5 && br.r > 0.5;
    bool diagB = cnt > 1.5 && cnt < 2.5 && tr.r > 0.5 && bl.r > 0.5;
    // collision of two balls head-on: mirrored left-right; otherwise every ball crosses to the opposite corner
    ivec2 src = (diagA || diagB) ? ivec2(1 - ij.x, ij.y) : ivec2(1 - ij.x, 1 - ij.y);
    vec4 s = stAt(b0 + src);
    return vec4(s.r, s.g, s.r * s.g, s.r * (1.0 - s.g));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.6 + 0.4 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    // the gases' local density: nine taps of the filtered field
    vec2 dens = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) dens += stLin(cc + vec2(dx, dy) * 1.3).ba;
    dens /= 9.0;
    vec4 c = stLin(cc);
    vec2 uv = cc / stateRes.y * 0.62;
    float apart = 0.35 + 0.65 * smoothstep(0.4, 1.0, audioPhrasePos);
    vec3 photo = imgLod(uv, 1.0);
    vec3 own = imgLod(uv * 1.3 + vec2(0.4, 0.2), 1.0);
    float cut = 0.3 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 tA = imgPalette(0.1 + 0.03 * audioPhase), tB = imgPalette(0.6 + 0.03 * audioPhase);
    vec3 gasA = mix(photo * 1.6 + 0.15, tA * 1.4, 0.35 * apart);              // light, warm
    vec3 gasB = mix(mix(photo, own, cut) * 0.25, tB * 0.5, 0.5 * apart);       // dark, the other tone
    float tot = max(dens.x + dens.y, 1e-3);
    vec3 col = mix(gasB, gasA, dens.x / tot) * (0.35 + 1.3 * tot);
    col += mix(gasA, vec3(1.0), 0.5) * c.b * 0.25 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

//@doc
 * @brief ISING CRITICAL FIELD: the two-dimensional Ising model by Metropolis dynamics on a checkerboard -- near the
 * critical temperature the spins form domains on every scale at once, fractal islands within islands that boil and
 * drift; above it they dissolve into fine grain, below it they coarsen into a few large continents.  The two spin
 * directions show two cuts of the photo; the domain walls are a soft seam.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioArousal    -> the temperature: calm music below the critical point (continents), excited music above it
 *                      (boiling grain) -- the field changes its whole texture
 *   audioOnset      -> a domain flipped at a wandering place (structure)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the walls flash (light)
 *
 * Knobs: tempP (the base temperature around the critical point), scaleP (spin size), hueP.
//@params tempP scaleP
//@audio audioKick audioOnset audioArousal
//@state 480 270 120
//@body
/**  One Metropolis half-sweep for this cell (the state pass): the cells of one checkerboard colour try a flip.
 *
 * @return
 *   Spin (-1 or 1), spin smoothed over a few steps, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {                                 // large domains to start from, a little salt in them
        float s = fbm(vec2(ip) * 0.03) + 0.25 * (stRand(0) - 0.5) > 0.5 ? 1.0 : -1.0;
        return vec4(s, s, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    float s = c.r;
    float s2 = s;
    if (int(mod(float(ip.x + ip.y) + stateFrame, 2.0)) == 0) {
        float nb = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r;
        float T = 2.269 * (0.8 + 0.35 * clamp(tempP, 0.0, 1.0) + 0.3 * (clamp(audioArousal, 0.0, 1.0) - 0.5));
        float dE = 2.0 * s * nb;
        if (dE <= 0.0 || stRand(1) < exp(-dE / T)) s2 = -s;
    }
    // an onset flips a disc at a place drawn every 30 steps
    float slot = floor(stateFrame / 30.0);
    vec2 at = vec2(hash11(slot * 4.1 + 0.5), hash11(slot * 2.3 + 0.9)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 30.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 9.0) s2 = -s2;
    return vec4(s2, mix(c.g, s2, 0.35), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.4 + 0.5 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    float m = stLin(cc).g;
    // a little blur on top of the filtering: the spins read as domains, not as pixels
    m = 0.4 * m + 0.15 * (stLin(cc + vec2(1.2, 0.0)).g + stLin(cc - vec2(1.2, 0.0)).g + stLin(cc + vec2(0.0, 1.2)).g
                         + stLin(cc - vec2(0.0, 1.2)).g);
    vec2 uv = p * 0.7 + 0.5 + 0.004 * sceneTime * vec2(1.0, -0.5);
    vec3 up = imgLod(uv, 0.7);
    vec3 dn = imgLod(vec2(uv.y, 1.0 - uv.x) * 1.2 + 0.2, 0.7);
    vec3 tU = imgPalette(0.15 + 0.03 * audioPhase), tD = imgPalette(0.65 + 0.03 * audioPhase);
    float w = smoothstep(-0.6, 0.6, m);
    vec3 col = mix(mix(dn, dn * tD * 1.7, 0.35) * 0.6, mix(up, up * tU * 1.7, 0.35) * 1.1, w);
    float wall = 1.0 - abs(m);
    col += mix(mix(tU, tD, 0.5), vec3(1.0), 0.5) * wall * wall * (0.12 + 0.35 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

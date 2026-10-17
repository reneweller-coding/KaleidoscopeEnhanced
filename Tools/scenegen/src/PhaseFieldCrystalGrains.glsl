//@doc
 * @brief PHASE-FIELD CRYSTAL GRAINS: a crystal of round atoms grown from seeds in a melt -- the hexagonal phase of a
 * Swift-Hohenberg equation, so every seed grows a grain in its own orientation, and where grains meet, grain
 * boundaries and dislocations remain.  A slow band of heat sweeps the field and melts it; behind the band the
 * neighbouring grains grow back in.  Each atom is a small lens on the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmChange -> a new seed, turned against its neighbours, grows a grain of its own (structure)
 *   audioSwell      -> the undercooling: loud passages grow the crystal faster and sharper
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the atoms flash (light)
 *
 * Knobs: seedsP (how many seeds at the start), meltP (how often the heat band passes), lensP (atom lens strength),
 * hueP.
//@params seedsP meltP lensP
//@audio audioSwell audioKick audioHarmChange
//@state 320 180 900
//@body
/**  A hexagonal crystal's density at a point, turned by an angle (the seed of a grain).
 *
 * @param x  The point in cells. (in)
 * @param a  The crystal's orientation. (in)
 *
 * @return
 *   The density, about -0.5..1.
 **/
float hexAt(vec2 x, float a)
{
    float k = 6.2831853 / 8.4;                                  // the pattern's wavelength in cells (0.75 apart)
    float s = 0.0;
    for (int i = 0; i < 3; ++i) {
        float b = a + 2.0944 * float(i);
        s += cos(k * dot(x, vec2(cos(b), sin(b))));
    }
    return s / 3.0;
}

/**  One explicit Swift-Hohenberg step (hexagonal phase) for this cell, with seeds and the heat band (the state pass).
 *
 * @return
 *   u, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    vec2 x = vec2(ip);
    if (stateFrame < 0.5) {
        float u0 = 0.0;
        int n = 3 + int(5.0 * clamp(seedsP, 0.0, 1.0));
        for (int i = 0; i < 8; ++i) {
            if (i >= n) break;
            vec2 at = vec2(hash11(float(i) * 3.7 + 0.2), hash11(float(i) * 5.3 + 0.6)) * stateRes;
            vec2 d = x - at;
            d -= stateRes * floor(d / stateRes + 0.5);
            if (length(d) < 10.0) u0 = 0.6 * hexAt(d, 6.2831853 * hash11(float(i) * 1.9));
        }
        return vec4(u0, 0.0, 0.0, 1.0);
    }
    float h2 = 0.5625, h4 = h2 * h2, dt = 0.01;
    float u = stAt(ip).r;
    float s4 = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r;
    float sd = stAt(ip + ivec2(1, 1)).r + stAt(ip - ivec2(1, 1)).r + stAt(ip + ivec2(1, -1)).r + stAt(ip + ivec2(-1, 1)).r;
    float sf = stAt(ip + ivec2(2, 0)).r + stAt(ip - ivec2(2, 0)).r + stAt(ip + ivec2(0, 2)).r + stAt(ip - ivec2(0, 2)).r;
    float lap = (s4 - 4.0 * u) / h2;
    float bih = (20.0 * u - 8.0 * s4 + 2.0 * sd + sf) / h4;
    // undercooling, and the heat band: a slow stripe in which r drops below the hexagons' existence
    float r = 0.03 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    float period = 60.0 - 40.0 * clamp(meltP, 0.0, 1.0);
    float bx = fract(sceneTime / period) * (stateRes.x + 60.0) - 30.0;
    float dx = x.x + 0.3 * x.y - bx;
    dx -= stateRes.x * floor(dx / stateRes.x + 0.5);
    r -= 0.5 * exp(-dx * dx / 120.0);
    float g = 1.0;
    float du = r * u - (u + 2.0 * lap + bih) + g * u * u - u * u * u;
    float u2 = u + dt * du;
    // a change of harmony: a new seed, turned at random, at a place drawn every 300 steps
    float slot = floor(stateFrame / 300.0);
    vec2 at = vec2(hash11(slot * 2.3 + 0.1), hash11(slot * 4.9 + 0.5)) * stateRes;
    vec2 d = x - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 300.0) < 1.0 && clamp(audioHarmChange, 0.0, 1.0) > 0.5 && length(d) < 9.0)
        u2 = 0.6 * hexAt(d, 6.2831853 * hash11(slot * 0.77));
    return vec4(clamp(u2, -2.0, 2.0), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.5);
    float u = stLin(cc).r;
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).r - stLin(cc - vec2(1.0, 0.0)).r,
                  stLin(cc + vec2(0.0, 1.0)).r - stLin(cc - vec2(0.0, 1.0)).r) * 0.5;
    // every atom a small lens: the photo pulled toward the atom's centre, the atom's rim lit
    vec2 uv = p * 0.7 + 0.5 - g * (0.01 + 0.04 * clamp(lensP, 0.0, 1.0)) + 0.004 * sceneTime * vec2(1.0, 0.5);
    vec3 photo = imgLod(uv, 0.4);
    float atom = smoothstep(0.05, 0.6, u);
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 n = normalize(vec3(-g * 3.0, 1.0));
    float l = max(dot(n, normalize(vec3(-0.5, 0.6, 0.9))), 0.0);
    vec3 col = photo * (0.3 + 0.9 * atom) * (0.6 + 0.5 * l);
    col += mix(tone, vec3(1.0), 0.5) * atom * pow(l, 8.0) * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
    col += photo * 0.08 * (1.0 - atom);                         // the melt between the grains
    finish(col);
}

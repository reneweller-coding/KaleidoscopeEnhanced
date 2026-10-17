//@doc
 * @brief SNOWFLAKE FIELD GROWTH: a field of snow crystals growing until they touch -- Gravner and Griffeath's snowflake
 * model on a hexagonal lattice: vapour diffuses, freezes onto the crystals' boundary, and a boundary cell attaches
 * when enough has gathered there (sooner where more crystal surrounds it), so plates, branches, sectored stars and
 * ferny dendrites grow from scattered seeds.  The more humid the air (the music swelling), the more vapour feeds
 * them; old crystal sublimes away from the middle, leaving room for new seeds.  The photo shines through the ice.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the humidity: more vapour, faster and ferny growth
 *   audioKick       -> the growing edges glint (light)
 *
 * Knobs: branchP (beta: how readily tips attach -- low gives plates, high gives ferns), ageP (how long ice lasts),
 * photoP (photo share), hueP.
//@params branchP ageP photoP
//@audio audioSwell audioKick
//@state 240 136 40
//@body
/**  The hexagonal neighbour k (0..5) of a cell in offset coordinates (odd rows shifted half a cell right).
 *
 * @param ip  The cell. (in)
 * @param k   The neighbour. (in)
 *
 * @return
 *   The neighbour's cell.
 **/
ivec2 hexN(ivec2 ip, int k)
{
    int odd = ip.y & 1;
    if (k == 0) return ip + ivec2(1, 0);
    if (k == 1) return ip + ivec2(-1, 0);
    if (k == 2) return ip + ivec2(odd, 1);
    if (k == 3) return ip + ivec2(odd - 1, 1);
    if (k == 4) return ip + ivec2(odd, -1);
    return ip + ivec2(odd - 1, -1);
}

/**  One step of the Gravner-Griffeath model (the state pass): diffusion, freezing, attachment, melting, sublimation.
 *
 * @return
 *   Attached (r), boundary mass or, attached, the ice's age (g), crystal mass (b), diffusive mass (a).
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float rho = 0.42 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    if (stateFrame < 0.5) {
        bool seed = stRand(0) < 0.0006;
        return seed ? vec4(1.0, 0.0, 1.0, 0.0) : vec4(0.0, 0.0, 0.0, rho);
    }
    vec4 s = stAt(ip);
    float beta = 1.2 + 1.2 * clamp(branchP, 0.0, 1.0), alpha = 0.08, theta = 0.025, kappa = 0.01, mu = 0.06, gam = 0.0001;
    if (s.r > 0.5) {
        // ice: it ages, and old ice sublimes back into vapour
        float age = s.g + 1.0 / 40.0;
        float life = 40.0 + 60.0 * clamp(ageP, 0.0, 1.0);
        if (age > life * (0.8 + 0.4 * stRand(1))) return vec4(0.0, 0.0, 0.0, rho * 0.5 + s.b * 0.2);
        return vec4(1.0, age, s.b, 0.0);
    }
    float nA = 0.0, dSum = s.a;
    for (int k = 0; k < 6; ++k) {
        vec4 n = stAt(hexN(ip, k));
        nA += n.r;
        dSum += n.r > 0.5 ? s.a : n.a;                          // attached neighbours reflect the vapour
    }
    float d = dSum / 7.0;                                       // diffusion
    float b = s.g, c = s.b;
    if (nA > 0.5) {
        b += (1.0 - kappa) * d; c += kappa * d; d = 0.0;        // freezing on the boundary
        bool attach = (nA < 2.5 && b >= beta) || (nA > 2.5 && nA < 3.5 && (b >= 1.0 || (b >= alpha && d < theta))) || nA > 3.5;
        if (attach) return vec4(1.0, 0.0, b + c, 0.0);
        d += mu * b + gam * c; b *= 1.0 - mu; c *= 1.0 - gam;   // melting
    } else {
        d = mix(d, rho, 0.002);                                 // the air far off keeps its humidity
        if (stRand(2) < 0.0000015) return vec4(1.0, 0.0, 1.0, 0.0);   // a new seed now and then
    }
    return vec4(0.0, b, c, d);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    // the screen in lattice units; rows are 0.866 apart, odd rows shifted half a cell
    vec2 g = vec2((p.x + 0.8888889) * stateRes.y * 0.866, (p.y + 0.5) * stateRes.y);   // a cell is 1/0.866 of a row wide
    float rowF = floor(g.y);
    vec3 tone = imgPalette(0.55 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.35 + 0.5, 4.0) * 0.15 + tone * 0.04;
    float ice = 0.0, mass = 0.0, edge = 0.0, wsum = 0.0;
    for (int j = 0; j <= 1; ++j) {
        float row = rowF + float(j);
        float odd = mod(row, 2.0);
        float xc = floor(g.x - 0.5 * odd + 0.5);
        for (int i = -1; i <= 1; ++i) {
            vec2 cpos = vec2(xc + float(i) + 0.5 * odd, row);
            float dd = length((g - cpos) * vec2(1.0, 0.866));
            float w = max(1.0 - dd, 0.0);
            vec4 s = texelFetch(texState, stWrap(ivec2(int(xc) + i, int(row))), 0);
            ice += w * s.r; mass += w * s.b; edge += w * (s.r < 0.5 ? s.g : 0.0); wsum += w;
        }
    }
    ice /= max(wsum, 1e-4); mass /= max(wsum, 1e-4); edge /= max(wsum, 1e-4);
    float shown = smoothstep(0.35, 0.65, ice);
    vec3 photo = imgLod(p * 0.5 + 0.5, 0.6);
    vec3 icec = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.7 + 0.25 * clamp(mass, 0.0, 2.0));
    icec = mix(icec, vec3(0.9, 0.95, 1.0), 0.2);
    col = mix(col, icec, shown);
    col += mix(tone, vec3(1.0), 0.6) * clamp(edge, 0.0, 1.0) * 0.4 * (0.3 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col * 1.1);
}

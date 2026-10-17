//@doc
 * @brief ACTIVE BROWNIAN CLUSTERS: self-propelled particles separating into clusters by their own motion (motility-induced
 * phase separation) -- where they crowd they slow down, where they slow down they crowd, so dense clusters condense
 * out of a running gas.  The crowding is a field on the state pass (Cahn-Hilliard with Oono's long-range term, which
 * keeps the clusters from growing for ever, and noise that breaks them up again); on it run the round particles:
 * in the gas they dash about, in the clusters they sit jammed and only quiver.  The photo colours them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the particles' own motion (integrated: the music's drive)
 *   audioSwell      -> the stirring: loud passages break the clusters up
 *   audioKick       -> the particles flash (light)
 *
 * Knobs: densityP (how many particles), sizeP (the clusters' size), photoP (photo share), hueP.
//@params densityP sizeP photoP
//@audio audioSwell audioKick
//@state 192 108 480
//@body
/**  The local part of the chemical potential, c^3 - c, at a cell.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   c^3 - c.
 **/
float fAt(ivec2 ip) { float c = stAt(ip).r; return c * c * c - c; }

/**  One step of the Cahn-Hilliard-Oono equation with noise (the state pass).
 *
 * @return
 *   c, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float mean = -0.2 + 0.4 * clamp(densityP, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(mean + 0.3 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    float dt = 0.02;
    float c = stAt(ip).r;
    float lapF = fAt(ip + ivec2(1, 0)) + fAt(ip - ivec2(1, 0)) + fAt(ip + ivec2(0, 1)) + fAt(ip - ivec2(0, 1)) - 4.0 * (c * c * c - c);
    float s4 = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r;
    float sd = stAt(ip + ivec2(1, 1)).r + stAt(ip - ivec2(1, 1)).r + stAt(ip + ivec2(1, -1)).r + stAt(ip + ivec2(-1, 1)).r;
    float sf = stAt(ip + ivec2(2, 0)).r + stAt(ip - ivec2(2, 0)).r + stAt(ip + ivec2(0, 2)).r + stAt(ip - ivec2(0, 2)).r;
    float bih = 20.0 * c - 8.0 * s4 + 2.0 * sd + sf;
    float eps = 0.002 + 0.01 * (1.0 - clamp(sizeP, 0.0, 1.0));  // Oono's term: the clusters' size stays finite
    float stir = 0.03 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    float c2 = c + dt * (lapF - bih - eps * (c - mean)) + stir * sqrt(dt) * (stRand(1) - 0.5);
    return vec4(clamp(c2, -1.5, 1.5), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sp = 0.022;                                           // the particles' lattice
    vec2 g = p / sp;
    vec2 cell = floor(g);
    float tw = 0.3 * sceneTime + 1.5 * audioAdvance;
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    for (int j = -2; j <= 2; ++j) for (int i = -2; i <= 2; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 site = (cc + 0.5) * sp;
        float rho = 0.5 + 0.5 * stLin(stView(site, 1.0)).r;    // the crowding there
        vec2 h = hash22(cc);
        float exist = smoothstep(h.x - 0.06, h.x + 0.06, mix(0.08, 0.97, clamp(rho, 0.0, 1.0)));   // fading, never popping
        if (exist < 0.001) continue;
        // its own motion: a heading that turns slowly; it runs far in the gas and only quivers in a cluster
        float th = 6.2831853 * h.y + (h.x - 0.5) * 2.0 * tw;
        float run = (1.6 * (1.0 - clamp(rho, 0.0, 1.0)) + 0.15) * sp;
        vec2 pos = site + run * vec2(cos(th), sin(th)) * sin(tw * (0.7 + h.x) + 6.2831853 * h.y);
        float d = length(p - pos);
        float r = sp * 0.36;
        float dot1 = smoothstep(r, r * 0.45, d) * exist;
        if (dot1 > 0.001) {
            vec3 photo = imgLod(site * 0.45 + 0.5, 1.0);
            vec3 cd = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0))
                      * (0.6 + 0.6 * clamp(rho, 0.0, 1.0)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, cd, dot1);
        }
    }
    finish(col * 1.4);
}

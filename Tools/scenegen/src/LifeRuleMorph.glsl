//@doc
 * @brief LIFE RULE MORPH: Life-like automata whose rule changes with the music -- Anneal's melting domains, Day &
 * Night's islands, Coral's growth, Maze's corridors, Diamoeba's blobs, Stains, Mazectric, Assimilation.  Each rule
 * reshapes what the last one left: corridors melt into blobs, blobs crack into coral.  Living cells show the photo,
 * the dead ones its shadow; the oldest cells take another tone.  An endless, periodic field (a torus).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each new section moves on to the next rule (the field reorganises)
 *   audioPhrasePos  -> at the start of a phrase new seeds of noise are sown (structure)
 *   audioOnset      -> a small seed at a wandering place
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the young cells flash (light)
 *
 * Knobs: ruleP (the first rule), scaleP (cell size), hueP.
//@params ruleP scaleP
//@audio audioOnset audioKick audioSectionId audioPhrasePos
//@state 400 225 14
//@body
/**  One of the Life-like rules as birth and survival masks.
 *
 * @param k  The rule, 0..7. (in)
 *
 * @return
 *   Birth mask and survival mask (bit n: n living neighbours).
 **/
ivec2 ruleOf(int k)
{
    if (k == 0) return ivec2(464, 488);                        // Anneal B4678/S35678
    if (k == 1) return ivec2(456, 472);                        // Day & Night B3678/S34678
    if (k == 2) return ivec2(8, 496);                          // Coral B3/S45678
    if (k == 3) return ivec2(8, 62);                           // Maze B3/S12345
    if (k == 4) return ivec2(488, 480);                        // Diamoeba B35678/S5678
    if (k == 5) return ivec2(456, 492);                        // Stains B3678/S235678
    if (k == 6) return ivec2(8, 30);                           // Mazectric B3/S1234
    return ivec2(56, 240);                                     // Assimilation B345/S4567
}

/**  One step of the rule in force for this cell (the state pass).
 *
 * @return
 *   Alive (0 or 1), alive smoothed over a few steps, age 0..1, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(stRand(0) < 0.45 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    int k = (int(floor(clamp(ruleP, 0.0, 0.999) * 8.0)) + int(max(audioSectionId, 0.0))) % 8;
    ivec2 rule = ruleOf(k);
    int n = 0;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx)
            if ((dx != 0 || dy != 0) && stAt(ip + ivec2(dx, dy)).r > 0.5) ++n;
    bool alive = c.r > 0.5;
    bool next = alive ? ((rule.y >> n) & 1) == 1 : ((rule.x >> n) & 1) == 1;
    // seeds: at the start of a phrase, on an onset, and a rare stray one
    float slot = floor(stateFrame / 12.0);
    vec2 at = vec2(hash11(slot * 3.71 + 0.1), hash11(slot * 2.57 + 0.6)) * stateRes;
    vec2 d = abs(vec2(ip) - at);
    d = min(d, stateRes - d);
    bool phrase = audioPhrasePos > 0.001 && audioPhrasePos < 0.04;
    bool sow = mod(stateFrame, 12.0) < 1.0 && (phrase || clamp(audioOnset, 0.0, 1.0) > 0.7 || hash11(slot) < 0.35);
    float rad = phrase ? 32.0 : 12.0;
    if (sow && length(d) < rad) next = stRand(1) < 0.5;
    if (stRand(2) < 2.0e-5) next = !next;
    float v = next ? 1.0 : 0.0;
    float age = next ? (alive ? min(c.b + 0.02, 1.0) : 0.0) : c.b * 0.9;
    return vec4(v, mix(c.g, v, 0.4), age, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.55 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p + 0.02 * vec2(sin(0.027 * sceneTime), cos(0.033 * sceneTime)), zoom);
    vec4 s = stLin(cc);
    vec2 uv = cc / stateRes.y * 0.6;
    vec3 photo = imgLod(uv, 0.8);
    vec3 old = imgPalette(0.55 + 0.03 * audioPhase);
    vec3 live = mix(photo, old * (0.4 + luma(photo)), 0.6 * s.b);   // the oldest cells take another tone
    vec3 col = mix(imgLod(uv, 2.5) * 0.2, live * 1.15, smoothstep(0.15, 0.85, s.g));
    col += imgPalette(0.1 + 0.03 * audioPhase) * s.g * (1.0 - s.b) * 0.5 * clamp(audioKick, 0.0, 1.0);
    finish(col);
}

//@doc
 * @brief CYCLIC AUTOMATON SPIRALS: Griffeath's cyclic cellular automaton -- every cell advances to the next of N
 * states when enough neighbours already show it.  From random noise, "demons" emerge: crystalline spirals that
 * turn and conquer the field until it is all spiral cores.  The state is kept as an angle (cosine, sine), so the
 * field is drawn smoothly between the cells; its phase reads colours from a ring through the photo and lights the
 * wave fronts.  An endless, periodic field: it continues past the frame edges and mirrors without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> a new section switches to the next classic rule (the field reorganises)
 *   audioSwell      -> the automaton's pace (cells skip steps in quiet music)
 *   audioOnset      -> seeds noise into a patch: new spiral cores (structure)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the wave fronts flash (light)
 *
 * Knobs: ruleP (the first rule: demons, cyclic spirals, perfect spirals, squarish spirals, 313, turbulent phase),
 * scaleP (cell size),
 * bandP (how sharp the wave bands are), hueP.
//@params ruleP scaleP bandP
//@audio audioSwell audioOnset audioKick audioSectionId
//@state 480 270 120
//@body
const float TAU = 6.2831853;

/**  One of the classic cyclic rules (Mirek's Cellebration).
 *
 * @param k  The rule, 0..5. (in)
 *
 * @return
 *   Reach, threshold, number of states, and the neighbourhood: Moore (1) or von Neumann (0).
 **/
vec4 ruleOf(int k)
{
    if (k == 0) return vec4(1.0, 1.0, 14.0, 0.0);              // Griffeath's demons
    if (k == 1) return vec4(3.0, 5.0, 8.0, 1.0);               // cyclic spirals
    if (k == 2) return vec4(1.0, 3.0, 4.0, 1.0);               // perfect spirals
    if (k == 3) return vec4(2.0, 2.0, 6.0, 0.0);               // squarish spirals
    if (k == 4) return vec4(1.0, 3.0, 3.0, 1.0);               // 313
    return vec4(2.0, 5.0, 8.0, 1.0);                           // turbulent phase
}
/**  The rule in force: the knob's, moved on by one with every new section of the music.
 *
 * @return
 *   The rule, 0..5.
 **/
int ruleNow()
{
    int k0 = int(floor(clamp(ruleP, 0.0, 0.999) * 6.0));
    return (k0 + int(max(audioSectionId, 0.0))) % 6;           // a new section: the next rule
}

/**  A cell's state, read from its angle.
 *
 * @param c  The cell's texel (cosine, sine, freshness). (in)
 * @param n  The number of states. (in)
 *
 * @return
 *   The state, 0..n-1.
 **/
float cellState(vec4 c, float n)
{
    float a = atan(c.g, c.r) / TAU;
    return mod(floor(fract(a) * n + 0.5), n);
}
/**  A state as a texel: its angle as cosine and sine (so the field filters smoothly), and how fresh it is.
 *
 * @param s      The state, 0..n-1. (in)
 * @param n      The number of states. (in)
 * @param fresh  1 where the cell has just advanced, fading afterwards. (in)
 *
 * @return
 *   The texel.
 **/
vec4 encode(float s, float n, float fresh) { float a = TAU * s / n; return vec4(cos(a), sin(a), fresh, 1.0); }

/**  One step of the automaton for this texel (the state pass): the seed at step 0, then the cyclic rule, the music's
 * pace and the onsets' noise patches.
 *
 * @return
 *   The texel's new state.
 **/
vec4 stateStep()
{
    ivec2 ip = ivec2(gl_FragCoord.xy);
    ivec2 sz = ivec2(stateRes);
    vec4 r = ruleOf(ruleNow());
    float n = r.z;
    if (stateFrame < 0.5) return encode(floor(hash21(vec2(ip) + 17.3) * n), n, 0.0);
    vec4 c = texelFetch(texState, ip, 0);
    // pace: in quiet music whole steps are skipped (every cell alike, so the spirals stay coherent)
    if (hash11(stateFrame * 0.7313 + 0.17) > 0.45 + 0.55 * clamp(audioSwell, 0.0, 1.0)) return c;
    float s = cellState(c, n);
    float nxt = mod(s + 1.0, n);
    int reach = int(r.x);
    float cnt = 0.0;
    for (int dy = -3; dy <= 3; ++dy)
        for (int dx = -3; dx <= 3; ++dx) {
            if ((dx == 0 && dy == 0) || abs(dx) > reach || abs(dy) > reach) continue;
            if (r.w < 0.5 && abs(dx) + abs(dy) > reach) continue;
            if (cellState(texelFetch(texState, (ip + ivec2(dx, dy) + sz) % sz, 0), n) == nxt) cnt += 1.0;
        }
    bool move = cnt >= r.y;
    float s2 = move ? nxt : s;
    float fresh = move ? 1.0 : c.b * 0.9;
    // onsets seed noise into a wandering patch: new cores
    vec2 at = vec2(hash11(floor(stateFrame / 40.0) * 3.1), hash11(floor(stateFrame / 40.0) * 7.7)) * vec2(sz);
    vec2 d = abs(vec2(ip) - at);
    d = min(d, vec2(sz) - d);
    if (mod(stateFrame, 40.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.8 && length(d) < 4.0 + 5.0 * audioOnset)
        s2 = floor(hash21(vec2(ip) + stateFrame) * n);
    return encode(s2, n, fresh);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float k = 0.5 + 0.8 * clamp(scaleP, 0.0, 1.0);             // how much of the field the screen shows
    vec2 uv = p * vec2(resolution.y / resolution.x, 1.0) * k + 0.5;
    vec4 c = texture(texState, uv);
    float ph = fract(atan(c.g, c.r) / TAU);
    float mag = length(c.rg);                                  // < 1 where cells of different states blend
    // the phase as light bands (a wave front is the bright edge of each band) and a ring through the photo
    float sharp = 1.5 + 6.0 * clamp(bandP, 0.0, 1.0);
    float band = pow(0.5 + 0.5 * cos(TAU * ph), sharp);
    vec3 base = imgPalette(ph * 0.5 + 0.02 * audioPhase);
    vec3 under = imgLod(uv * 1.4 + 0.08 * vec2(cos(TAU * ph), sin(TAU * ph)), 1.5);
    vec3 col = mix(under, base, 0.45) * (0.25 + 1.1 * band) * (0.6 + 0.4 * smoothstep(0.2, 0.9, mag));
    col += base * c.b * band * (0.2 + 0.6 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}

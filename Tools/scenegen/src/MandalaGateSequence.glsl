//@doc
 * @brief MANDALA GATE SEQUENCE: a flight through gate after gate, each a dark screen with a mandala cut into it and lit
 * from behind -- a round heart, a ring of petals, a ring of little rounds and a ring of arched windows -- every gate with
 * its own symmetry, set by the harmony that sounded as the gate came into view.  A small field of the scene's own keeps
 * one slot per gate: when a new gate comes into being beyond the farthest drawn, its slot takes the symmetry of the strongest pitch class
 * then (six, eight, ten or twelve).  The gates are drawn from the nearest: a place inside a cut looks on to the next
 * gate; the cuts' rims glow.  The light behind is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> each new gate's symmetry: the strongest pitch class as it appears
 *   audioAdvance    -> the flight through the gates (integrated)
 *   audioSwell      -> the light behind the gates
 *
 * Knobs: gapP (the gates' spacing), cutP (how large the cuts are), hueP.
//@params gapP cutP
//@audio audioChroma[12] audioSwell
//@state 32 1 30 32
//@body
/**  The gates' spacing, the same in both passes.
 *
 * @return
 *   The spacing.
 **/
float gateGap()
{
    return 1.4 + 0.8 * clamp(gapP, 0.0, 1.0);
}

/**  The state pass: each slot keeps one gate's symmetry; the newest gate's slot is written as it appears.
 *
 * @return
 *   x the symmetry, y the gate's number, 0, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float kFar = floor(fly / gateGap()) + 10.0;                         // one beyond the farthest gate drawn
    vec4 old = stateFrame < 0.5 ? vec4(8.0, -1000.0, 0.0, 1.0) : texelFetch(texState, ivec2(j, 0), 0);
    if (j != int(mod(kFar, 32.0)) || old.y == kFar) return old;
    int best = 0;
    float bv = -1.0;
    for (int i = 0; i < 12; ++i)
        if (audioChroma[i] > bv) { bv = audioChroma[i]; best = i; }
    return vec4(6.0 + 2.0 * float(best % 4), kFar, 0.0, 1.0);
}

/**  How far a place lies inside a gate's cuts.
 *
 * @param w    The place on the gate. (in)
 * @param n    The gate's symmetry. (in)
 * @param cut  How large the cuts are. (in)
 *
 * @return
 *   The distance inside a cut (positive) or outside (negative).
 **/
float cuts(vec2 w, float n, float cut)
{
    float rho = length(w), th = atan(w.y, w.x);
    float sec = 6.2831853 / n;
    float u = abs(mod(th + 0.5 * sec, sec) - 0.5 * sec);             // the angle to the nearest spoke
    vec2 q = rho * vec2(cos(u), sin(u));                              // folded into one sector
    float d = (0.11 + 0.03 * cut) - rho;                              // the heart
    vec2 pc = q - vec2(0.31, 0.0);                                    // a petal: a lens on the spoke
    d = max(d, min(0.07 + 0.03 * cut - abs(pc.y) * 1.8 - abs(pc.x) * 0.55, 0.13 - abs(pc.x)));
    float u2 = abs(mod(th, sec) - 0.5 * sec);                         // the little rounds sit between the spokes
    d = max(d, (0.035 + 0.01 * cut) - length(rho * vec2(cos(u2), sin(u2)) - vec2(0.5, 0.0)));
    vec2 wq = q - vec2(0.72, 0.0);                                    // an arched window on the spoke
    float win = min(0.07 + 0.02 * cut - abs(wq.y), 0.1 - abs(wq.x + 0.03));
    win = wq.x > 0.0 ? min(0.07 + 0.02 * cut - length(wq * vec2(0.8, 1.0)), 0.1 - abs(wq.x)) : win;
    return max(d, win);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1;
    float D = gateGap();
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float cut = clamp(cutP, 0.0, 1.0);
    vec3 back = mix(famLight(fh, 0.65, 0.5), imgLod(vec2(0.5) + 0.25 * p, 5.0), 0.3) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = vec3(0.0);
    bool blocked = false;
    float k0 = floor(fly / D) + 1.0;
    for (int i = 0; i < 9; ++i) {
        float k = k0 + float(i);
        float dz = k * D - fly;
        vec4 g = texelFetch(texState, ivec2(int(mod(k, 32.0)), 0), 0);
        float n = g.y == k ? g.x : 8.0;
        vec2 w = rot2(0.3 * k) * (p * dz / F);
        float px = dz / F / resolution.y;
        float fade = exp(-0.08 * dz);
        float d = cuts(w, n, cut);
        float rim = exp(-pow(d / (2.0 * px + 0.003), 2.0));
        col += back * rim * 0.7 * fade;
        if (d < 0.0) {
            vec3 screen = famCol(fh, 0.3) * (0.05 + 0.04 * noise2(w * 12.0));
            col += screen * fade * smoothstep(0.0, 0.25, dz) + back * 0.15 * exp(-pow(d / 0.05, 2.0)) * fade;
            blocked = true;
            break;
        }
    }
    if (!blocked) col += back * 0.8;
    finish(col);
}

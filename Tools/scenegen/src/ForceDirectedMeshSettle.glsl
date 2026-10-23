//@doc
 * @brief FORCE DIRECTED MESH SETTLE: a mesh that settles under forces: springs between nodes, repelling forces, and the photo sets the rest lengths; the mesh swings in with delay.  The nodes of a lattice are pushed off their places by a damped swing whose size and phase come from the photo, the springs are drawn in a
 * colour that follows their tension, and the photo glows between.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the spring stiffness: the swing's speed and how fast it dies
 *   audioPhrasePos -> the cycle of kicking and settling (periodic)
 *
 * Knobs: sizeP (the size of the mesh), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
/**  The place of a lattice node of the mesh: pushed off its rest place by a damped swing.
 *
 * @param cj  The lattice node. (in)
 * @param S  The cell size. (in)
 * @param k  The spring stiffness 0..1. (in)
 * @param cyc  The phase of the kick-and-settle cycle. (in)
 *
 * @return
 *   The node's position.
 **/
vec2 nodePos(vec2 cj, float S, float k, float cyc)
{
    vec2 h = hash22(cj);
    vec3 c = imgLod((cj + 0.5) * S * 0.85 + 0.5, 2.5);
    float rest = 0.55 * (luma(c) - 0.4);
    float decay = exp(-cyc * (2.0 + 4.0 * k));
    float ang = 6.2831853 * h.x;
    vec2 kick = (h - 0.5) * 2.0 * 0.4 + rest * vec2(cos(ang), sin(ang));
    float swing = cos(cyc * (10.0 + 14.0 * k) + 6.28 * h.y) * decay;
    return (cj + 0.5 + kick * swing) * S;
}
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.07 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float k = 0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float cyc = fract(audioPhrasePos * 2.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.2) * 0.45;
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 A = nodePos(cj, S, k, cyc);
            vec3 cA = imgLod(A * 0.85 + 0.5, 1.2);
            cA = mix(vec3(luma(cA)), cA, 1.4);
            float dn = length(p - A);
            col = mix(col, cA * 1.5, 1.0 - smoothstep(S * 0.07, S * 0.1, dn));
            for (int e = 0; e < 3; ++e) {
                vec2 o = e == 0 ? vec2(1.0, 0.0) : (e == 1 ? vec2(0.0, 1.0) : vec2(1.0, 1.0));
                vec2 B = nodePos(cj + o, S, k, cyc);
                float d = sdSeg(p, A, B);
                float len = length(B - A) / (S * length(o));
                float tension = clamp(abs(len - 1.0) * 2.5, 0.0, 1.0);
                vec3 lc = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.45, 0.25), tension);
                float line = 1.0 - smoothstep(S * 0.012, S * 0.03, d);
                col = mix(col, lc, line * 0.85);
            }
        }
    finish(col * 1.1);
}

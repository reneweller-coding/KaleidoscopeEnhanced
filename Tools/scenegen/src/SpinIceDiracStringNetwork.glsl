//@doc
 * @brief SPIN ICE DIRAC STRING NETWORK: spin ice: spins on the edges of a lattice, whose ice rules are broken by monopoles that are joined by Dirac strings; the picture shows a lattice of photo in which chains of flipped spins run between pairs of monopoles.  Every edge is a short bar with an arrowhead; the bars on four
 * strings (between four pairs of wandering monopoles) are flipped, and shine brighter.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the monopoles wander (integrated)
 *   audioSpread  -> the number of monopole pairs (smoothed)
 *
 * Knobs: sizeP (the size of the lattice), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.07 + 0.05 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    float np = 2.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.5) * 0.18;
    for (int e = 0; e < 2; ++e) {
        vec2 a = e == 0 ? vec2(f.x - 0.5, f.y) : vec2(f.y - 0.5, f.x);
        float along = e == 0 ? f.x - 0.5 : f.y - 0.5;
        float across = e == 0 ? f.y : f.x;
        float flip = 0.0;
        for (int k = 0; k < 4; ++k) {
            float fk = float(k);
            vec2 h = hash22(vec2(fk, 13.0));
            vec2 A = floor(vec2(10.0 * sin(t * (0.6 + h.x) + 6.28 * h.y), 6.0 * cos(t * (0.5 + h.y) + 6.28 * h.x)));
            vec2 B = floor(vec2(10.0 * sin(t * (0.5 + h.y) + 3.0 + 6.28 * h.x), 6.0 * cos(t * (0.7 + h.x) + 2.0 + 6.28 * h.y)));
            float on = clamp(np - fk, 0.0, 1.0);
            float xlo = min(A.x, B.x);
            float xhi = max(A.x, B.x);
            float ylo = min(A.y, B.y);
            float yhi = max(A.y, B.y);
            if (e == 0 && abs(gi.y - A.y) < 0.5 && gi.x >= xlo && gi.x < xhi) flip = max(flip, on);
            if (e == 1 && abs(gi.x - B.x) < 0.5 && gi.y >= ylo && gi.y < yhi) flip = max(flip, on);
        }
        float h2 = hash21(gi + vec2(float(e) * 7.0, 3.0));
        float dir = (h2 < 0.5 ? 1.0 : -1.0) * (flip > 0.5 ? -1.0 : 1.0);
        vec3 c = imgLod((gi + 0.5) * S * 0.85 + 0.5, 1.2);
        c = mix(vec3(luma(c)), c, 1.4);
        float bar = (1.0 - smoothstep(0.03, 0.08, abs(across - 0.5))) * (1.0 - smoothstep(0.4, 0.45, abs(along)));
        float ah = abs(along * dir - 0.28);
        float head = (1.0 - smoothstep(0.0, 0.03, abs(abs(across - 0.5) - ah * 0.9 - 0.0) )) * step(ah, 0.14) * step(0.0, 0.14 - ah);
        float shape = max(bar, head * 0.8);
        float bright = flip > 0.5 ? 1.6 : 0.8;
        vec3 ec = flip > 0.5 ? mix(c, vec3(1.0, 0.7, 0.35), 0.5) : c;
        col = mix(col, ec * bright, shape);
    }
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 13.0));
        vec2 A = floor(vec2(10.0 * sin(t * (0.6 + h.x) + 6.28 * h.y), 6.0 * cos(t * (0.5 + h.y) + 6.28 * h.x)));
        float on = clamp(np - fk, 0.0, 1.0);
        float d = length(g - A - 0.0);
        col += vec3(1.0, 0.3, 0.2) * exp(-d * d / 0.06) * on * 0.8;
    }
    finish(col * 1.1);
}

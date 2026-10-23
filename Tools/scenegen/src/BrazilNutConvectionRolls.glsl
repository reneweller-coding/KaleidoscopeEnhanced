//@doc
 * @brief BRAZIL NUT CONVECTION ROLLS: the Brazil nut effect: big grains rise in vibrated granular matter while small ones sink, in convection rolls; the photo colours the grains by size, and the rolls turn.  A row of counter-rotating rolls carries a field of grains (big and small ones, round, lit as little
 * spheres) round with it; the big grains lie near the top of each roll, the small ones at the bottom.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the rolls turn (integrated)
 *   audioSwell   -> the vibration: the share of big grains near the top
 *
 * Knobs: sizeP (the size of the grains), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float RS = 0.45;
    vec2 q = p / RS;
    vec2 ci = floor(q);
    vec2 loc = (q - ci - 0.5) * RS;
    float dir = mod(ci.x + ci.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float om = dir * (0.02 * audioAdvance + 0.04 * sceneTime);
    float r = length(loc);
    vec2 X = rot2(-om * (1.0 + 2.0 * (0.5 - r))) * loc;
    float gs = 0.022 + 0.02 * clamp(sizeP, 0.0, 1.0);
    vec2 g = X / gs;
    vec2 gi = floor(g);
    float best = 1e3;
    vec2 bc = vec2(0.0);
    float bsz = 1.0;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj + ci * 13.0);
            vec2 pt = cj + 0.5 + 0.2 * (h - 0.5) * 2.0;
            float big = step(0.62, h.x);
            float rad = 0.46 * (big > 0.5 ? 1.0 : 0.62);
            float d = length(g - pt) / rad;
            if (d < best) { best = d; bc = pt; bsz = big; }
        }
    float inside = 1.0 - smoothstep(0.9, 1.0, best);
    vec2 pcen = ci * RS + RS * 0.5 + rot2(om * (1.0 + 2.0 * (0.5 - length(bc * gs)))) * (bc * gs);
    vec3 c = imgLod(pcen * 0.85 + 0.5, 1.3);
    c = mix(vec3(luma(c)), c, 1.4);
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec3 tint = bsz > 0.5 ? vec3(1.15, 1.0, 0.85) : vec3(0.85, 0.95, 1.1);
    vec2 lp = (g - bc) / (0.46 * (bsz > 0.5 ? 1.0 : 0.62));
    float lit = 0.55 + 0.6 * clamp(dot(normalize(vec3(lp, sqrt(max(1.0 - dot(lp, lp), 0.0)))), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.0) * 0.1;
    float wall = smoothstep(0.0, 0.01, min(min(loc.x + RS * 0.5, RS * 0.5 - loc.x), min(loc.y + RS * 0.5, RS * 0.5 - loc.y)));
    finish(mix(bg, c * tint * lit * 1.3, inside) * (0.6 + 0.4 * wall));
}

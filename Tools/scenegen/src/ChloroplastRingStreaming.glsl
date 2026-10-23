//@doc
 * @brief CHLOROPLAST RING STREAMING: chloroplasts streaming round in cells: hundreds of green discs in the cell walls circle with the plasma flow; the photo colours the discs, and the flow changes between the cells.  Every cell is a polygon of the field with ten discs on an orbit round the middle; the direction
 * and the speed of the orbit change from cell to cell, and the discs are lit like beads.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the streaming (integrated)
 *   audioSwell   -> the speed's difference between the cells
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.2 + 0.14 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g + 0.0);
    vec2 f = fract(g) - 0.5;
    float h = hash21(gi);
    float dirv = h < 0.5 ? 1.0 : -1.0;
    float spd = (0.3 + 0.7 * hash21(gi + 5.0) * (0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0)));
    float t = (0.03 * audioAdvance + 0.04 * sceneTime) * spd * dirv;
    vec3 bg = imgLod(p * 0.85 + 0.5, 1.2) * 0.3;
    float wall = smoothstep(0.0, 0.05, min(min(f.x + 0.5, 0.5 - f.x), min(f.y + 0.5, 0.5 - f.y)));
    vec3 col = bg * (0.5 + 0.5 * wall) + vec3(0.02, 0.05, 0.02);
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        float a = 6.2831853 * fk / 10.0 + 6.2831853 * t;
        float rr = 0.3 + 0.05 * sin(2.0 * a + 3.0 * fk);
        vec2 c = rr * vec2(cos(a), sin(a));
        float d = length(f - c);
        float R = 0.085;
        float disc = 1.0 - smoothstep(R * 0.8, R, d);
        vec2 lp = (f - c) / R;
        float lit = 0.6 + 0.5 * clamp(dot(normalize(vec3(lp, sqrt(max(1.0 - dot(lp, lp), 0.0)))), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
        vec3 pc = imgLod((gi * S + c * S) * 0.85 + 0.5, 1.2);
        pc = mix(vec3(luma(pc)), pc, 1.3) * vec3(0.8, 1.15, 0.75);
        col = mix(col, pc * lit * 1.3, disc);
    }
    finish(col * (0.35 + 0.65 * wall) * 1.1);
}

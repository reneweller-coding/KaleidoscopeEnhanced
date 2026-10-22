//@doc
 * @brief LIGHT SPACE MODULATOR: after Moholy-Nagy's Light-Space Modulator: perforated metal discs, glass rods and a
 * spiral turn in front of lamps and throw light and shadow into a dark room -- grids of light dots, bars of shadow,
 * a spiral sweep, all sliding over each other.  On the wall each part is a mask: the perforated disc a turning grid
 * of round holes, the rods a set of bars whose shadows lengthen and shorten as they turn, the spiral a turning
 * logarithmic band; the light is their product, softened by the lamps' size.  The light's colour is a shade of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the parts turn (integrated), each at its own rate
 *   audioBass/Mid/High -> the disc's, the rods' and the spiral's own lamp brighten with their band
 *
 * Knobs: holeP (the disc's holes), rodP (how many rods), hueP.
//@params holeP rodP
//@audio audioBass audioMid audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float t = 0.04 * sceneTime + 0.2 * audioAdvance;
    // the perforated disc: a turning grid of round holes
    vec2 d = rot2(t) * (p - vec2(-0.25, 0.05)) * (9.0 + 6.0 * clamp(holeP, 0.0, 1.0));
    vec2 f = fract(d) - 0.5;
    float disc = smoothstep(0.32, 0.22, length(f)) * smoothstep(1.2, 0.9, length(p - vec2(-0.25, 0.05)));
    // the rods: bars whose shadows shorten and lengthen as they turn about a vertical axis
    float rods = 1.0;
    float n = 3.0 + 4.0 * clamp(rodP, 0.0, 1.0);
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        if (fi >= n) break;
        float a = -0.7 * t + 0.9 * fi;
        float x = 0.6 * sin(a) + 0.12 * fi - 0.3;
        float w = 0.02 + 0.03 * abs(cos(a));
        rods *= 1.0 - 0.85 * smoothstep(w, w * 0.4, abs(p.x - x)) * smoothstep(0.7, 0.5, abs(p.y + 0.1 * sin(a + fi)));
    }
    // the spiral: a turning logarithmic band
    vec2 s = p - vec2(0.3, -0.05);
    float sp = fract((atan(s.y, s.x) + 0.6 * t) / 6.2831853 * 2.0 - 0.8 * log(max(length(s), 1e-3)));
    float spiral = smoothstep(0.3, 0.15, abs(sp - 0.5)) * smoothstep(1.1, 0.3, length(s));
    vec3 col = famLight(fh, 0.2, 0.3) * disc * rods * (0.4 + 0.8 * clamp(audioBass, 0.0, 1.0))
             + famLight(fh, 0.5, 0.3) * rods * spiral * (0.35 + 0.7 * clamp(audioHigh, 0.0, 1.0))
             + famCol(fh, 0.8) * rods * 0.12 * (0.5 + 0.8 * clamp(audioMid, 0.0, 1.0)) * smoothstep(1.4, 0.3, length(p));
    finish(col);
}

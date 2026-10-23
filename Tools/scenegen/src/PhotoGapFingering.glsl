//@doc
 * @brief PHOTO GAP FINGERING: viscous fingers (Saffman-Taylor) in a gap whose thickness is the photo: the fluid that pushes in favours the thick places, branches and goes round the thin ones, growing in fine fingers where the
 * photo is bright and creeping where it is dark; the growth is a dielectric-breakdown model (a diffusion field of the pressure and growth by chance in proportion to it), calculated in a small field of the scene's own.  The
 * fingers carry the photo's colours.  The number of fingers follows the spectral spread; at the end of a long cycle the fluid melts back and new seeds begin.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of fingers (the branching exponent)
 *
 * Knobs: speedP (how fast the fingers grow), hueP.
//@params speedP
//@audio audioSpread
//@state 240 135 600 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One step of the fingering: the pressure diffuses, the fluid grows into the neighbouring cells by chance (the state pass).
 *
 * @return
 *   The fluid (0 or 1), the pressure, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float cyc = floor(stateFrame / 36000.0);
    float ph = mod(stateFrame, 36000.0);
    vec2 cell = vec2(ip) + 0.5;
    bool seedCell = false;
    for (int k = 0; k < 3; ++k) {
        vec2 at = stateRes * (0.2 + 0.6 * vec2(hash11(cyc * 3.7 + float(k) * 1.9), hash11(cyc * 1.3 + float(k) * 5.3 + 0.7)));
        if (length(cell - at) < 2.2) seedCell = true;
    }
    if (stateFrame < 0.5) return vec4(seedCell ? 1.0 : 0.0, seedCell ? 0.0 : 1.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    vec4 e = stAt(ip + ivec2(1, 0)), w = stAt(ip - ivec2(1, 0)), n = stAt(ip + ivec2(0, 1)), s = stAt(ip - ivec2(0, 1));
    float fluid = c.r;
    float p = c.g;
    float nb = max(max(e.r, w.r), max(n.r, s.r));
    float thick = 0.15 + 0.85 * luma(imgLod(photoUV(cell), 2.0));
    float eta = 0.8 + 1.8 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float rate = 0.03 + 0.05 * clamp(speedP, 0.0, 1.0);
    if (fluid < 0.5 && nb > 0.5 && stRand(1) < rate * pow(clamp(p, 0.0, 1.0), eta) * thick * 3.0) fluid = 1.0;
    float pn = p + 0.22 * (e.g + w.g + n.g + s.g - 4.0 * p);
    vec2 q = cell / stateRes;
    float edge = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    if (edge < 2.0 / stateRes.y) pn = 1.0;
    if (fluid > 0.5) pn = 0.0;
    if (ph > 30000.0 && fluid > 0.5 && stRand(2) < 0.0006) fluid = 0.0;
    if (ph < 40.0 && seedCell) { fluid = 1.0; pn = 0.0; }
    return vec4(fluid, clamp(pn, 0.0, 1.0), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    vec4 s = stLin(cc);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    float fl = smoothstep(0.35, 0.65, s.r);
    float rim = smoothstep(0.0, 0.5, s.g) * (1.0 - fl);
    finish(c * (0.14 + 0.95 * fl + 0.0 * rim) * 1.1 + 0.12 * rim * mix(c, vec3(1.0), 0.5));
}

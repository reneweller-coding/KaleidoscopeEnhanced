//@doc
 * @brief BEAM SPLITTER LATTICE: a lattice of half-silvered plates set at forty-five degrees; a beam of light enters
 * and is split at every plate -- half goes straight on, half turns -- so it branches into a glowing tree that keeps
 * overlapping itself into a diamond of light.  The intensity on a segment is the chance of a random walk reaching
 * it: after i straight and j turned passes, C(i + j, j) / 2^(i + j), evaluated through log-gamma (Stirling), so the
 * light concentrates along the diamond's middle and thins toward its sides.  The plates' tilt shears the lattice.
 * One colour family from the photo; each source its own shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the plates tilt with the chord changes: the lattice shears, the tree leans
 *   audioOnset       -> a second beam enters from the other side and fades
 *   audioAdvance     -> light pulses run along the beams (integrated)
 *
 * Knobs: cellP (the lattice's mesh), spreadP (how far the tree spreads before it fades), hueP.
//@params cellP spreadP
//@audio audioHarmAdvance audioOnset
//@body
/**  The logarithm of n! (Stirling with the first correction, exact enough from 0).
 *
 * @param n  The number. (in)
 *
 * @return
 *   log(n!).
 **/
float logFact(float n)
{
    n = max(n, 0.0) + 1.0;
    return (n - 0.5) * log(n) - n + 0.9189385 + 1.0 / (12.0 * n);
}

/**  The light of a beam entering at the lattice point (0, 0) heading +x: on the segment around lattice point (i, j).
 *
 * @param i  Straight passes. (in)
 * @param j  Turned passes. (in)
 *
 * @return
 *   The share of the light there.
 **/
float walkShare(float i, float j)
{
    if (i < 0.0 || j < 0.0) return 0.0;
    float n = i + j;
    return exp(logFact(n) - logFact(i) - logFact(j) - n * 0.6931472);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float S = 0.05 + 0.04 * clamp(cellP, 0.0, 1.0);
    float shear = 0.25 * sin(0.7 * h) + 0.1 * sin(0.31 * h + 1.0);
    float run = 0.6 * audioAdvance + 0.04 * sceneTime;
    float spread = 0.6 + 0.8 * clamp(spreadP, 0.0, 1.0);
    // lattice coordinates: the beam enters at the left edge's middle, heading right; turned beams head up
    mat2 lat = mat2(1.0, 0.0, shear, 1.0);
    vec2 g = inverse(lat) * (p - vec2(-0.85, -0.42)) / S;
    vec3 col = famCol(fh, 0.5) * 0.02;
    for (int src = 0; src < 2; ++src) {
        vec2 q = src == 0 ? g : vec2(g.x, -(g.y - (0.84 / S)));  // the second beam enters from the top, heading down
        float amp = src == 0 ? 1.0 : 1.4 * clamp(audioOnset, 0.0, 1.0);
        if (amp < 0.01) continue;
        vec2 c = floor(q + 0.5);
        vec2 f = q - c;
        // horizontal segments (straight beams) and vertical segments (turned beams) through the lattice points
        float dH = abs(f.y), dV = abs(f.x);
        float shH = walkShare(c.x, c.y), shV = walkShare(c.x, c.y);
        float w = 0.06;
        float gH = exp(-pow(dH / w, 2.0)) * shH, gV = exp(-pow(dV / w, 2.0)) * shV;
        float pulse = 0.7 + 0.3 * sin(6.2831853 * (0.15 * (q.x + q.y) - run));
        float fade = exp(-(c.x + c.y) / (40.0 * spread));
        float light = (gH + gV) * sqrt(c.x + c.y + 1.0) * pulse * fade * 2.5;   // the diamond's middle stays bright
        // the plates: thin diagonal glints at the lattice points
        float plate = exp(-pow(abs(f.x - f.y) / 0.03, 2.0)) * step(length(f), 0.3) * (shH > 0.002 ? 0.25 : 0.0);
        col += famLight(fh, src == 0 ? 0.3 : 0.7, 0.4 * min(light, 1.0)) * (light + plate) * amp;
    }
    finish(famExpose(col, 4.90, 0.90, 0.03, fh));
}

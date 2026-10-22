//@doc
 * @brief LACE SLEEVE TUNNEL: a tunnel of lace lit from behind, turning slowly: rosettes of petals ringed by scallops,
 * set in a fine net, the threads glowing and the light shining softly through the holes; the lace's pattern changes
 * with the sections of the music.  The wall is cut into cells with a whole number around; each cell holds a rosette --
 * its petals the curve r = a + b |cos(n theta / 2)|, a ring at its heart and a scalloped ring round it -- and between
 * the rosettes runs a diagonal net of thinner threads.  A section's petal count is cross-faded as light over six
 * seconds.  The threads are shades of one colour family, the light behind them the photo, calmed toward it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every section brings its own rosettes (cross-faded over six seconds)
 *   audioPhase         -> the lace turns (integrated)
 *   audioAdvance       -> the flight (integrated)
 *   audioSwell         -> the light behind the lace
 *
 * Knobs: cellP (the rosettes' size), threadP (the threads' width), hueP.
//@params cellP threadP
//@audio audioSectionId audioSectionPrev audioSectionAge audioPhase audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  A lace cell's threads.
 *
 * @param l   The place in the cell (centre at 0). (in)
 * @param n   The rosette's petals. (in)
 * @param w   The threads' width (in cells). (in)
 *
 * @return
 *   The threads' cover (0..about 1).
 **/
float lace(vec2 l, float n, float w)
{
    float rho = length(l), th = atan(l.y, l.x);
    float petal = abs(rho - (0.12 + 0.17 * abs(cos(n * th * 0.5))));
    float heart = abs(rho - 0.07);
    float scallop = abs(rho - (0.41 + 0.025 * cos(2.0 * n * th)));
    float g = exp(-pow(petal / w, 2.0)) + exp(-pow(heart / w, 2.0)) + 0.8 * exp(-pow(scallop / w, 2.0));
    // the net between the rosettes
    float n1 = abs(fract((l.x + l.y) * 4.0) - 0.5) / 4.0, n2 = abs(fract((l.x - l.y) * 4.0) - 0.5) / 4.0;
    g += 0.5 * (exp(-pow(n1 / (0.6 * w), 2.0)) + exp(-pow(n2 / (0.6 * w), 2.0))) * smoothstep(0.43, 0.47, rho);
    return min(g, 1.2);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.22 * sceneTime + 0.8 * audioAdvance;
    float turn = 0.015 * sceneTime + 0.2 * audioPhase;
    float M = floor(6.0 + 5.0 * (1.0 - clamp(cellP, 0.0, 1.0)));
    float cw = 6.2831853 * R0 / M;
    vec2 q = vec2((a + turn) / 6.2831853 * M, (z + fly) / cw);
    vec2 l = fract(q) - 0.5;
    float px = R0 / (r * r * resolution.y) / cw;
    float w = max(0.008 + 0.008 * clamp(threadP, 0.0, 1.0), 1.2 * px);
    float detail = 1.0 - smoothstep(0.03, 0.09, px);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = 5.0 + mod(max(audioSectionPrev, 0.0), 4.0), nB = 5.0 + mod(max(audioSectionId, 0.0), 4.0);
    float g = (1.0 - m) * lace(l, nA, w) + m * lace(l, nB, w);
    g = mix(0.3, g, detail);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 back = tone(imgLod(vec2(0.5 + 0.3 * cos(a + 0.5 * turn), 0.5 + 0.3 * sin(a + 0.5 * turn)), 4.5), fh) * 0.35 * glow;
    vec3 col = back * (1.0 - 0.7 * min(g, 1.0)) + famLight(fh, 0.7, 0.3) * g * 0.8 * glow;
    col = mix(col, famCol(fh, 0.6) * 0.3 * glow, smoothstep(6.0, 18.0, z));
    col += famLight(fh, 0.7, 0.5) * exp(-r * 8.0) * 0.3;
    finish(col);
}

//@doc
 * @brief PURSUIT CURVE WHIRLS: the mice problem: a polygon whose corners each chase the next, drawn step after step, so
 * the nested polygons turn and shrink into a glowing whirl -- endlessly, since every step is the one before turned and
 * shrunk by the same amount, and the view sinks into it without end; the number of corners changes with the chords.
 * Each step moves every corner a fixed share toward the next, which is a turn by phi and a shrink by rho (the
 * modulus and angle of (1 - s) + s e^(2 pi i / n)); a pixel finds the nearest steps from its distance to the centre,
 * maps itself back into the first polygon and measures that polygon's edges there.  Alternate steps are shaded, so the
 * whirl's triangles show.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the view sinks into the whirl (integrated, without end)
 *   audioHarmAdvance -> the number of corners changes with the chords (cross-faded)
 *   audioSwell       -> the lines' glow
 *
 * Knobs: chaseP (how far each corner moves per step), lineP (the lines' width), hueP.
//@params chaseP lineP
//@audio audioHarmAdvance audioSwell
//@body
/**  The whirl for one number of corners.
 *
 * @param p      The place. (in)
 * @param n      The number of corners. (in)
 * @param s      The share each corner moves per step. (in)
 * @param sink   How far the view has sunk (in steps). (in)
 * @param lw     The lines' half width on screen. (in)
 *
 * @return
 *   x the lines, y the shading of the steps.
 **/
vec2 whirl(vec2 p, float n, float s, float sink, float lw)
{
    vec2 w = vec2(1.0 - s + s * cos(6.2831853 / n), s * sin(6.2831853 / n));
    float rho = length(w), phi = atan(w.y, w.x);
    const float R = 1.2;
    float ap = R * cos(3.14159265 / n);
    float r = max(length(p), 1e-5);
    float jf = log(r / ap) / log(rho) + sink;                        // about which step lies here
    float lines = 0.0, shade = 0.0;
    for (int i = -1; i <= 1; ++i) {
        float j = floor(jf) + float(i);
        float sc = pow(rho, j - sink);
        vec2 q = rot2((j - sink) * phi) * p / sc;                     // back into the first polygon (rot2(a) turns by -a)
        float sec = 6.2831853 / n;
        float a = mod(atan(q.y, q.x), sec) - 0.5 * sec;
        float d = (length(q) * cos(a) - ap) * sc;                     // to the polygon's edge, on screen
        lines += exp(-pow(d / lw, 2.0));
        if (d < 0.0 && i == 0) shade = mod(j, 2.0);
    }
    return vec2(lines, shade);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float s = 0.05 + 0.06 * clamp(chaseP, 0.0, 1.0);
    float lw = 0.0015 + 0.0015 * clamp(lineP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = 3.0 + mod(hk, 4.0), nB = 3.0 + mod(hk + 1.0, 4.0);
    float sink = 0.15 * sceneTime + 0.6 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 a = whirl(p, nA, s, sink, lw), b = whirl(p, nB, s, sink, lw);
    float lines = (1.0 - hm) * a.x + hm * b.x;
    float shade = (1.0 - hm) * a.y + hm * b.y;
    vec3 col = famCol(fh, 0.35 + 0.3 * shade) * (0.04 + 0.08 * shade);
    col += famLight(fh, 0.5, 0.6) * lines * glow;
    finish(famExpose(col, 1.35, 1.00, 0.03, fh));
}

//@doc
 * @brief OIL CELL KALEIDOSCOPE: a kaleidoscope whose object cell is filled with oil: glitter and drops of colour sink
 * slowly through it, tumbling, and three mirrors set as a triangle turn the cell into a flowing rosette.  Optics
 * as in the real thing: the view ray is folded back into the triangle across the side it crossed, every bounce
 * costs a tenth of the light, the mirrors' meeting lines are fine dark seams.  The drops are soft and translucent,
 * the glitter round and sharp; both enter at the top of the cell and fade out at its bottom.  One colour family
 * from the photo, the drops lit by the photo behind them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the sinking (integrated: faster music, faster fall)
 *   audioHarmAdvance -> every chord change tilts the cell a little (the fall runs aslant)
 *   audioHat         -> the glitter glints (light)
 *
 * Knobs: dropP (how many drops), glitterP (how much glitter), hueP.
//@params dropP glitterP
//@audio audioHarmAdvance audioHat
//@body
/**  Fold a point into the equilateral triangle (side 1, centre at 0) by reflecting it across the side it lies
 * beyond, again and again.
 *
 * @param p  The point. (in)
 * @param n  Returns how many reflections it took. (out)
 * @param e  Returns the distance to the nearest side. (out)
 *
 * @return
 *   The point inside the triangle.
 **/
vec2 triFold(vec2 p, out float n, out float e)
{
    const vec2 N0 = vec2(0.0, -1.0), N1 = vec2(0.8660254, 0.5), N2 = vec2(-0.8660254, 0.5);
    const float H = 0.2886751;
    n = 0.0;
    for (int i = 0; i < 48; ++i) {
        float d0 = dot(p, N0) - H, d1 = dot(p, N1) - H, d2 = dot(p, N2) - H;
        float dm = max(d0, max(d1, d2));
        if (dm <= 0.0) break;
        p -= 2.0 * dm * (dm == d0 ? N0 : dm == d1 ? N1 : N2);
        n += 1.0;
    }
    e = -max(dot(p, N0) - H, max(dot(p, N1) - H, dot(p, N2) - H));
    return p;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float tilt = 0.25 * sin(0.7 * h) + 0.1 * sin(0.31 * h + 1.0);
    float fall = 0.012 * sceneTime + 0.06 * audioAdvance;
    float drops = 6.0 + 8.0 * clamp(dropP, 0.0, 1.0);
    float glit = 0.3 + 0.6 * clamp(glitterP, 0.0, 1.0);
    float n, e;
    vec2 q = triFold(p / 0.6, n, e);
    vec2 c = rot2(tilt) * q;
    vec3 col = famCol(fh, 0.5) * (0.08 + 0.18 * luma(imgLod(q * 0.6 + 0.5, 4.0)));
    // the drops: soft blobs, each in its own column, falling through the cell (period 1.2, faded at the ends)
    for (int i = 0; i < 14; ++i) {
        float fi = float(i);
        if (fi >= drops) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float y = fract(h1 - fall * (0.6 + 0.8 * h2));
        vec2 at = vec2(-0.4 + 0.8 * h2 + 0.05 * sin(6.0 * y + fi), 0.6 - 1.2 * y);
        float r = 0.07 + 0.07 * fract(h1 * 5.3);
        float d = length((c - at) * vec2(1.0, 1.0 + 0.3 * sin(fi + 3.0 * y))) / r;
        float body = exp(-d * d * 2.2) * smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.85, y);
        vec3 lit = famCol(fh, 0.15 + 0.7 * h1) * (0.5 + 0.9 * luma(imgLod(at * 0.8 + 0.5, 2.0)));
        col = mix(col, lit * 1.4, body * 0.85);
        col += famLight(fh, h1, 0.7) * exp(-pow((d - 0.75) / 0.12, 2.0)) * body * 0.15;   // the drop's rim
    }
    // the glitter: round sparkles on a fine lattice, falling with the oil
    vec2 g = (c + vec2(0.0, fall * 0.9)) * 28.0;
    vec2 gid = floor(g);
    float hg = fract(sin(dot(gid, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 gat = gid + 0.5 + 0.35 * (vec2(fract(hg * 7.3), fract(hg * 3.1)) - 0.5);
    float sp = exp(-dot(g - gat, g - gat) * 30.0) * step(1.0 - glit * 0.5, hg);
    float glint = 0.4 + 1.6 * clamp(audioHat, 0.0, 1.0) * step(0.8, fract(hg * 11.0));
    col += famLight(fh, fract(hg * 3.0), 0.7) * sp * glint;
    col *= pow(0.9, n) * smoothstep(0.0, 0.006, e);
    finish(col);
}

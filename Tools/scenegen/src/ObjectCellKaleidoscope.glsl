//@doc
 * @brief OBJECT CELL KALEIDOSCOPE: the classic kaleidoscope worked out as optics -- an object cell of tumbling glass
 * pieces, beads and oil bubbles behind three mirrors set as a triangle; the eye looks down the tube and every
 * mirror shows the cell again, each image of an image a little darker (the mirrors lose a tenth of the light at
 * every bounce) and a little softer, the seams where mirrors meet a fine dark line.  A view ray is folded back into
 * the triangle across whichever side it crossed, counting the bounces.  The glass takes its shades from one colour
 * family, its light from the photo shining through it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance        -> the pieces tumble (integrated)
 *   audioSectionId/Age  -> every new section turns the object cell a step further (over six seconds)
 *   audioKick           -> shakes the smallest pieces only (beads), never the view
 *
 * Knobs: pieceP (how many pieces), sizeP (the triangle's size on screen), hueP.  Distinct from Kaleidoscope, which
 * folds the photo itself.
//@params pieceP sizeP
//@audio audioSectionId audioSectionPrev audioSectionAge audioKick
//@body
/**  Fold a point into the equilateral triangle (side 1, centre at 0, one side at the bottom) by reflecting it across
 * the side it lies beyond, again and again.
 *
 * @param p  The point. (in)
 * @param n  Returns how many reflections it took. (out)
 * @param e  Returns the distance to the nearest side (the seams). (out)
 *
 * @return
 *   The point inside the triangle.
 **/
vec2 triFold(vec2 p, out float n, out float e)
{
    const vec2 N0 = vec2(0.0, -1.0), N1 = vec2(0.8660254, 0.5), N2 = vec2(-0.8660254, 0.5);
    const float H = 0.2886751;                                  // the inradius of a triangle of side 1
    n = 0.0;
    for (int i = 0; i < 48; ++i) {
        float d0 = dot(p, N0) - H, d1 = dot(p, N1) - H, d2 = dot(p, N2) - H;
        float dm = max(d0, max(d1, d2));
        if (dm <= 0.0) break;
        vec2 nn = dm == d0 ? N0 : dm == d1 ? N1 : N2;
        p -= 2.0 * dm * nn;
        n += 1.0;
    }
    e = -max(dot(p, N0) - H, max(dot(p, N1) - H, dot(p, N2) - H));
    return p;
}

/**  The object cell at a point: glass pieces (soft polygons), beads and oil bubbles, as colour and coverage.
 *
 * @param q     The point in the cell (the triangle's frame). (in)
 * @param tumb  The tumbling phase. (in)
 * @param turn  The cell's turn. (in)
 * @param cnt   How many pieces. (in)
 * @param fh    The colour family. (in)
 *
 * @return
 *   The light coming through (rgb) and how much glass is there (a).
 **/
vec4 objectCell(vec2 q, float tumb, float turn, float cnt, float fh)
{
    q = rot2(turn) * q;
    vec3 light = vec3(0.0);
    float cover = 0.0;
    float kick = clamp(audioKick, 0.0, 1.0);
    for (int i = 0; i < 28; ++i) {
        float fi = float(i);
        if (fi >= cnt) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        // each piece wanders the cell on its own slow loop and turns
        vec2 c = 0.42 * vec2(sin(tumb * (0.3 + 0.4 * h1) + 6.2831853 * h2), cos(tumb * (0.25 + 0.35 * h2) + 6.2831853 * h1));
        float kind = fract(h1 * 7.0);
        float r = kind < 0.6 ? 0.04 + 0.11 * h2 * h2 : 0.02 + 0.025 * h2;
        if (kind >= 0.6) c += 0.012 * kick * vec2(sin(37.0 * fi + 9.0 * tumb), cos(53.0 * fi + 7.0 * tumb));
        vec2 d = rot2(tumb * (0.5 + h2) + fi) * (q - c);
        float sd;
        if (kind < 0.6) {                                        // a glass piece: a soft polygon of 3..6 sides
            float m = 3.0 + floor(4.0 * h2);
            float a = atan(d.y, d.x), seg = 6.2831853 / m;
            float ca = cos(seg * 0.5);
            sd = length(d) * cos(mod(a + 0.5 * seg, seg) - 0.5 * seg) - r * ca;
        } else {
            sd = length(d) - r;                                  // a bead or a bubble
        }
        float cov = 1.0 - smoothstep(-0.004, 0.004, sd);
        vec3 photo = imgLod(c * 0.9 + 0.5, 2.0);
        vec3 glass = famCol(fh, 0.1 + 0.8 * h1) * (0.5 + 1.1 * luma(photo)) * (0.7 + 0.6 * fract(h2 * 5.1));
        if (kind > 0.85) {                                       // an oil bubble: only its rim, iridescent within the family
            float rim = exp(-pow(sd / 0.006, 2.0));
            light += famLight(fh, fract(h1 + 4.0 * length(d)), 0.4) * rim * 0.8;
            cover = max(cover, rim * 0.5);
        } else {
            float edge = exp(-pow(sd / 0.003, 2.0));             // the bevelled edge catches the light
            light = mix(light, light * 0.4 + glass, cov * 0.7) + famLight(fh, h1, 0.6) * edge * 0.45;
            cover = max(cover, cov);
        }
    }
    return vec4(light, cover);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.38 + 0.3 * clamp(sizeP, 0.0, 1.0);            // the triangle's side on screen
    float cnt = 14.0 + 14.0 * clamp(pieceP, 0.0, 1.0);
    float tumb = 0.05 * sceneTime + 0.3 * audioAdvance;
    float turn = 0.7 * (max(audioSectionPrev, 0.0) + smoothstep(0.0, 6.0, audioSectionAge)
                        * (max(audioSectionId, 0.0) - max(audioSectionPrev, 0.0)));
    float n, e;
    vec2 q = triFold(p / S, n, e);
    vec4 cell = objectCell(q, tumb, turn, cnt, fh);
    // the cell's back: frosted glass lit by the photo
    vec3 back = famCol(fh, 0.5) * (0.12 + 0.25 * luma(imgLod(q * 0.7 + 0.5, 4.0)));
    vec3 col = mix(back, cell.rgb, cell.a);
    // every bounce costs a tenth of the light; the seams where the mirrors meet are a fine dark line
    col *= pow(0.9, n) * smoothstep(0.0, 0.006, e);
    finish(famExpose(col, 1.25, 1.00, 0.03, fh));
}

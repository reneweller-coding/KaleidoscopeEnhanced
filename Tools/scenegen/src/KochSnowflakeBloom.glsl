//@doc
 * @brief KOCH SNOWFLAKE BLOOM: a floor of Koch snowflakes of two sizes -- large flakes on a hexagonal lattice, small
 * ones turned by thirty degrees in the gaps between them -- drawn only by their edges of light; the edges' order
 * grows and shrinks, every straight piece bending into four, and the whole floor turns slowly.  A flake's edge is
 * found by turning the point into one third of the flake and following the Koch curve down: at every level the
 * point picks the nearer of the curve's four pieces (by symmetry, of two) and is carried into that piece's frame,
 * three times larger.  One colour family from the photo, the two sizes in neighbouring shades.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the edges' order (gliding: the light of two orders is cross-faded): loud music, finer edges
 *   audioAdvance -> the floor turns (integrated)
 *   audioKick    -> the edges flash (light)
 *
 * Knobs: sizeP (the flakes' size on screen), edgeP (the edges' width), hueP.
//@params sizeP edgeP
//@audio audioSwell audioKick
//@body
/**  The distance to a segment.
 *
 * @param p  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segK(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}

/**  The distance to the Koch curve of order n from (-1, 0) to (1, 0), its bumps toward +y.
 *
 * @param p  The point. (in)
 * @param n  The order. (in)
 *
 * @return
 *   The distance.
 **/
float kochCurve(vec2 p, int n)
{
    const vec2 TOP = vec2(0.0, 0.5773503), FOOT = vec2(0.3333333, 0.0);
    const vec2 DIR = vec2(0.5, -0.8660254), OUT = vec2(0.8660254, 0.5);   // the descending piece's frame
    float s = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= n) break;
        p.x = abs(p.x);
        if (segK(p, TOP, FOOT) < segK(p, FOOT, vec2(1.0, 0.0))) {
            vec2 m = 0.5 * (TOP + FOOT);
            p = 3.0 * vec2(dot(p - m, DIR), dot(p - m, OUT));
        } else {
            p = 3.0 * (p - vec2(0.6666667, 0.0));
        }
        s *= 3.0;
    }
    return segK(p, vec2(-1.0, 0.0), vec2(1.0, 0.0)) / s;
}

/**  The distance to a Koch snowflake's edge (its triangle's corners on the unit circle, one pointing up).
 *
 * @param p  The point (centre at 0). (in)
 * @param n  The order. (in)
 *
 * @return
 *   The distance.
 **/
float kochFlake(vec2 p, int n)
{
    // turn the point into the third of the flake below the centre: the edge y = -0.5, bumps downward
    float a = atan(p.y, p.x) + 1.5707963;
    float k = floor(a / 2.0943951 + 0.5);
    p = rot2(k * 2.0943951) * p;
    return kochCurve(vec2(p.x, -p.y - 0.5) / 0.8660254, n) * 0.8660254;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.32 + 0.3 * clamp(sizeP, 0.0, 1.0);              // the large flakes' circumradius on screen
    float order = 1.5 + 2.8 * clamp(audioSwell, 0.0, 1.0);
    float ok = floor(order), om = smoothstep(0.2, 0.8, order - ok);
    float w = (1.0 + 1.2 * clamp(edgeP, 0.0, 1.0)) / resolution.y / S;   // a pixel, in flake units
    float kick = clamp(audioKick, 0.0, 1.0);
    vec2 q = rot2(0.02 * sceneTime + 0.08 * audioAdvance) * p / S;
    // the large flakes on a hexagonal lattice, the small ones at the lattice triangles' centres
    const vec2 A = vec2(1.7320508, 0.0), B = vec2(0.8660254, 1.5);
    vec2 f = inverse(mat2(A, B)) * q;
    vec2 g0 = floor(f);
    float dL = 1e9, dL2 = 1e9, dS = 1e9, dS2 = 1e9;
    for (int j = 0; j < 4; ++j) {
        vec2 cL = mat2(A, B) * (g0 + vec2(float(j & 1), float(j >> 1)));
        dL = min(dL, kochFlake(q - cL, int(ok)));
        dL2 = min(dL2, kochFlake(q - cL, int(ok) + 1));
        for (int k = 0; k < 2; ++k) {
            vec2 cS = cL + (k == 0 ? (A + B) / 3.0 : 2.0 * (A + B) / 3.0);
            vec2 r = rot2(0.5235988) * (q - cS) * 1.7320508;
            dS = min(dS, kochFlake(r, int(ok)) / 1.7320508);
            dS2 = min(dS2, kochFlake(r, int(ok) + 1) / 1.7320508);
        }
    }
    float gL = (1.0 - om) * exp(-pow(dL / w, 2.0)) + om * exp(-pow(dL2 / w, 2.0));
    float gS = (1.0 - om) * exp(-pow(dS / w, 2.0)) + om * exp(-pow(dS2 / w, 2.0));
    float hL = exp(-min(dL, dL2) / (w * 14.0)) * 0.15, hS = exp(-min(dS, dS2) / (w * 14.0)) * 0.15;
    vec3 col = famLight(fh, 0.3, 0.3 * gL) * (gL + hL) * (1.0 + kick)
               + famLight(fh, 0.65, 0.3 * gS) * (gS + hS) * (1.0 + kick);
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}

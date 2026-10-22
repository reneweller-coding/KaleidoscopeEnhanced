//@doc
 * @brief HILBERT CONDUIT 3D: a three-dimensional Hilbert curve as a neon conduit -- one line that visits every cell of
 * a 16 x 16 x 16 block once, never crossing itself -- and the eye rides along it through every hook and turn, the
 * rest of the curve folding away on all sides.  The curve runs from one corner of the block to the neighbouring
 * corner, so blocks set side by side join into one endless line.  Index and cell are turned into each other by
 * Skilling's transposed Gray code; the ride follows a cubic B-spline through the cells' centres.  One colour
 * family from the photo, shading slowly along the line.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the ride (integrated)
 *   audioSectionId/Age -> every new section blends between the fine curve and the coarse one of the order below
 *                         (each coarse cell holding eight fine ones), over six seconds
 *   audioSwell         -> the conduit's glow widens
 *   audioOnset         -> light pulses run along the line
 *
 * Knobs: glowP (the conduit's glow), lookP (how far ahead the eye looks), hueP.  Distinct from
 * HilbertSpaceFillingCurveZoom, which is flat.
//@params glowP lookP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell audioOnset
//@body
/**  The cell of a Hilbert index (Skilling: spread the index's bits over three words, then undo the Gray code and
 * the turns).
 *
 * @param h  The index, 0 .. 8^B - 1. (in)
 * @param B  The order (bits per axis, at most 4). (in)
 *
 * @return
 *   The cell.
 **/
ivec3 hilbertCell(int h, int B)
{
    ivec3 X = ivec3(0);
    for (int j = 0; j < 4; ++j) {
        if (j >= B) break;
        for (int i = 0; i < 3; ++i) X[i] |= ((h >> (3 * B - 1 - (j * 3 + i))) & 1) << (B - 1 - j);
    }
    int t = X.z >> 1;
    X.z ^= X.y;
    X.y ^= X.x;
    X.x ^= t;
    for (int k = 1; k < 4; ++k) {
        if (k >= B) break;
        int Q = 1 << k, P = Q - 1;
        for (int i = 2; i >= 0; --i) {
            if ((X[i] & Q) != 0) X.x ^= P;
            else {
                int tt = (X.x ^ X[i]) & P;
                X.x ^= tt;
                X[i] ^= tt;
            }
        }
    }
    return X;
}

/**  The Hilbert index of a cell (the inverse of hilbertCell()).
 *
 * @param X  The cell, each axis 0 .. 2^B - 1. (in)
 * @param B  The order. (in)
 *
 * @return
 *   The index.
 **/
int hilbertIndex(ivec3 X, int B)
{
    for (int k = 3; k >= 1; --k) {
        if (k > B - 1) continue;
        int Q = 1 << k, P = Q - 1;
        for (int i = 0; i < 3; ++i) {
            if ((X[i] & Q) != 0) X.x ^= P;
            else {
                int tt = (X.x ^ X[i]) & P;
                X.x ^= tt;
                X[i] ^= tt;
            }
        }
    }
    X.y ^= X.x;
    X.z ^= X.y;
    int t = 0;
    for (int k = 3; k >= 1; --k) {
        if (k > B - 1) continue;
        if ((X.z & (1 << k)) != 0) t ^= (1 << k) - 1;
    }
    X ^= ivec3(t);
    int h = 0;
    for (int j = 0; j < 4; ++j) {
        if (j >= B) break;
        for (int i = 0; i < 3; ++i) h = (h << 1) | ((X[i] >> (B - 1 - j)) & 1);
    }
    return h;
}

/**  A cell of the endless curve: the blocks follow each other along x, each joining the last one's end.
 *
 * @param g  The global index (any whole number). (in)
 * @param B  The order. (in)
 *
 * @return
 *   The cell's centre, in cells of the order's size.
 **/
vec3 curveCell(float g, int B)
{
    float n = exp2(float(3 * B));
    float blk = floor(g / n);
    return vec3(hilbertCell(int(g - blk * n), B)) + vec3(blk * exp2(float(B)), 0.0, 0.0) + 0.5;
}

/**  The distance to a segment.
 *
 * @param x  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec3 x, vec3 a, vec3 b)
{
    vec3 ab = b - a;
    return length(x - a - ab * clamp(dot(x - a, ab) / dot(ab, ab), 0.0, 1.0));
}

/**  The distance to the curve inside the point's own cell: the two half segments from the cell's centre toward the
 * cells before and after it.
 *
 * @param x  The point, in cells of the order's size. (in)
 * @param B  The order. (in)
 * @param g  Returns the cell's global index. (out)
 *
 * @return
 *   The distance (in cells), or a large value outside the blocks' slab.
 **/
float curveDist(vec3 x, int B, out float g)
{
    float side = exp2(float(B));
    vec3 c = floor(x);
    g = 0.0;
    if (c.y < 0.0 || c.z < 0.0 || c.y >= side || c.z >= side) return 4.0;
    float blk = floor(c.x / side);
    vec3 loc = c - vec3(blk * side, 0.0, 0.0);
    g = blk * exp2(float(3 * B)) + float(hilbertIndex(ivec3(loc), B));
    vec3 m = c + 0.5;
    vec3 a = curveCell(g - 1.0, B), b = curveCell(g + 1.0, B);
    return min(segD(x, m, 0.5 * (m + a)), segD(x, m, 0.5 * (m + b)));
}

/**  The ride's place: a uniform cubic B-spline through the fine curve's cell centres.
 *
 * @param s  The ride's parameter (cells). (in)
 *
 * @return
 *   The point.
 **/
vec3 ridePoint(float s)
{
    float g = floor(s), u = s - g;
    vec3 p0 = curveCell(g - 1.0, 4), p1 = curveCell(g, 4), p2 = curveCell(g + 1.0, 4), p3 = curveCell(g + 2.0, 4);
    float u2 = u * u, u3 = u2 * u;
    return (p0 * (1.0 - u) * (1.0 - u) * (1.0 - u) + p1 * (3.0 * u3 - 6.0 * u2 + 4.0)
            + p2 * (-3.0 * u3 + 3.0 * u2 + 3.0 * u + 1.0) + p3 * u3) / 6.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float s = 0.5 * sceneTime + 2.2 * audioAdvance + 40.0;
    vec3 ro = ridePoint(s);
    vec3 at = ridePoint(s + 1.2 + 1.2 * clamp(lookP, 0.0, 1.0));
    vec3 fw = normalize(at - ro);
    vec3 rt = normalize(cross(fw, normalize(vec3(0.37, 1.0, 0.61))));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * p.y);
    float coarse = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0),
                       smoothstep(0.0, 6.0, audioSectionAge));
    float glow = (0.6 + 0.6 * clamp(glowP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float pulseRun = 0.6 * audioAdvance + 0.04 * sceneTime;
    float pulseAmp = 0.3 + 1.3 * clamp(audioOnset, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float t = 0.02;
    for (int i = 0; i < 120; ++i) {
        vec3 x = ro + rd * t;
        float gF, gC;
        float dF = curveDist(x, 4, gF) - 0.03;
        float dC = 2.0 * curveDist(0.5 * x, 3, gC) - 0.06;
        float wF = 1.0 - 0.75 * coarse, wC = 0.25 + 0.75 * coarse;
        float gf = 1.0 / (1.0 + pow(max(dF, 0.0) * 40.0, 2.0));
        float gc = 1.0 / (1.0 + pow(max(dC, 0.0) * 22.0, 2.0));
        float pulse = pow(0.5 + 0.5 * cos(6.2831853 * (gF / 24.0 - pulseRun)), 16.0);
        float fade = exp(-0.13 * t) * smoothstep(0.02, 0.3, t);
        col += (famLight(fh, fract(gF / 300.0), 0.15 + 0.5 * pulse) * gf * wF * (0.6 + pulseAmp * pulse)
                + famLight(fh, fract(gC / 40.0 + 0.5), 0.1) * gc * wC * 0.7) * glow * fade * 0.07;
        // never step past the cell's wall
        vec3 wall = (step(0.0, rd) - fract(x)) / (sign(rd) * max(abs(rd), 1e-4) + vec3(equal(rd, vec3(0.0))) * 1e-4);
        float tw = min(wall.x, min(wall.y, wall.z));
        t += clamp(0.6 * min(dF, dC), 0.01, max(tw, 0.0) + 0.01);
        if (t > 22.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}

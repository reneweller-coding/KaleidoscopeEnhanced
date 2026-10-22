//@doc
 * @brief QUASI FRACTAL GLOW TILES: a self-similar zoom into a Penrose tiling -- Robinson triangles split again and
 * again by the golden ratio -- of which only the edges of the splitting glow, every level in its own shade, the
 * coarse levels fading out as they grow past the frame and the fine ones fading in as they come into view.  The
 * point finds its triangle level by level (the child it lies in, Preshing's split rules); around the centre the
 * pattern repeats itself after four splits, larger by phi^4, so the zoom wraps without a seam.  One colour family
 * from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the zoom (integrated): a level deeper every few seconds of drive
 *   audioOnset   -> one level of the splitting flares
 *   audioSwell   -> the edges' glow widens
 *
 * Knobs: lineP (the edges' width), depthP (how many levels show at once), hueP.
//@params lineP depthP
//@audio audioOnset audioSwell
//@body
/**  How far inside a triangle a point is: the smallest of its three barycentric coordinates.
 *
 * @param p  The point. (in)
 * @param a  A corner. (in)
 * @param b  A corner. (in)
 * @param c  A corner. (in)
 *
 * @return
 *   Positive inside, negative outside.
 **/
float inside3(vec2 p, vec2 a, vec2 b, vec2 c)
{
    vec2 v0 = b - a, v1 = c - a, v2 = p - a;
    float den = v0.x * v1.y - v1.x * v0.y;
    float v = (v2.x * v1.y - v1.x * v2.y) / den;
    float w = (v0.x * v2.y - v2.x * v0.y) / den;
    return min(min(v, w), 1.0 - v - w);
}

/**  The distance to a triangle's sides.
 *
 * @param p  The point. (in)
 * @param a  A corner. (in)
 * @param b  A corner. (in)
 * @param c  A corner. (in)
 *
 * @return
 *   The distance.
 **/
float sides3(vec2 p, vec2 a, vec2 b, vec2 c)
{
    vec2 ab = b - a, bc = c - b, ca = a - c;
    float d1 = length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
    float d2 = length(p - b - bc * clamp(dot(p - b, bc) / dot(bc, bc), 0.0, 1.0));
    float d3 = length(p - c - ca * clamp(dot(p - c, ca) / dot(ca, ca), 0.0, 1.0));
    return min(d1, min(d2, d3));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float PHI = 1.6180340;
    const float PERIOD = 6.8541020;                              // phi^4: four splits
    float zoomT = 0.04 * sceneTime + 0.18 * audioAdvance;        // in periods
    float u = fract(zoomT), cyc = floor(zoomT);
    float view = 1.2 * pow(PERIOD, -u);                          // the world's size of the screen height
    vec2 z = p * view;
    float px = view / resolution.y;
    float lw = (1.0 + 1.2 * clamp(lineP, 0.0, 1.0)) * (0.9 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float keep = 0.25 + 0.35 * clamp(depthP, 0.0, 1.0);          // the coarsest size still shown (screen heights)
    float flare = clamp(audioOnset, 0.0, 1.0);
    // the sun: ten thin triangles round the centre, radius 8 (larger than any view)
    int col = 0;
    vec2 A = vec2(0.0), B = vec2(0.0), C = vec2(0.0);
    float bestIn = -1e9;
    for (int i = 0; i < 10; ++i) {
        vec2 b = 8.0 * vec2(cos(float(2 * i - 1) * 0.3141593), sin(float(2 * i - 1) * 0.3141593));
        vec2 c = 8.0 * vec2(cos(float(2 * i + 1) * 0.3141593), sin(float(2 * i + 1) * 0.3141593));
        if ((i & 1) == 0) { vec2 tmp = b; b = c; c = tmp; }
        float in_ = inside3(z, vec2(0.0), b, c);
        if (in_ > bestIn) { bestIn = in_; A = vec2(0.0); B = b; C = c; }
    }
    vec3 light = vec3(0.0);
    float size = 8.0;
    for (int k = 1; k < 16; ++k) {
        // split the triangle and keep the child the point lies in
        vec2 a0, b0, c0, a1, b1, c1, a2, b2, c2;
        int k0, k1, k2, n;
        if (col == 0) {
            vec2 P = A + (B - A) / PHI;
            a0 = C; b0 = P; c0 = B; k0 = 0;
            a1 = P; b1 = C; c1 = A; k1 = 1;
            n = 2;
        } else {
            vec2 Q = B + (A - B) / PHI, R = B + (C - B) / PHI;
            a0 = R; b0 = C; c0 = A; k0 = 1;
            a1 = Q; b1 = R; c1 = B; k1 = 1;
            a2 = R; b2 = Q; c2 = A; k2 = 0;
            n = 3;
        }
        float i0 = inside3(z, a0, b0, c0), i1 = inside3(z, a1, b1, c1), i2 = n == 3 ? inside3(z, a2, b2, c2) : -1e9;
        if (i0 >= i1 && i0 >= i2) { A = a0; B = b0; C = c0; col = k0; }
        else if (i1 >= i2) { A = a1; B = b1; C = c1; col = k1; }
        else { A = a2; B = b2; C = c2; col = k2; }
        size /= PHI;
        // this level's edges, faded in as they come into view and out as they grow past it
        float s = size / view;
        float wgt = smoothstep(4.0 * px / view, 30.0 * px / view, s) * (1.0 - smoothstep(keep, 2.5 * keep, s));
        if (wgt <= 0.0 && s < 4.0 * px / view) break;
        float d = sides3(z, A, B, C);
        float g = exp(-pow(d / (px * lw), 2.0)) + 0.1 * exp(-d / (px * lw * 8.0));
        float lvl = float(k) + 4.0 * cyc;                        // the level's lasting number (the zoom wraps by 4)
        float fl = 1.0 + 2.0 * flare * step(0.75, fract(lvl * 0.25));
        light += famLight(fh, fract(0.137 * lvl), 0.3 * g) * g * wgt * fl * 0.55;
    }
    light += famCol(fh, 0.5) * 0.012;
    finish(light);
}

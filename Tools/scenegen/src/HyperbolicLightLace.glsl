//@doc
 * @brief HYPERBOLIC LIGHT LACE: a hyperbolic {p,q} tiling of the Poincare disc of which only the geodesic edges
 * remain, a lace of light that grows ever finer toward the rim; the disc streams without end -- a hyperbolic
 * translation along a line through the centre, which after twice the distance to an edge's middle maps the tiling
 * onto itself (p even), so the flow wraps without a seam.  A point is folded into the fundamental triangle by the
 * p-fold mirrors and the inversion in the edge's circle; the inversions' stretch, kept along, turns the distance to
 * that circle into the distance on screen, so the lace is equally fine everywhere.  The screen's corners beyond the
 * rim are folded in by the inversion in the rim.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section turns to another tiling ({4,5}, {6,4}, {8,3}, {4,6}), over six seconds,
 *                         the light cross-faded
 *   audioAdvance       -> the stream (integrated)
 *   audioSwell         -> the lace's threads widen
 *
 * Knobs: laceP (the threads' width), turnP (the stream's direction turning), hueP.  Distinct from the hyperbolic
 * scenes that fill the tiles.
//@params laceP turnP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The {p,q} of a step in the cycle {4,5}, {6,4}, {8,3}, {4,6} (p always even).
 *
 * @param k  The step. (in)
 *
 * @return
 *   (p, q).
 **/
vec2 tilingPQ(float k)
{
    float m = mod(max(k, 0.0), 4.0);
    return m < 0.5 ? vec2(4.0, 5.0) : m < 1.5 ? vec2(6.0, 4.0) : m < 2.5 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
}

/**  The lace's distance on screen for one tiling: stream, fold, and measure to the edge circle.
 *
 * @param z0     The point in the disc. (in)
 * @param pq     The tiling. (in)
 * @param flow   The stream's distance (hyperbolic). (in)
 * @param dir    The stream's direction (angle). (in)
 *
 * @return
 *   The distance on screen to the nearest edge.
 **/
float laceDist(vec2 z0, vec2 pq, float flow, float dir)
{
    float a = 3.14159265 / pq.x;
    float cq = cos(3.14159265 / pq.y), sa = sin(a);
    float R = 1.0 / sqrt(max(cq * cq / (sa * sa) - 1.0, 1e-4));
    vec2 cc = vec2(R * cq / sa, 0.0);
    // the edge's middle on the x axis, its hyperbolic distance d0; the stream wraps after 2 d0
    float xm = cc.x - R;
    float d0 = log((1.0 + xm) / (1.0 - xm));                     // 2 artanh(xm)
    float s = mod(flow, 2.0 * d0);
    float t = tanh(0.5 * s);
    // the translation along the direction dir: rotate, translate along x by t, rotate back
    vec2 z = rot2(dir) * z0;
    vec2 nu = z + vec2(t, 0.0), de = vec2(1.0 + t * z.x, t * z.y);
    float scale = (1.0 - t * t) / max(dot(de, de), 1e-8);
    z = vec2(nu.x * de.x + nu.y * de.y, nu.y * de.x - nu.x * de.y) / max(dot(de, de), 1e-8);
    for (int i = 0; i < 16; ++i) {
        float an = atan(z.y, z.x);
        an = a - abs(mod(an, 2.0 * a) - a);                      // mirror into [0, pi/p] (idempotent)
        z = length(z) * vec2(cos(an), sin(an));
        vec2 d = z - cc;
        float dd = dot(d, d);
        if (dd < R * R) {
            z = cc + d * (R * R / dd);
            scale *= R * R / dd;
        }
    }
    return abs(length(z - cc) - R) / scale;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    vec2 z = p * 2.0;
    float r2 = dot(z, z);
    float outside = step(1.0, r2);
    if (r2 > 1.0) z /= r2;                                       // the corners beyond the rim, folded in
    vec2 pqA = tilingPQ(audioSectionPrev), pqB = tilingPQ(audioSectionId);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float flow = 0.06 * sceneTime + 0.3 * audioAdvance;
    float dir = 0.4 + (0.1 + 0.3 * clamp(turnP, 0.0, 1.0)) * sin(0.02 * sceneTime);
    float px = 2.0 / resolution.y * (outside > 0.5 ? 1.0 / r2 : 1.0);   // a pixel in the disc's units
    float lw = (1.0 + 1.5 * clamp(laceP, 0.0, 1.0)) * (0.9 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float dA = laceDist(z, pqA, flow, dir), dB = laceDist(z, pqB, flow, dir);
    float gA = exp(-pow(dA / (px * lw), 2.0)) + 0.12 * exp(-dA / (px * lw * 8.0));
    float gB = exp(-pow(dB / (px * lw), 2.0)) + 0.12 * exp(-dB / (px * lw * 8.0));
    float rim = 1.0 - smoothstep(0.86, 1.0, length(z));          // the finest lace near the rim melts into a glow
    vec3 col = famLight(fh, 0.3, 0.3 * gA) * gA * (1.0 - m) + famLight(fh, 0.6, 0.3 * gB) * gB * m;
    col = col * rim + famCol(fh, 0.45) * (1.0 - rim) * 0.15;
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 2.52, 1.00, 0.00, fh));
}

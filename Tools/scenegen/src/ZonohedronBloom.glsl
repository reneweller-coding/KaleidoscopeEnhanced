//@doc
 * @brief ZONOHEDRON BLOOM: a flight through a space packed full of rhombic dodecahedra -- they fill space without gaps,
 * the cells round the points of a face-centred cubic lattice -- drawn only by their glowing edges, every cell opening
 * and closing like a blossom: as the music swells the cells draw in toward their centres, so gaps open between them,
 * and close again.  Each step of the ray finds the nearest lattice point (round every coordinate, then fix the parity
 * by moving the worst-rounded one), folds its offset into one octant and measures the three edges there, scaled by
 * the cell's opening; the edges' glow is summed along the ray.  The edges are shades of one colour family from the
 * photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the cells open and close: they draw in toward their centres
 *   audioAdvance -> the flight (integrated)
 *
 * Knobs: cellP (the cells' size), edgeP (the edges' width), hueP.
//@params cellP edgeP
//@audio audioSwell
//@body
/**  The nearest point of the face-centred cubic lattice (integer points with an even coordinate sum).
 *
 * @param x  The place. (in)
 *
 * @return
 *   The lattice point.
 **/
vec3 fccNearest(vec3 x)
{
    vec3 r = floor(x + 0.5);
    if (mod(r.x + r.y + r.z, 2.0) > 0.5) {
        vec3 e = x - r;
        vec3 ae = abs(e);
        if (ae.x >= ae.y && ae.x >= ae.z) r.x += sign(e.x);
        else if (ae.y >= ae.z) r.y += sign(e.y);
        else r.z += sign(e.z);
    }
    return r;
}

/**  The distance from a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  The segment's start. (in)
 * @param b  The segment's end. (in)
 *
 * @return
 *   The distance.
 **/
float seg3(vec3 p, vec3 a, vec3 b)
{
    vec3 ab = b - a, ap = p - a;
    return length(ap - ab * clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float L = 0.45 + 0.2 * clamp(cellP, 0.0, 1.0);
    float ew = 0.016 + 0.016 * clamp(edgeP, 0.0, 1.0);
    float open = 1.0 - 0.3 * clamp(audioSwell, 0.0, 1.0);
    float fly = 0.12 * sceneTime + 0.45 * audioAdvance;
    vec3 ro = vec3(0.3 * sin(0.17 * fly), 0.25 * cos(0.13 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.3));
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    rd = SKEW * rd;
    rd.xy = rot2(0.05 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 90; ++i) {
        vec3 x = (ro + rd * t) / L;
        vec3 c = fccNearest(x);
        vec3 q = abs(x - c) / open;                                  // the cell drawn in toward its centre
        float d = min(min(seg3(q, vec3(1.0, 0.0, 0.0), vec3(0.5)), seg3(q, vec3(0.0, 1.0, 0.0), vec3(0.5))),
                      seg3(q, vec3(0.0, 0.0, 1.0), vec3(0.5))) * open * L;
        float hc = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        col += famLight(fh, 0.3 + 0.4 * hc, 0.5) * exp(-pow(d / ew, 2.0)) * exp(-0.3 * t) * 0.25;
        t += 0.03 + 0.01 * t;
    }
    col += famCol(fh, 0.45) * 0.015;
    finish(col);
}

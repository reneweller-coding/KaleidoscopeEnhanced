//@doc
 * @brief ANTIPRISM KALEIDO TUNNEL: a tunnel built of antiprism rings -- every ring of the tunnel turned half a step
 * against the last, so the wall between two rings is a band of triangles pointing up and down -- and each triangle
 * is a window onto a small kaleidoscope of the photo.  Seen down the tunnel (depth 1/r, angle), a band of triangles
 * is a strip of the plane cut by zigzag lines; the triangle a point falls in is folded into its three mirrors.  The
 * rings turn with offsets that glide with the music; the windows' frames are dark.  The photo's own colours, calmed
 * toward one colour family; the far end glows.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the travel down the tunnel (integrated)
 *   audioHarmAdvance -> the rings' turn against each other glides with the chord changes
 *   audioSwell       -> the windows' light
 *
 * Knobs: sidesP (the rings' number of sides), pieceP (how much of the photo a window shows), hueP.
//@params sidesP pieceP
//@audio audioHarmAdvance audioSwell
//@body
/**  Fold a point into the equilateral triangle (side 1, centre at 0) by reflecting it across the side it lies
 * beyond, again and again.
 *
 * @param p  The point. (in)
 * @param e  Returns the distance to the nearest side. (out)
 *
 * @return
 *   The point inside the triangle.
 **/
vec2 triFold(vec2 p, out float e)
{
    const vec2 N0 = vec2(0.0, -1.0), N1 = vec2(0.8660254, 0.5), N2 = vec2(-0.8660254, 0.5);
    const float H = 0.2886751;
    for (int i = 0; i < 16; ++i) {
        float d0 = dot(p, N0) - H, d1 = dot(p, N1) - H, d2 = dot(p, N2) - H;
        float dm = max(d0, max(d1, d2));
        if (dm <= 0.0) break;
        p -= 2.0 * dm * (dm == d0 ? N0 : dm == d1 ? N1 : N2);
    }
    e = -max(dot(p, N0) - H, max(dot(p, N1) - H, dot(p, N2) - H));
    return p;
}

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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float sides = floor(6.0 + 6.0 * clamp(sidesP, 0.0, 1.0));
    float sz = 0.3 + 0.4 * clamp(pieceP, 0.0, 1.0);
    float travel = 0.12 * sceneTime + 0.5 * audioAdvance;
    float offs = 0.5 + 0.35 * sin(0.7 * h);                       // the rings' turn against each other (in cells)
    float r = max(length(p), 1e-4);
    float depth = 0.3 / r + travel;                               // one ring per unit of depth
    float ring = floor(depth);
    float a = atan(p.y, p.x) / 6.2831853 * sides + offs * mod(ring, 2.0);   // every other ring turned against the last
    // the band of triangles: in each cell (around x, depth y) the diagonal splits up- and down-pointing triangles
    vec2 cell = vec2(a, depth);
    vec2 cid = floor(cell);
    vec2 f = fract(cell);
    float up = step(f.x, f.y);                                    // which side of the diagonal
    // the triangle's own frame: centre at its centroid, scaled to side 1
    vec2 cen = up > 0.5 ? vec2(1.0, 2.0) / 3.0 : vec2(2.0, 1.0) / 3.0;
    vec2 local = (f - cen) * vec2(1.0, 0.8660254) * 1.4;
    if (up < 0.5) local = -local;
    float e;
    vec2 k = triFold(local, e);
    float hc = fract(sin(dot(vec2(mod(cid.x, sides), cid.y), vec2(12.9898, 78.233)) + up) * 43758.5453);
    vec3 col = tone(imgLod(k * sz + vec2(0.2 + 0.6 * hc, 0.3 + 0.4 * fract(hc * 3.7)), 0.7), fh);
    col *= (0.75 + 0.4 * clamp(audioSwell, 0.0, 1.0)) * smoothstep(0.0, 0.03, e) * smoothstep(0.0, 0.04, min(f.y, 1.0 - f.y));
    col *= smoothstep(0.015, 0.12, r);
    col += famLight(fh, 0.6, 0.7) * 0.3 * exp(-r * 18.0);
    finish(col);
}

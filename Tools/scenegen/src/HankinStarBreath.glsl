//@doc
 * @brief HANKIN STAR BREATH: Islamic star patterns made by Hankin's method, breathing: from the midpoint of every edge
 * of a tiling two rays leave at the contact angle and run until they meet their neighbours' rays, and as that angle
 * opens and closes the pattern glides through whole families of stars -- flat crosses, sharp stars, wide rosettes --
 * drawn as glowing interlaced bands on two levels, the fields between them filled with the photo.  In a regular
 * n-gon of the tiling the ray from an edge's midpoint meets its neighbour's on the line to the vertex; folding the
 * tile into a mirrored sector leaves one ray segment to measure.  The tiling changes from section to section (squares
 * or hexagons, cross-faded).  The bands are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell         -> the contact angle: the stars open and close as the music swells
 *   audioSectionId/Age -> every new section changes the underlying tiling (cross-faded over six seconds)
 *   audioAdvance       -> the pattern drifts slowly (integrated)
 *
 * Knobs: tileP (the tiles' size), bandP (the bands' width), hueP.
//@params tileP bandP
//@audio audioSwell audioSectionId audioSectionPrev audioSectionAge
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

/**  The distance to Hankin's rays in one regular n-gon of a tiling.
 *
 * @param q   The point, the polygon's centre at 0 (edge midpoints at angle 0 and every 2 pi / n). (in)
 * @param n   The number of sides. (in)
 * @param a   The apothem (the distance to the edges' midpoints). (in)
 * @param th  The contact angle between ray and edge. (in)
 *
 * @return
 *   The distance to the nearest ray segment.
 **/
float hankin(vec2 q, float n, float a, float th)
{
    float sec = 6.2831853 / n;
    float ang = abs(mod(atan(q.y, q.x) + 0.5 * sec, sec) - 0.5 * sec);
    vec2 f = length(q) * vec2(cos(ang), sin(ang));
    float tn = tan(3.14159265 / n);
    float t = a * tn / (cos(th) + sin(th) * tn);                    // where the ray meets the line to the vertex
    vec2 dir = vec2(-sin(th), cos(th));
    vec2 pq = f - vec2(a, 0.0);
    return length(pq - dir * clamp(dot(pq, dir), 0.0, t));
}

/**  The pattern of one tiling: two levels of bands.
 *
 * @param p     The place (in tiles). (in)
 * @param kind  0 squares, 1 hexagons. (in)
 * @param th    The contact angle. (in)
 * @param bw    The bands' half width (in tiles). (in)
 *
 * @return
 *   x the upper band, y its outline, z the lower band.
 **/
vec3 pattern(vec2 p, float kind, float th, float bw)
{
    vec2 q;
    float n;
    if (kind < 0.5) {
        q = fract(p) - 0.5;
        n = 4.0;
    } else {
        const vec2 R = vec2(1.0, 1.7320508);
        vec2 qa = mod(p, R) - 0.5 * R, qb = mod(p - 0.5 * R, R) - 0.5 * R;
        q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
        n = 6.0;
    }
    float d1 = hankin(q, n, 0.5, th);
    float d2 = hankin(q, n, 0.5, clamp(th + 0.3, 0.05, 1.5));
    float up = smoothstep(bw, bw * 0.6, d1);
    float rim = exp(-pow((d1 - bw) / 0.012, 2.0));
    float low = smoothstep(bw * 0.7, bw * 0.4, d2) * (1.0 - up);
    return vec3(up, rim, low);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.22 + 0.12 * clamp(tileP, 0.0, 1.0);
    float bw = 0.03 + 0.03 * clamp(bandP, 0.0, 1.0);
    float th = 0.35 + 0.75 * clamp(audioSwell, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 2.0), kB = mod(max(audioSectionId, 0.0), 2.0);
    vec2 drift = vec2(0.5, 0.2) * (0.01 * sceneTime + 0.04 * audioAdvance);
    vec2 g = p / S + drift;
    vec3 b = (1.0 - m) * pattern(g, kA, th, bw) + m * pattern(g, kB, th, bw);
    vec3 col = tone(imgLod(p * 0.5 + 0.5, 2.5), fh) * 0.45;
    col = mix(col, famCol(fh, 0.35) * 0.6, b.z);
    col = mix(col, famLight(fh, 0.6, 0.5), b.x);
    col *= 1.0 - 0.5 * b.y;
    col += famLight(fh, 0.5, 0.8) * b.y * 0.15;
    finish(col);
}

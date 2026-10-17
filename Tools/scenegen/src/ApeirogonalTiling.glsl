//@doc
 * @brief APEIROGONAL TILING: a hyperbolic tiling of the Poincare disc whose polygons have so many sides that they
 * approach apeirogons -- polygons with infinitely many corners, their edges hugging horocycles -- three, four or five
 * meeting at every corner.  The disc fills the frame's height and is mirrored in its rim beyond it; a hyperbolic
 * translation slides the net through itself, so the polygons stream from the rim, swell in the middle and shrink
 * away again.  Each polygon holds a cut of the photo, light and dark by turns like a chessboard.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes how many polygons meet at a corner (crossfaded)
 *   audioPhase      -> the net streams (integrated)
 *   audioKick       -> the edges flash (light)
 *
 * Knobs: sidesP (the polygons' sides: 7 up to 20), driftP (how fast the net streams), photoP (photo
 * share), hueP.
//@params sidesP driftP photoP
//@audio audioKick audioHarmAdvance
//@body
/**  A point of the Poincare disc folded into the fundamental triangle of the {p, q} tiling, counting the inversions.
 *
 * @param z  The point (|z| < 1). (in)
 * @param p  The polygons' sides. (in)
 * @param q  The polygons at a corner. (in)
 *
 * @return
 *   The folded point (xy), the number of reflections (z), the distance to the polygon's edge circle (w).
 **/
vec4 foldPQ(vec2 z, float p, float q)
{
    float a = 3.14159265 / p, b = 3.14159265 / q;
    float d = 1.0 / sqrt(max(1.0 - sin(a) * sin(a) / (cos(b) * cos(b)), 1e-5));   // the edge circle's centre
    float r = sqrt(max(d * d - 1.0, 0.0));
    vec2 c = vec2(d, 0.0);
    float n = 0.0;
    for (int i = 0; i < 40; ++i) {
        // fold into the sector |angle| <= a (the polygon's rotations and mirrors)
        float ang = atan(z.y, z.x), rad = length(z);
        ang = abs(mod(ang + a, 2.0 * a) - a);
        z = rad * vec2(cos(ang), sin(ang));
        vec2 v = z - c;
        float vv = dot(v, v);
        if (vv >= r * r) break;
        z = c + v * (r * r / vv);                              // invert in the edge circle: into the next polygon
        n += 1.0;
    }
    return vec4(z, n, abs(length(z - c) - r));
}

void main()
{
    vec2 p = screenP();
    vec2 z = p / 1.02;                                          // the disc spans the frame's height
    float rr = dot(z, z);
    if (rr > 1.0) z /= rr;                                      // beyond the rim: its mirror image
    if (dot(z, z) >= 0.999) z *= 0.999 / length(z);
    vec2 zd = z;
    // a hyperbolic translation along a slowly turning direction: z -> (z + a) / (1 + conj(a) z)
    float t = (0.05 + 0.15 * clamp(driftP, 0.0, 1.0)) * sceneTime + 0.02 * audioPhase;
    vec2 av = 0.8 * sin(t) * vec2(cos(0.3 * t), sin(0.3 * t));
    vec2 num = z + av;
    vec2 den = vec2(1.0, 0.0) + vec2(av.x * z.x + av.y * z.y, av.x * z.y - av.y * z.x);
    z = vec2(num.x * den.x + num.y * den.y, num.y * den.x - num.x * den.y) / dot(den, den);
    float pp = 7.0 + floor(13.0 * clamp(sidesP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float qA = 3.0 + mod(floor(h), 3.0), qB = 3.0 + mod(floor(h) + 1.0, 3.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float qq = j == 0 ? qA : qB;
        float w = j == 0 ? 1.0 - g : g;
        if (w < 0.001) continue;
        vec4 f = foldPQ(z, pp, qq);
        float hh = fract(f.z * 0.618 + 0.17);
        vec2 uv = f.xy * 0.5 + 0.5 + vec2(hh, fract(hh * 3.3)) * 0.3;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(hh + 0.03 * audioPhase);
        vec3 c = mix(tone * 1.1, photo * 1.3, 0.35 + 0.55 * clamp(photoP, 0.0, 1.0)) * (mod(f.z, 2.0) > 0.5 ? 0.5 : 1.15);
        // the edge, its width shrinking toward the rim as the disc's metric does
        float scale = 1.0 - dot(zd, zd);
        float edge = 1.0 - smoothstep(0.0, 0.012 * max(scale, 0.05), f.w);
        c = mix(c, mix(tone, vec3(1.0), 0.5) * (0.5 + 0.7 * clamp(audioKick, 0.0, 1.0)), edge * 0.7);
        col += w * c;
    }
    finish(col);
}

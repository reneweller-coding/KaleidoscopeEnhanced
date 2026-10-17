//@doc
 * @brief POLYTOPE 600-CELL SHADOW: the 600-cell -- the four-dimensional polytope of 600 tetrahedra, 120 corners and 720
 * edges -- turning in four dimensions and seen through stereographic projection, from inside: its edges are arcs of
 * circles that sweep through the whole space around the eye, the near ones thick, the far ones fine, rushing out
 * to infinity and back as the double rotation carries them through the projection's pole.  The arcs glow; the
 * photo colours them by where they lie on the three-sphere.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the double rotation in four dimensions (integrated)
 *   audioSwell      -> the edges' thickness
 *   audioKick       -> the corners flash (light)
 *
 * Knobs: spinP (the rotation's speed), thickP (the base thickness), photoP (photo share), hueP.
//@params spinP thickP photoP
//@audio audioSwell audioKick
//@body
vec4 gZ = vec4(0.0);       // the hit point on the three-sphere, before folding (for its colour)
float gVert = 0.0;         // 1 where the corner balls are nearer than the edges

/**  Folds a point of the three-sphere into the fundamental chamber of the symmetry group H4 (14400 elements): the
 * mirrors x = 0, y = 0 and two more, applied until the point lies on their positive sides.
 *
 * @param z  The point (unit length). (in)
 *
 * @return
 *   The folded point.
 **/
vec4 foldH4(vec4 z)
{
    const vec4 nC = vec4(0.0, -0.5, 0.8660254, 0.0);
    const vec4 nD = vec4(-0.809017, -0.5, -0.2886751, 0.1102641);
    for (int i = 0; i < 15; ++i) {
        z.xy = abs(z.xy);
        z -= 2.0 * min(dot(z, nC), 0.0) * nC;
        z -= 2.0 * min(dot(z, nD), 0.0) * nD;
    }
    return z;
}

/**  The angle on the three-sphere from a folded point to the half-edge that leaves a corner toward one mirror.
 *
 * @param z  The folded point (unit length). (in)
 * @param v  The corner (unit length, in the chamber). (in)
 * @param n  The mirror's unit normal. (in)
 *
 * @return
 *   The angle in radians.
 **/
float segAng(vec4 z, vec4 v, vec4 n)
{
    float zn = dot(z, n), zv = dot(z, v), nv = dot(n, v);
    vec4 m = normalize((zv - zn * nv) * v + min(0.0, zn - zv * nv) * n);
    return acos(clamp(dot(z, m), -1.0, 1.0));
}

/**  The distance estimate to the projected 600-cell's edges and corners.
 *
 * @param x    The point in space. (in)
 * @param rot  The four-dimensional rotation (two angles). (in)
 * @param rad  The edges' angular radius. (in)
 *
 * @return
 *   The distance estimate (sets gZ, gVert).
 **/
float map600(vec3 x, vec2 rot, float rad)
{
    float r2 = dot(x, x);
    vec4 z = vec4(2.0 * x, 1.0 - r2) / (1.0 + r2);              // inverse stereographic projection onto S^3
    z.xw = rot2(rot.x) * z.xw;                                  // the double rotation: two orthogonal planes
    z.yz = rot2(rot.y) * z.yz;
    gZ = z;
    vec4 f = foldH4(z);
    const vec4 v = vec4(0.0, 0.0, 0.3568221, 0.9341724);       // the corner: on three mirrors, off the fourth
    const vec4 nC = vec4(0.0, -0.5, 0.8660254, 0.0);
    float aE = segAng(f, v, nC) - rad;
    float aV = acos(clamp(dot(f, v), -1.0, 1.0)) - 1.7 * rad;
    gVert = aV < aE ? 1.0 : 0.0;
    return min(aE, aV) * 0.5 * (1.0 + r2);                      // the projection's scale: arcs grow far out
}

void main()
{
    vec2 p = screenP();
    float spin = 0.03 + 0.06 * clamp(spinP, 0.0, 1.0);
    vec2 rot = vec2(spin * sceneTime + 0.02 * audioPhase, 0.618 * spin * sceneTime + 0.013 * audioPhase);
    float rad = (0.012 + 0.012 * clamp(thickP, 0.0, 1.0)) * (0.7 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    // the eye at the projection's centre, looking about slowly
    float ya = 0.021 * sceneTime, pa = 0.3 * sin(0.017 * sceneTime);
    vec3 fw = vec3(cos(pa) * sin(ya), sin(pa), cos(pa) * cos(ya));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.3 + rt * p.x + up * p.y);
    vec3 ro = vec3(0.0);
    float t = 0.02, glow = 0.0, hit = 0.0;
    vec4 hz = vec4(0.0);
    float hv = 0.0;
    float side = map600(ro + rd * t, rot, rad) < 0.0 ? -1.0 : 1.0;   // inside a tube or a ball: march to its inner wall
    for (int i = 0; i < 90; ++i) {
        float d = side * map600(ro + rd * t, rot, rad);
        glow += 0.012 * exp(-12.0 * max(d, 0.0) / (0.3 + 0.1 * t));
        if (d < 0.0008 * (1.0 + t)) { hit = 1.0; hz = gZ; hv = gVert; break; }
        t += d * 0.8;
        if (t > 60.0) break;
    }
    vec3 tone = imgPalette(0.45 + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.3 + 0.5, 4.0) * 0.08 + tone * 0.03;
    vec3 col = bg;
    if (hit > 0.5) {
        vec3 x = ro + rd * t;
        vec2 e = vec2(0.0015 * (1.0 + t), 0.0);
        vec3 n = normalize(vec3(map600(x + e.xyy, rot, rad) - map600(x - e.xyy, rot, rad),
                                map600(x + e.yxy, rot, rad) - map600(x - e.yxy, rot, rad),
                                map600(x + e.yyx, rot, rad) - map600(x - e.yyx, rot, rad)));
        float diff = 0.35 + 0.65 * max(-side * dot(n, rd), 0.0);
        vec3 photo = imgLod(hz.xy * 0.45 + 0.5, 0.5);
        vec3 c = mix(tone * 1.2, photo * 1.4, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * diff;
        c += hv * mix(tone, vec3(1.0), 0.6) * (0.2 + 0.8 * clamp(audioKick, 0.0, 1.0)) * 0.6;
        col = mix(bg, c, exp(-0.035 * t));
    }
    col += mix(tone, vec3(1.0), 0.3) * glow;
    finish(col);
}

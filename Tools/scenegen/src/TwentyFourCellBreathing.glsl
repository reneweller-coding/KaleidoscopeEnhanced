//@doc
 * @brief TWENTY-FOUR-CELL BREATHING: the 24-cell -- the four-dimensional polytope of 24 octahedra that has no
 * counterpart in three dimensions -- and its dual, another 24-cell standing in the first one's cells, turning in four
 * dimensions and seen by stereographic projection.  On every new section the one passes into the other: its corners
 * slide along the symmetry chamber, through the runcinated form with its squares and triangles, until the dual
 * stands complete.  The edges are tubes carrying the photo; the corners are balls.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section passes between the 24-cell and its dual (gliding over four seconds)
 *   audioPhase      -> the rotation in four dimensions (integrated)
 *   audioKick       -> the corners flash (light)
 *
 * Knobs: spinP (the rotation's speed), thickP (the edges' thickness), photoP (photo share), hueP.
//@params spinP thickP photoP
//@audio audioKick audioSectionId audioSectionAge
//@body
vec4 gZ = vec4(0.0);       // the hit point on the three-sphere, before folding (for its colour)
float gVert = 0.0;         // 1 where the corner balls are nearer than the edges

/**  Folds a point of the three-sphere into the fundamental chamber of the symmetry group F4 (1152 elements).
 *
 * @param z  The point (unit length). (in)
 *
 * @return
 *   The folded point.
 **/
vec4 foldF4(vec4 z)
{
    const vec4 n0 = vec4(0.0, 0.7071068, -0.7071068, 0.0);
    const vec4 n1 = vec4(0.0, 0.0, 0.7071068, -0.7071068);
    const vec4 n3 = vec4(0.5, -0.5, -0.5, -0.5);
    for (int i = 0; i < 6; ++i) {
        z -= 2.0 * min(dot(z, n0), 0.0) * n0;
        z -= 2.0 * min(dot(z, n1), 0.0) * n1;
        z.w = abs(z.w);
        z -= 2.0 * min(dot(z, n3), 0.0) * n3;
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
 *   The angle in radians (the angle to the corner when the corner lies on the mirror).
 **/
float segAng(vec4 z, vec4 v, vec4 n)
{
    float zn = dot(z, n), zv = dot(z, v), nv = dot(n, v);
    vec4 m = normalize((zv - zn * nv) * v + min(0.0, zn - zv * nv) * n);
    return acos(clamp(dot(z, m), -1.0, 1.0));
}

/**  The distance estimate to the projected polytope's edges and corners.
 *
 * @param x    The point in space. (in)
 * @param rot  The four-dimensional rotation (two angles). (in)
 * @param v    The corner in the chamber (unit length). (in)
 * @param rad  The edges' angular radius. (in)
 *
 * @return
 *   The distance estimate (sets gZ, gVert).
 **/
float map24(vec3 x, vec2 rot, vec4 v, float rad)
{
    x *= 0.7;
    float r2 = dot(x, x);
    vec4 z = vec4(2.0 * x, 1.0 - r2) / (1.0 + r2);              // inverse stereographic projection onto S^3
    z.xw = rot2(rot.x) * z.xw;
    z.yz = rot2(rot.y) * z.yz;
    gZ = z;
    vec4 f = foldF4(z);
    float aE = min(min(segAng(f, v, vec4(0.0, 0.7071068, -0.7071068, 0.0)), segAng(f, v, vec4(0.0, 0.0, 0.7071068, -0.7071068))),
                   min(segAng(f, v, vec4(0.0, 0.0, 0.0, 1.0)), segAng(f, v, vec4(0.5, -0.5, -0.5, -0.5)))) - rad;
    float aV = acos(clamp(dot(f, v), -1.0, 1.0)) - 1.8 * rad;
    gVert = aV < aE ? 1.0 : 0.0;
    return min(aE, aV) * 0.5 * (1.0 + r2) / 0.7;
}

void main()
{
    vec2 p = screenP();
    float spin = 0.03 + 0.06 * clamp(spinP, 0.0, 1.0);
    vec2 rot = vec2(spin * sceneTime + 0.02 * audioPhase, 0.618 * spin * sceneTime + 0.013 * audioPhase);
    float rad = 0.03 + 0.03 * clamp(thickP, 0.0, 1.0);
    // the corner: the 24-cell's (on all mirrors but the first) or its dual's (all but the last), gliding by section
    float k = max(audioSectionId, 0.0);
    float now = mod(k, 2.0), before = 1.0 - now;
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    float tm = mix(before, now, m);
    vec4 v = normalize(mix(vec4(0.7071068, 0.7071068, 0.0, 0.0), vec4(1.0, 0.0, 0.0, 0.0), tm));
    // the eye circles the projection slowly
    float ya = 0.025 * sceneTime, pa = 0.35 * sin(0.019 * sceneTime);
    vec3 ro = 3.6 * vec3(cos(pa) * sin(ya), sin(pa), cos(pa) * cos(ya));
    vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.5 + rt * p.x + up * p.y);
    float t = 0.0, glow = 0.0, hit = 0.0, hv = 0.0;
    vec4 hz = vec4(0.0);
    float side = map24(ro, rot, v, rad) < 0.0 ? -1.0 : 1.0;    // inside a tube or a ball: march to its inner wall
    for (int i = 0; i < 90; ++i) {
        float d = side * map24(ro + rd * t, rot, v, rad);
        glow += 0.01 * exp(-10.0 * max(d, 0.0));
        if (d < 0.0008 * (1.0 + t)) { hit = 1.0; hz = gZ; hv = gVert; break; }
        t += d * 0.8;
        if (t > 40.0) break;
    }
    vec3 tone = imgPalette(0.3 + 0.2 * tm + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.4 + 0.5, 3.0) * 0.18 + tone * 0.04;
    vec3 col = bg;
    if (hit > 0.5) {
        vec3 x = ro + rd * t;
        vec2 e = vec2(0.0015 * (1.0 + t), 0.0);
        vec3 n = normalize(vec3(map24(x + e.xyy, rot, v, rad) - map24(x - e.xyy, rot, v, rad),
                                map24(x + e.yxy, rot, v, rad) - map24(x - e.yxy, rot, v, rad),
                                map24(x + e.yyx, rot, v, rad) - map24(x - e.yyx, rot, v, rad)));
        vec3 l = normalize(vec3(0.5, 0.8, 0.3));
        float diff = 0.3 + 0.7 * max(side * dot(n, l), 0.0);
        float spec = pow(max(dot(reflect(rd, n), l), 0.0), 24.0);
        vec3 photo = imgLod(hz.xy * 0.45 + 0.5, 0.5);
        vec3 c = mix(tone * 1.2, photo * 1.4, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * diff + spec * 0.4;
        c += hv * mix(tone, vec3(1.0), 0.6) * (0.2 + 0.8 * clamp(audioKick, 0.0, 1.0)) * 0.5;
        col = mix(bg, c, exp(-0.05 * max(t - 2.0, 0.0)));
    }
    col += tone * glow;
    finish(col);
}

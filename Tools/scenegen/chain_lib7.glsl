// ---- round 7 (23.10.2026): forty more transforms for the flat chain labs ----
// ---- variants (24.10.2026): a hundred looks for every class of this round ----
/** The variant of the class in use: -1 for variant 0 (the original look), else a hash of its number, 0..1 (set by the stage
 * through chainSetVar() before it calls a class). */
float gVar = 0.0;
/** The variant's first four pseudo-random numbers, 0..1 (all 0.5 for variant 0). */
vec4 gVa = vec4(0.5);
/** The variant's last four pseudo-random numbers, 0..1 (all 0.5 for variant 0). */
vec4 gVb = vec4(0.5);
/**  The variant's pseudo-random number of one stream.
 *
 * @param j  The stream, a whole number 0..7. (in)
 *
 * @return
 *   0..1; 0.5 for variant 0, so that vv() gives the middle of its range.
 **/
float vr(float j) { int i = int(j); return i < 4 ? gVa[i] : gVb[i - 4]; }
/**  A constant of the class, set by the variant inside a range.
 *
 * @param j   The stream. (in)
 * @param lo  The lower end. (in)
 * @param hi  The upper end; variant 0 gives the middle. (in)
 *
 * @return
 *   The constant.
 **/
float vv(float j, float lo, float hi) { return mix(lo, hi, vr(j)); }
/**  A choice of the class, set by the variant.
 *
 * @param j  The stream. (in)
 * @param n  The number of choices. (in)
 *
 * @return
 *   0 .. n-1; 0 (the original choice) for variant 0.
 **/
float vk(float j, float n) { return gVar < 0.0 ? 0.0 : min(floor(vr(j) * n), n - 1.0); }
/**  Sets the variant a stage's sub-variant stands for (gVar, gVa, gVb): the first hundredth of 0..1 is variant 0, the
 * original look.
 *
 * @param v  The sub-variant 0..1 of the stage. (in)
 * @param k  The class's branch number. (in)
 **/
void chainSetVar(float v, int k)
{
    float vi = floor(clamp(v, 0.0, 0.9999) * 100.0);
    if (vi < 0.5) { gVar = -1.0; gVa = vec4(0.5); gVb = vec4(0.5); return; }
    gVar = fract(sin(vi * 12.9898 + float(k) * 78.233) * 43758.5453);
    gVa = fract(sin(gVar * 127.1 + 17.0 + vec4(0.0, 311.7, 623.4, 935.1)) * 43758.5453);
    gVb = fract(sin(gVar * 127.1 + 17.0 + vec4(1246.8, 1558.5, 1870.2, 2181.9)) * 43758.5453);
}
/**  Stage A: coordinate maps ------------------------------------------------------------------------------------ Tinkerbell map: x' = x^2 - y^2 + a x + b y, y' = 2 x y + c x + d y, the strange attractor's loops.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param steps  The number of steps. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tTinkerbell(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * vv(1.0, 1.7, 2.3);
    float a = vv(2.0, 0.82, 0.98) + 0.08 * sin(t * 0.2), b = vv(3.0, -0.66, -0.54) + 0.05 * cos(t * 0.17);
    float cx = vv(4.0, 1.4, 2.6), cy = vv(5.0, 0.2, 0.8);
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= steps) break;
        p = vec2(p.x * p.x - p.y * p.y + a * p.x + b * p.y, 2.0 * p.x * p.y + cx * p.x + cy * p.y);
        p *= 1.0 / (1.0 + 0.12 * dot(p, p));
    }
    return c + p * vv(6.0, 0.4, 0.6);
}
/**  Lozi map: the piecewise linear Henon, |x| for x^2: straight kinks instead of soft loops.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param steps  The number of steps. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLozi(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * vv(1.0, 1.9, 3.1);
    float a = vv(2.0, 1.4, 1.8) + 0.12 * sin(t * 0.2), b = vv(3.0, 0.3, 0.7);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; p = vec2(1.0 - a * abs(p.x) + b * p.y, p.x); }
    return c + p * vv(4.0, 0.3, 0.5);
}
/**  Hopalong (Martin): x' = y - sgn(x) sqrt|b x - c|, y' = a - x.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param a      The first parameter. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tHopalong(vec2 uv, vec2 c, float a, float t)
{
    vec2 p = (uv - c) * vv(1.0, 2.4, 3.6);
    float bb = vv(2.0, 0.7, 1.3), cc0 = vv(3.0, 0.25, 0.55);
    for (int i = 0; i < 3; ++i) p = vec2(p.y - sign(p.x) * sqrt(abs(bb * p.x - (cc0 + 0.2 * sin(t * 0.15)))), a - p.x);
    return c + p * vv(4.0, 0.24, 0.36);
}
/**  Gingerbreadman map: x' = 1 - y + |x|, y' = x.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tGingerbread(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * vv(1.0, 3.2, 4.8);
    float o = vv(2.0, 0.6, 1.4);
    for (int i = 0; i < 4; ++i) p = vec2(o - p.y + k * abs(p.x), p.x);
    return c + p * (vv(3.0, 0.13, 0.19) + 0.02 * sin(t * 0.2));
}
/**  Bogdanov map: the normal form of the Bogdanov-Takens bifurcation, spirals about a fixed point.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tBogdanov(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * vv(1.0, 2.0, 3.0);
    float mu = vv(2.0, 0.04, 0.16) + 0.05 * sin(t * 0.2), o = vv(3.0, 0.6, 1.4);
    for (int i = 0; i < 3; ++i) { p.y += k * p.x * (p.x - o) + mu * p.x * p.y; p.x += p.y; }
    return c + p * vv(4.0, 0.36, 0.54);
}
/**  Lemniscate coordinates: bipolar coordinates of z^2 with the poles +-a^2: figures of eight, the poles in the ears.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param a      The first parameter. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLemniscate(vec2 uv, vec2 c, float a, float t)
{
    vec2 z = (uv - c) * vv(1.0, 2.4, 3.6);
    vec2 w = cmul(z, z);
    float a2 = a * a * vv(2.0, 0.7, 1.3);
    vec2 q = cdiv(w - vec2(a2, 0.0), w + vec2(a2, 0.0));
    return vec2(0.5 * log(max(dot(q, q), 1e-6)) * vv(3.0, 0.7, 1.1) + 0.05 * t, atan(q.y, q.x) / 3.14159265 * vv(4.0, 1.5, 2.5));
}
/**  Schwarz-Christoffel: the disc onto a regular hexagon, w = z * integral_0^1 (1 - (s z)^6)^(-1/3) ds; outside the circle of radius 0.9 the plane is inverted into it (continuous on the circle).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tScHexagon(vec2 uv, vec2 c, float scale, float t)
{
    float nn = gVar < 0.0 ? 6.0 : 3.0 + vk(1.0, 6.0);
    vec2 z = rot2(0.1 * sin(t * 0.2) + vv(2.0, -0.3, 0.3)) * (uv - c) * scale;
    float r = length(z);
    if (r > 0.9) z *= 0.81 / (r * r);
    vec2 w = vec2(0.0);
    for (int i = 0; i < 8; ++i) {
        float s = (float(i) + 0.5) / 8.0;
        vec2 q = z * s;
        float qr = length(q), qa = atan(q.y, q.x);
        vec2 qn = pow(qr, nn) * vec2(cos(nn * qa), sin(nn * qa));
        vec2 d = vec2(1.0, 0.0) - qn;
        float m = max(length(d), 1e-3), ph = atan(d.y, d.x);
        w += pow(m, -2.0 / nn) * vec2(cos(2.0 * ph / nn), -sin(2.0 * ph / nn));
    }
    return c + cmul(z, w / 8.0) * vv(3.0, 0.45, 0.65);
}
/**  Rose fold: the polar mirror at r = R(theta) of a k-petal rose, petals folded into each other.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tRoseFold(vec2 uv, vec2 c, float k, float t)
{
    float kk = k + vk(5.0, 4.0);
    vec2 p = rot2(vv(6.0, -0.5, 0.5)) * (uv - c) * vv(1.0, 2.4, 3.6);
    float r = length(p), sec = 6.2831853 / kk;
    float an = abs(mod(atan(p.y, p.x) + 0.1 * t, sec) - 0.5 * sec);
    float R = vv(2.0, 0.2, 0.5) + (1.0 - vv(2.0, 0.2, 0.5)) * pow(abs(cos(0.5 * kk * an)), vv(3.0, 0.5, 1.5));
    float rr = R * abs(mod(r / R + 1.0, 2.0) - 1.0);
    return c + rr * vec2(cos(an), sin(an)) * vv(4.0, 0.3, 0.5);
}
/**  Epitrochoid unrolling: the point moves as the pen of a gear rolling in a ring: rho (e^{i th} - d e^{i (m+1) th}).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param m      A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tEpitrochoid(vec2 uv, vec2 c, float m, float t)
{
    vec2 d = uv - c;
    float rho = length(d), th = atan(d.y, d.x) + 0.1 * t;
    float dd = vv(1.0, 0.5, 1.0) + 0.15 * sin(t * 0.2);
    float mm = m + vk(2.0, 3.0);
    return c + rho * (cexpi(th) - dd / (mm + 1.0) * cexpi((mm + 1.0) * th)) * vv(3.0, 0.9, 1.3);
}
/**  Modular lambda function: lambda = (theta_2 / theta_3)^4 of the nome q = exp(i pi tau), three cusps 0, 1, infinity.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLambda(vec2 uv, vec2 c, float scale, float t)
{
    vec2 tau = (uv - c) * scale + vec2(vv(1.0, -0.3, 0.3) + 0.5 * sin(t * 0.1), 0.0);
    tau.y = abs(tau.y) + vv(2.0, 0.1, 0.3);
    vec2 q = exp(-3.14159265 * tau.y) * cexpi(3.14159265 * tau.x);
    vec2 q2 = cmul(q, q), q4 = cmul(q2, q2), q9 = cmul(q4, cmul(q4, q));
    vec2 th3 = vec2(1.0, 0.0) + 2.0 * (q + q4 + q9);
    vec2 qq = exp(-0.7853982 * tau.y) * cexpi(0.7853982 * tau.x);
    vec2 th2 = 2.0 * cmul(qq, vec2(1.0, 0.0) + q2 + cmul(q4, q2));
    vec2 r = cdiv(th2, th3);
    vec2 l = cmul(cmul(r, r), cmul(r, r));
    return c + l * vv(3.0, 0.35, 0.65) / (1.0 + vv(4.0, 0.2, 0.4) * length(l));
}
/**  Ford circles: the point is inverted in the circle that holds it (p/q, radius 1/(2 q^2)), mirror-periodic along the axis.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param rank   A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFord(vec2 uv, vec2 c, float rank, float t)
{
    float ys = vv(1.0, 0.65, 0.95), rs = vv(2.0, 0.42, 0.58);
    vec2 z = vec2(abs(fract((uv.x - c.x + 0.5) * 0.5) * 2.0 - 1.0), abs(fract((uv.y - c.y + 0.5) * 0.5) * 2.0 - 1.0) * ys);
    z.x += vv(3.0, 0.02, 0.08) * sin(t * 0.2);
    for (int round = 0; round < 2; ++round) {
        for (int i = 0; i < 9; ++i) {
            float q = i < 2 ? 1.0 : (i < 3 ? 2.0 : (i < 5 ? 3.0 : (i < 7 ? 4.0 : 5.0)));
            float p0 = i == 0 ? 0.0 : (i == 1 ? 1.0 : (i == 2 ? 0.5 : (i == 3 ? 0.3333 : (i == 4 ? 0.6667 : (i == 5 ? 0.25 : (i == 6 ? 0.75 : (i == 7 ? 0.2 : 0.4)))))));
            if (float(i) >= 3.0 + 2.0 * rank) break;
            float R = rs / (q * q);
            vec2 ctr = vec2(p0, R), d = z - ctr;
            float dd = dot(d, d);
            if (dd < R * R) z = ctr + d * (R * R / max(dd, 1e-5));
        }
    }
    return vec2(z.x, z.y / ys);
}
/**  Square root with its branch cut: |sqrt(z)| in both coordinates, so the two sheets agree on the cut.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tSqrtSheet(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = rot2(vv(1.0, 0.1, 0.3) * t + vv(4.0, -1.0, 1.0)) * (uv - c) * scale;
    float r = length(z), th = atan(z.y, z.x);
    float e = vv(2.0, 0.34, 0.66);
    vec2 w = pow(r, e) * vec2(cos(e * th), sin(e * th));
    return c + abs(w) * vv(3.0, 0.55, 0.85);
}
/**  Gamma function's poles: the principal parts of Gamma at 0, -1, -2 ... (residues (-1)^k / k!), funnels in the plane.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param shift  A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tGammaPoles(vec2 uv, vec2 c, float shift, float t)
{
    vec2 z = (uv - c) * vv(1.0, 3.2, 4.8) + vec2(vv(2.0, -2.1, -0.9) + shift + 0.4 * sin(t * 0.1), 0.0);
    vec2 f = vec2(0.0);
    float res = 1.0;
    for (int k = 0; k < 6; ++k) {
        vec2 d = z + vec2(float(k), 0.0);
        f += res * vec2(d.x, -d.y) / max(dot(d, d), 1e-3);
        res *= -1.0 / float(k + 1);
    }
    return c + f * vv(3.0, 0.25, 0.45) / (1.0 + 0.3 * length(f));
}
/**  Spherical harmonic fault: the photo moves by Y * grad Y of a real harmonic of the sphere (nodal lines cut it into fields).
 *
 * @param p      The point. (in)
 * @param m      A parameter of the transform. (in)
 *
 * @return
 *   The value.
 **/
float shY(vec3 p, int m)
{
    if (m == 0) return 3.0 * p.z * p.z - 1.0;
    if (m == 1) return 3.0 * p.x * p.z;
    if (m == 2) return p.x * p.x - p.y * p.y;
    if (m == 3) return p.z * (5.0 * p.z * p.z - 3.0);
    if (m == 4) return p.x * (5.0 * p.z * p.z - 1.0);
    return p.x * p.x * p.x - 3.0 * p.x * p.y * p.y;
}
/**  A transform of the flat chain labs.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param which  Which variant. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tHarmonicFault(vec2 uv, vec2 c, float which, float t)
{
    int m = int(min(which, 5.0));
    m = int(mod(float(m) + vk(1.0, 6.0), 6.0));
    vec2 z = rot2(vv(4.0, -0.8, 0.8)) * (uv - c) * vv(2.0, 1.6, 2.4);
    float e = 0.01;
    vec3 P0 = vec3(2.0 * z, dot(z, z) - 1.0) / (dot(z, z) + 1.0);
    vec2 zx = z + vec2(e, 0.0), zy = z + vec2(0.0, e);
    vec3 Px = vec3(2.0 * zx, dot(zx, zx) - 1.0) / (dot(zx, zx) + 1.0), Py = vec3(2.0 * zy, dot(zy, zy) - 1.0) / (dot(zy, zy) + 1.0);
    float y0 = shY(P0, m);
    vec2 g = vec2(shY(Px, m) - y0, shY(Py, m) - y0) / e;
    return uv + vv(3.0, 0.1, 0.14) * y0 * g * cos(t * 0.4) * 0.2;
}
/**  Stage B: folds and mirrors ---------------------------------------------------------------------------------- Heighway dragon fold: the dragon curve's turn by 45 degrees and scale sqrt 2, the fold turned right or left in turn.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param turn   A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tDragonFold(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * vv(4.0, 1.7, 2.3);
    float ang = vv(1.0, 0.6, 0.97), off = vv(2.0, 0.5, 0.9), s0 = vv(3.0, 1.3, 1.53);
    float sc = 1.0, sg = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = rot2(ang * sg) * p * s0; sc *= s0;
        p.x = abs(p.x) - off;
        sg = -sg;
    }
    return c + p / sc * 1.2;
}
/**  Gosper fold: seven-fold flowsnake, scale sqrt 7 and the angle 19.1 degrees, the fold across the axis.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param turn   A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tGosperFold(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * vv(4.0, 1.7, 2.3);
    float ang = vv(1.0, 0.25, 0.42), off = vv(2.0, 1.2, 2.0), s0 = vv(3.0, 2.3, 2.9);
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p.y = abs(p.y);
        p = rot2(ang) * p * s0; sc *= s0;
        p.x -= off;
    }
    return c + p / sc * 1.3;
}
/**  Fibonacci-word mirror: mirror lines at the points of the Fibonacci quasi-lattice (gaps 1.618 and 1 in the order of the word); the picture is the distance to the nearest mirror, so it never repeats.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param ang    A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFibonacciMirror(vec2 uv, vec2 c, float scale, float ang)
{
    vec2 p = rot2(ang) * (uv - c) * scale;
    if (vk(3.0, 2.0) > 0.5) p = p.yx;
    float x = p.x + 40.0;
    float k0 = floor(x / 1.382);
    float best = 9.0;
    for (int j = -1; j <= 2; ++j) {
        float k = max(k0 + float(j), 0.0);
        float y = k + 0.618034 * floor((k + 1.0) / 1.618034);
        best = min(best, abs(x - y));
    }
    return c + vec2(best * vv(2.0, 0.7, 1.1), p.y * vv(1.0, 0.4, 0.8));
}
/**  Thue-Morse mirror: the slope of a zigzag flips where the Thue-Morse sequence says, never periodic, never random.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param w      A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tThueMorseMirror(vec2 uv, vec2 c, float w, float t)
{
    vec2 p = (uv - c) * w + vec2(vv(3.0, 0.15, 0.45) * sin(t * 0.1), 0.0);
    if (vk(4.0, 2.0) > 0.5) p = p.yx;
    float k = floor(p.x);
    float kk = mod(k, 4096.0);
    int n = int(kk), bits = 0;
    for (int i = 0; i < 12; ++i) bits += (n >> i) & 1;
    float sg = (bits & 1) == 0 ? 1.0 : -1.0;
    float kodd = mod(kk, 2.0);
    int pb = 0, n1 = max(n - 1, 0);
    for (int i = 0; i < 12; ++i) pb += (n1 >> i) & 1;
    float S = kodd > 0.5 ? ((pb & 1) == 0 ? 1.0 : -1.0) : 0.0;
    float x = S + sg * (p.x - k);
    return c + vec2(x * vv(1.0, 0.3, 0.6), p.y * vv(2.0, 0.3, 0.6));
}
/**  Cantor mirror: the distance to the Cantor set along both axes (a devil's carpet of folds).
 *
 * @param x      The value. (in)
 *
 * @return
 *   The value.
 **/
float cantorDist(float x)
{
    x = abs(fract(x * 0.5 + 0.5) * 2.0 - 1.0);
    float sc = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (x < 0.3333333) { x *= 3.0; sc /= 3.0; }
        else if (x > 0.6666667) { x = (x - 0.6666667) * 3.0; sc /= 3.0; }
        else return min(x - 0.3333333, 0.6666667 - x) * sc;
    }
    return 0.0;
}
/**  A transform of the flat chain labs.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param scale  The scale. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCantorMirror(vec2 uv, vec2 c, float scale, float t)
{
    vec2 p = rot2(vv(6.0, -0.6, 0.6)) * (uv - c) * scale + vv(5.0, 0.3, 0.7);
    if (vk(3.0, 2.0) > 0.5) p = p.yx;
    return c + vec2(cantorDist(p.x * vv(7.0, 0.7, 1.3) + vv(2.0, 0.02, 0.08) * sin(t * 0.2)), cantorDist(p.y * vv(1.0, 0.6, 1.4))) * vv(4.0, 2.4, 3.6);
}
/**  Tent-map fold: the triangle wave doubled again and again, binary mirrors at every scale.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tTentFold(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * vv(1.0, 1.1, 1.7) + 0.5 + 0.03 * vec2(sin(t * 0.2), cos(t * 0.17));
    float s1 = vv(2.0, 0.2, 0.5), s2 = vv(3.0, 0.1, 0.3);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0);
        p = 1.0 - abs(1.0 - 2.0 * p);
        p = vec2(p.x + s1 * p.y, p.y + s2 * p.x);
    }
    return c + p * vv(4.0, 1.0, 1.4) - 0.3;
}
/**  Cat-map fold: the hyperbolic automorphism [[2,1],[1,1]] of the torus, each round folded by a mirror repeat.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCatFold(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * vv(1.0, 0.9, 1.5) + 0.5;
    float mi = vk(2.0, 5.0);
    vec4 M = mi < 0.5 ? vec4(2.0, 1.0, 1.0, 1.0) : (mi < 1.5 ? vec4(1.0, 1.0, 1.0, 2.0) : (mi < 2.5 ? vec4(3.0, 1.0, 2.0, 1.0) : (mi < 3.5 ? vec4(2.0, 1.0, 3.0, 2.0) : vec4(1.0, 2.0, 1.0, 1.0))));
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= iters) break;
        p = vec2(M.x * p.x + M.y * p.y, M.z * p.x + M.w * p.y) + vv(3.0, 0.02, 0.08) * sin(t * 0.2);
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0);
    }
    return c + p - 0.5;
}
/**  Kaleidoscopic fold with a turn: abs, a shift, a turn that grows, a scale of 1.6: lace of a triangle's fold.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tKifsTriangle(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * vv(6.0, 1.7, 2.3);
    float sc = 1.0, s0 = vv(5.0, 1.4, 1.9);
    vec2 off = vec2(vv(1.0, 0.35, 0.65), vv(2.0, 0.2, 0.4));
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= iters) break;
        p = abs(p);
        p -= off;
        p = rot2(vv(3.0, 0.3, 0.7) + 0.15 * sin(t * 0.25) + vv(4.0, 0.05, 0.2) * float(i)) * p;
        p *= s0; sc *= s0;
    }
    return c + p / sc * 1.4;
}
/**  Whitney cusp fold: (x, y) -> (x, y^3 + a x y): the plane folds along a cusp and the photo lies over itself.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param a      The first parameter. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tWhitneyCusp(vec2 uv, vec2 c, float a, float t)
{
    vec2 p = (uv - c) * vv(1.0, 1.7, 2.7);
    if (vk(4.0, 2.0) > 0.5) p = p.yx;
    float aa = a * (1.0 + 0.3 * sin(t * 0.3));
    return c + vec2(p.x, p.y * p.y * p.y * vv(2.0, 0.3, 0.7) + aa * p.x * p.y) * vv(3.0, 0.4, 0.6);
}
/**  Polar tent fold: the tent map in radius and angle at once, petals within petals.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param iters  The number of iterations. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tPolarTent(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = uv - c;
    float na = 1.0 + vk(1.0, 4.0);
    float r = length(p) * vv(2.0, 1.6, 2.4), a = (atan(p.y, p.x) / 3.14159265 * 0.5 + 0.5) * na + 0.02 * t;
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= iters) break;
        r = 1.0 - abs(1.0 - 2.0 * abs(fract(r * 0.5 + 0.5) * 2.0 - 1.0));
        a = 1.0 - abs(1.0 - 2.0 * abs(fract(a * 0.5 + 0.5) * 2.0 - 1.0));
    }
    float th = a * 6.2831853 / na;
    return c + r * vec2(cos(th), sin(th)) * vv(3.0, 0.4, 0.6);
}
/**  Stage C: lenses --------------------------------------------------------------------------------------------- Cylinder lens: stretched or squeezed in one direction only, the photo drawn into bands.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param ang    A parameter of the transform. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCylinderLens(vec2 uv, vec2 c, float k, float ang)
{
    float a2 = ang + vv(2.0, -1.5, 1.5);
    vec2 d = rot2(a2) * (uv - c);
    d.x *= vv(1.0, 0.04, 0.7) + k;
    d.y *= 1.0 + vv(3.0, -0.7, 0.7) * length(d);
    return c + rot2(-a2) * d;
}
/**  Axicon: a cone lens bends every ray by the same angle toward the axis: a ring caustic of radius k.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param k      The knob of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tAxicon(vec2 uv, vec2 c, float k, float t)
{
    vec2 d = uv - c;
    float r = sqrt(dot(d, d) + 0.002);
    float sw = vv(2.0, -0.5, 0.5);
    return uv - (d + sw * vec2(-d.y, d.x)) / r * k * (1.0 - vv(1.0, 0.1, 0.3) + vv(1.0, 0.1, 0.3) * sin(t * 0.3));
}
/**  Fresnel step lens: concentric zones, each a slice of a lens: the picture slips back at every step (soft ramps).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param zones  The number of zones. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFresnelStep(vec2 uv, vec2 c, float zones, float t)
{
    vec2 d = uv - c;
    float f = fract(length(d) * zones - vv(3.0, 0.02, 0.08) * t);
    float e0 = vv(1.0, 0.7, 0.95);
    float saw = smoothstep(0.0, e0, f) * (1.0 - smoothstep(e0, 1.0, f));
    return c + d * (1.0 - vv(2.0, 0.2, 0.4) * (saw - 0.5));
}
/**  Compound eye: a grid of lenslets, each showing the photo a little turned and flipped (displacement dies at the cell edge).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param cells  The number of cells. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCompoundEye(vec2 uv, vec2 c, float cells, float t)
{
    float ra = vv(3.0, -0.4, 0.4);
    vec2 q = rot2(ra) * (uv - c) * cells;
    vec2 f = fract(q + 0.5) - 0.5;
    vec2 e = abs(f) * 2.0;
    float edge = 1.0 - max(e.x, e.y) * max(e.x, e.y);
    float sg = (mod(floor(q.x + 0.5) + floor(q.y + 0.5), 2.0) < 0.5) ? 1.0 : -1.0;
    vec2 fo = rot2(-ra) * f;
    return uv - vv(1.0, 1.2, 2.0) * sg * fo / cells * edge - vv(2.0, 0.2, 0.6) * rot2(0.3 * sin(t * 0.2)) * fo / cells * edge;
}
/**  Luneburg lens: a ball of refractive index sqrt(2 - r^2) focuses parallel rays on the far rim.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param R      The radius. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLuneburg(vec2 uv, vec2 c, float R, float t)
{
    vec2 d = (uv - c) / R;
    float r2 = dot(d, d);
    float sp = vv(1.0, 0.1, 0.3);
    vec2 dir = vec2(cos(sp * t + vv(3.0, -1.5, 1.5)), sin(sp * t + vv(3.0, -1.5, 1.5)));
    float s = (1.0 - sqrt(max(1.0 - r2, 0.0))) * smoothstep(1.05, 0.85, sqrt(r2));
    return uv + dir * s * R * vv(2.0, 0.9, 1.5);
}
/**  Maxwell fish eye: every point is imaged on another, the photo turned inside out in a disc (blended into the rim).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param R      The radius. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tMaxwell(vec2 uv, vec2 c, float R, float t)
{
    vec2 cc = c + vec2(vv(5.0, -0.15, 0.15), vv(6.0, -0.15, 0.15));
    float RR = R * vv(7.0, 0.7, 1.35);
    vec2 d = (uv - cc) / RR;
    float r2 = dot(d, d);
    vec2 inv = -d / max(r2, vv(1.0, 0.03, 0.12)) * vv(2.0, 0.25, 0.75) + d * vv(3.0, 0.25, 0.75);
    float w = smoothstep(vv(4.0, 0.9, 1.1), vv(4.0, 0.9, 1.1) - 0.2, sqrt(r2));
    return cc + mix(d, inv, w) * RR;
}
/**  Veselago lens: negative refraction in a slab: inside it the image inverts and focuses twice.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param thick  The thickness. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tVeselago(vec2 uv, vec2 c, float thick, float t)
{
    if (vk(5.0, 2.0) > 0.5) { uv = uv.yx; c = c.yx; }
    float th = thick * vv(3.0, 0.6, 1.5);
    float y0 = c.y + vv(1.0, -0.2, 0.2) * sin(t * 0.2) + vv(4.0, -0.25, 0.25);
    float tilt = vv(2.0, -0.4, 0.4);
    float s = uv.y - y0 + tilt * (uv.x - c.x);
    float a = abs(s);
    float inside = 1.0 - smoothstep(th * 0.9, th, a);
    float s2 = s * (2.0 * a / th - 1.0);
    vec2 r = vec2(uv.x, y0 + mix(s, s2, inside) - tilt * (uv.x - c.x));
    return vk(5.0, 2.0) > 0.5 ? r.yx : r;
}
/**  Inferior mirage: the sky mirrored into the ground along a hot horizon, with a shimmer in the seam.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param amp    The amplitude. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tMirage(vec2 uv, vec2 c, float amp, float t)
{
    float h = c.y + vv(3.0, -0.22, 0.22) + vv(4.0, -0.25, 0.25) * (uv.x - c.x);
    float d = uv.y - h;
    float wd = vv(2.0, 0.002, 0.008);
    float shimmer = exp(-d * d / wd) * amp * 0.02 * vv(6.0, 0.5, 1.8) * sin(vv(1.0, 30.0, 90.0) * uv.x + 3.0 * t + 20.0 * d);
    return vec2(uv.x + shimmer + 0.01 * amp * sin(25.0 * d + t) * exp(-d * d / 0.02), h + abs(d) * vv(5.0, 0.6, 1.4));
}
/**  Stage D: flows and waves ------------------------------------------------------------------------------------ Langmuir cells: counter-rotating roll pairs along the wind, drift lines gather in the convergence zones.
 *
 * @param uv     The point to transform. (in)
 * @param cells  The number of cells. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLangmuir(vec2 uv, float cells, float strength, float t)
{
    if (vk(4.0, 2.0) > 0.5) uv = uv.yx;
    float k = 6.2831853 * cells;
    float ph = k * uv.x + 0.3 * t;
    vec2 r = uv + strength * vv(1.0, 0.02, 0.04) * vec2(sin(ph), 0.0) + strength * vv(2.0, 0.03, 0.07) * vec2(0.0, cos(ph) * sin(vv(3.0, 0.4, 1.0) * uv.y * k * 0.3 + t * 0.2));
    return vk(4.0, 2.0) > 0.5 ? r.yx : r;
}
/**  Ekman spiral: the current turns with depth and thins: layers of the photo, each at another angle.
 *
 * @param uv     The point to transform. (in)
 * @param rate   The rate. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tEkman(vec2 uv, float rate, float strength, float t)
{
    float depth = uv.y * vv(1.0, 2.2, 3.8);
    float a = rate * depth + 0.2 * t;
    return uv + strength * 0.05 * exp(-vv(2.0, 0.3, 0.7) * depth) * vec2(cos(a), sin(a)) * vv(3.0, 2.2, 3.8);
}
/**  Capillary ring waves: short ripples round many sources, crossing into lattices.
 *
 * @param uv     The point to transform. (in)
 * @param n      The count. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tCapillary(vec2 uv, float n, float strength, float t)
{
    vec2 d = vec2(0.0);
    float off = vk(3.0, 100.0);
    float n2 = min(n + vk(5.0, 3.0), 6.0);
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= n2) break;
        vec2 s = vec2(hash11(float(i) * 3.1 + 1.0 + off), hash11(float(i) * 5.7 + 2.0 + off));
        vec2 e = uv - s;
        float r = length(e);
        d += e / max(r, 1e-3) * sin(vv(1.0, 40.0, 100.0) * r - 3.0 * t + float(i)) / (1.0 + vv(2.0, 4.0, 12.0) * r);
    }
    return uv + strength * 0.04 * vv(4.0, 0.6, 1.6) * d;
}
/**  KdV soliton train: sech^2 humps of different height that pass through each other; the photo rides them.
 *
 * @param uv     The point to transform. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tSolitons(vec2 uv, float strength, float t)
{
    float h = 0.0;
    for (int i = 0; i < 4; ++i) {
        float sp = vv(1.0, 0.4, 0.8) + vv(2.0, 0.35, 0.65) * float(i);
        float x0 = fract(0.05 * t * sp + 0.27 * float(i) + vv(5.0, -0.2, 0.2)) * 2.0 - 0.5;
        float u = (uv.x - x0) * (vv(3.0, 2.0, 4.0) + 2.0 * sp);
        float sh = 1.0 / cosh(u);
        h += sp * sh * sh;
    }
    return uv + vec2(0.0, strength * vv(4.0, 0.1, 0.22) * h);
}
/**  Airy wave packet: displacement along a curve that accelerates like a parabola, with side lobes behind it.
 *
 * @param x      The value. (in)
 *
 * @return
 *   The value.
 **/
float airyApprox(float x)
{
    if (x > 1.0) return exp(-0.6667 * x * sqrt(x)) / (3.5449 * sqrt(sqrt(x)));
    if (x < -1.0) { float a = -x; return sin(0.6667 * a * sqrt(a) + 0.7853982) / (1.7725 * sqrt(sqrt(a))); }
    return 0.3550 - 0.2588 * x + 0.0592 * x * x * x;
}
/**  A transform of the flat chain labs.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tAiryPacket(vec2 uv, vec2 c, float strength, float t)
{
    bool sw = vk(5.0, 2.0) > 0.5;
    vec2 u2 = sw ? uv.yx : uv, c2 = sw ? c.yx : c;
    float x = (u2.x - c2.x) * vv(1.0, 4.0, 8.0) - vv(4.0, 0.2, 0.6) * t;
    float a = airyApprox(x * vv(2.0, 0.6, 1.0));
    vec2 r = u2 + vec2(0.0, strength * 0.25 * vv(6.0, 0.6, 1.6) * a) + vec2(vv(3.0, 0.02, 0.1) * strength * a * a, 0.0);
    return sw ? r.yx : r;
}
/**  Kida vortex: an elliptical patch of constant vorticity, turning as a whole, its rim wavy.
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param ell    A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tKida(vec2 uv, vec2 c, float ell, float t)
{
    float sp = vv(1.0, 0.05, 0.15);
    vec2 d = rot2(sp * t) * (uv - c);
    float ph = atan(d.y, d.x);
    float rho = length(vec2(d.x / ell, d.y * ell)) * 3.0 * (1.0 + vv(3.0, 0.06, 0.18) * sin((3.0 + vk(2.0, 3.0)) * ph + 0.6 * t));
    float th = vv(4.0, 1.2, 2.4) * (rho < 1.0 ? 1.0 : 1.0 / (rho * rho));
    return c + rot2(-sp * t) * (rot2(th * sin(0.4 * t + 1.0)) * d);
}
/**  Lamb-Oseen vortex row: soft vortices of alternating sense in a row (Gamma / 2 pi r^2 (1 - exp(-r^2 / rc^2))).
 *
 * @param uv     The point to transform. (in)
 * @param c      The centre of the map. (in)
 * @param gap    A parameter of the transform. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tLambOseenRow(vec2 uv, vec2 c, float gap, float t)
{
    vec2 cm = vk(4.0, 2.0) > 0.5 ? c.yx : c;
    if (vk(4.0, 2.0) > 0.5) uv = uv.yx;
    float gp = gap * vv(5.0, 0.7, 1.4);
    float row = cm.y + vv(3.0, -0.2, 0.2);
    for (int i = -2; i <= 2; ++i) {
        float xi = cm.x + (float(i) + fract(0.05 * t)) * gp;
        vec2 d = uv - vec2(xi, row);
        float r2 = dot(d, d);
        float sg = mod(float(i) + floor(0.05 * t), 2.0) < 0.5 ? 1.0 : -1.0;
        uv = vec2(xi, row) + rot2(sg * vv(2.0, 1.6, 4.2) * (1.0 - exp(-r2 / vv(1.0, 0.01, 0.04))) / (1.0 + 40.0 * r2) * (0.5 + 0.5 * sin(t * 0.3 + float(i)))) * d;
    }
    return vk(4.0, 2.0) > 0.5 ? uv.yx : uv;
}
/**  Faraday standing waves: a vibrating surface's square or hexagonal standing wave pattern.
 *
 * @param uv     The point to transform. (in)
 * @param hex    A parameter of the transform. (in)
 * @param strength The strength. (in)
 * @param t      The scene's clock. (in)
 *
 * @return
 *   The transformed point.
 **/
vec2 tFaraday(vec2 uv, float hex, float strength, float t)
{
    vec2 g = vec2(0.0);
    float amp = cos(t * vv(2.0, 0.4, 1.2));
    int n = hex < 0.5 ? 2 : 3;
    if (vk(4.0, 3.0) > 1.5) n = 3;
    mat2 R = rot2(vv(3.0, -0.8, 0.8));
    for (int j = 0; j < 3; ++j) {
        if (j >= n) break;
        vec2 e = R * (hex < 0.5 && n == 2 ? (j == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : cexpi(1.0471976 * float(j)));
        g -= e * sin(vv(1.0, 12.0, 40.0) * dot(e, uv));
    }
    return uv + strength * 0.02 * vv(5.0, 1.0, 3.2) * amp * g;
}

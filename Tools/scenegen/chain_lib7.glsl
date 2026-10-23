// ---- round 7 (23.10.2026): forty more transforms for the flat chain labs ----
// Stage A: coordinate maps ------------------------------------------------------------------------------------
// Tinkerbell map: x' = x^2 - y^2 + a x + b y, y' = 2 x y + c x + d y, the strange attractor's loops.
vec2 tTinkerbell(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * 2.0;
    float a = 0.9 + 0.08 * sin(t * 0.2), b = -0.6013 + 0.05 * cos(t * 0.17);
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= steps) break;
        p = vec2(p.x * p.x - p.y * p.y + a * p.x + b * p.y, 2.0 * p.x * p.y + 2.0 * p.x + 0.5 * p.y);
        p *= 1.0 / (1.0 + 0.12 * dot(p, p));
    }
    return c + p * 0.5;
}
// Lozi map: the piecewise linear Henon, |x| for x^2: straight kinks instead of soft loops.
vec2 tLozi(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * 2.5;
    float a = 1.6 + 0.12 * sin(t * 0.2);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; p = vec2(1.0 - a * abs(p.x) + 0.5 * p.y, p.x); }
    return c + p * 0.4;
}
// Hopalong (Martin): x' = y - sgn(x) sqrt|b x - c|, y' = a - x.
vec2 tHopalong(vec2 uv, vec2 c, float a, float t)
{
    vec2 p = (uv - c) * 3.0;
    for (int i = 0; i < 3; ++i) p = vec2(p.y - sign(p.x) * sqrt(abs(1.0 * p.x - (0.4 + 0.2 * sin(t * 0.15)))), a - p.x);
    return c + p * 0.3;
}
// Gingerbreadman map: x' = 1 - y + |x|, y' = x.
vec2 tGingerbread(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * 4.0;
    for (int i = 0; i < 4; ++i) p = vec2(1.0 - p.y + k * abs(p.x), p.x);
    return c + p * (0.16 + 0.02 * sin(t * 0.2));
}
// Bogdanov map: the normal form of the Bogdanov-Takens bifurcation, spirals about a fixed point.
vec2 tBogdanov(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * 2.5;
    float mu = 0.1 + 0.05 * sin(t * 0.2);
    for (int i = 0; i < 3; ++i) { p.y += 0.0 * p.y + k * p.x * (p.x - 1.0) + mu * p.x * p.y; p.x += p.y; }
    return c + p * 0.45;
}
// Lemniscate coordinates: bipolar coordinates of z^2 with the poles +-a^2: figures of eight, the poles in the ears.
vec2 tLemniscate(vec2 uv, vec2 c, float a, float t)
{
    vec2 z = (uv - c) * 3.0;
    vec2 w = cmul(z, z);
    float a2 = a * a;
    vec2 q = cdiv(w - vec2(a2, 0.0), w + vec2(a2, 0.0));
    return vec2(0.5 * log(max(dot(q, q), 1e-6)) * 0.9 + 0.05 * t, atan(q.y, q.x) / 3.14159265 * 2.0);
}
// Schwarz-Christoffel: the disc onto a regular hexagon, w = z * integral_0^1 (1 - (s z)^6)^(-1/3) ds; outside
// the circle of radius 0.9 the plane is inverted into it (continuous on the circle).
vec2 tScHexagon(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = rot2(0.1 * sin(t * 0.2)) * (uv - c) * scale;
    float r = length(z);
    if (r > 0.9) z *= 0.81 / (r * r);
    vec2 w = vec2(0.0);
    for (int i = 0; i < 8; ++i) {
        float s = (float(i) + 0.5) / 8.0;
        vec2 q = z * s, q2 = cmul(q, q), q3 = cmul(q2, q), q6 = cmul(q3, q3);
        vec2 d = vec2(1.0, 0.0) - q6;
        float m = max(length(d), 1e-3), ph = atan(d.y, d.x);
        w += pow(m, -0.3333333) * vec2(cos(ph / 3.0), -sin(ph / 3.0));
    }
    return c + cmul(z, w / 8.0) * 0.55;
}
// Rose fold: the polar mirror at r = R(theta) of a k-petal rose, petals folded into each other.
vec2 tRoseFold(vec2 uv, vec2 c, float k, float t)
{
    vec2 p = (uv - c) * 3.0;
    float r = length(p), sec = 6.2831853 / k;
    float an = abs(mod(atan(p.y, p.x) + 0.1 * t, sec) - 0.5 * sec);
    float R = 0.35 + 0.65 * abs(cos(0.5 * k * an));
    float rr = R * abs(mod(r / R + 1.0, 2.0) - 1.0);
    return c + rr * vec2(cos(an), sin(an)) * 0.4;
}
// Epitrochoid unrolling: the point moves as the pen of a gear rolling in a ring: rho (e^{i th} - d e^{i (m+1) th}).
vec2 tEpitrochoid(vec2 uv, vec2 c, float m, float t)
{
    vec2 d = uv - c;
    float rho = length(d), th = atan(d.y, d.x) + 0.1 * t;
    float dd = 0.75 + 0.15 * sin(t * 0.2);
    return c + rho * (cexpi(th) - dd / (m + 1.0) * cexpi((m + 1.0) * th)) * 1.1;
}
// Modular lambda function: lambda = (theta_2 / theta_3)^4 of the nome q = exp(i pi tau), three cusps 0, 1, infinity.
vec2 tLambda(vec2 uv, vec2 c, float scale, float t)
{
    vec2 tau = (uv - c) * scale + vec2(0.5 * sin(t * 0.1), 0.0);
    tau.y = abs(tau.y) + 0.2;
    vec2 q = exp(-3.14159265 * tau.y) * cexpi(3.14159265 * tau.x);
    vec2 q2 = cmul(q, q), q4 = cmul(q2, q2), q9 = cmul(q4, cmul(q4, q));
    vec2 th3 = vec2(1.0, 0.0) + 2.0 * (q + q4 + q9);
    vec2 qq = exp(-0.7853982 * tau.y) * cexpi(0.7853982 * tau.x);
    vec2 th2 = 2.0 * cmul(qq, vec2(1.0, 0.0) + q2 + cmul(q4, q2));
    vec2 r = cdiv(th2, th3);
    vec2 l = cmul(cmul(r, r), cmul(r, r));
    return c + l * 0.5 / (1.0 + 0.3 * length(l));
}
// Ford circles: the point is inverted in the circle that holds it (p/q, radius 1/(2 q^2)), mirror-periodic along the axis.
vec2 tFord(vec2 uv, vec2 c, float rank, float t)
{
    vec2 z = vec2(abs(fract((uv.x - c.x + 0.5) * 0.5) * 2.0 - 1.0), abs(fract((uv.y - c.y + 0.5) * 0.5) * 2.0 - 1.0) * 0.8);
    z.x += 0.05 * sin(t * 0.2);
    for (int round = 0; round < 2; ++round) {
        for (int i = 0; i < 9; ++i) {
            float q = i < 2 ? 1.0 : (i < 3 ? 2.0 : (i < 5 ? 3.0 : (i < 7 ? 4.0 : 5.0)));
            float p0 = i == 0 ? 0.0 : (i == 1 ? 1.0 : (i == 2 ? 0.5 : (i == 3 ? 0.3333 : (i == 4 ? 0.6667 : (i == 5 ? 0.25 : (i == 6 ? 0.75 : (i == 7 ? 0.2 : 0.4)))))));
            if (float(i) >= 3.0 + 2.0 * rank) break;
            float R = 0.5 / (q * q);
            vec2 ctr = vec2(p0, R), d = z - ctr;
            float dd = dot(d, d);
            if (dd < R * R) z = ctr + d * (R * R / max(dd, 1e-5));
        }
    }
    return vec2(z.x, z.y / 0.8);
}
// Square root with its branch cut: |sqrt(z)| in both coordinates, so the two sheets agree on the cut.
vec2 tSqrtSheet(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = rot2(0.2 * t) * (uv - c) * scale;
    float r = length(z), th = atan(z.y, z.x);
    vec2 w = sqrt(r) * vec2(cos(0.5 * th), sin(0.5 * th));
    return c + abs(w) * 0.7;
}
// Gamma function's poles: the principal parts of Gamma at 0, -1, -2 ... (residues (-1)^k / k!), funnels in the plane.
vec2 tGammaPoles(vec2 uv, vec2 c, float shift, float t)
{
    vec2 z = (uv - c) * 4.0 + vec2(-1.5 + shift + 0.4 * sin(t * 0.1), 0.0);
    vec2 f = vec2(0.0);
    float res = 1.0;
    for (int k = 0; k < 6; ++k) {
        vec2 d = z + vec2(float(k), 0.0);
        f += res * vec2(d.x, -d.y) / max(dot(d, d), 1e-3);
        res *= -1.0 / float(k + 1);
    }
    return c + f * 0.35 / (1.0 + 0.3 * length(f));
}
// Spherical harmonic fault: the photo moves by Y * grad Y of a real harmonic of the sphere (nodal lines cut it into fields).
float shY(vec3 p, int m)
{
    if (m == 0) return 3.0 * p.z * p.z - 1.0;
    if (m == 1) return 3.0 * p.x * p.z;
    if (m == 2) return p.x * p.x - p.y * p.y;
    if (m == 3) return p.z * (5.0 * p.z * p.z - 3.0);
    if (m == 4) return p.x * (5.0 * p.z * p.z - 1.0);
    return p.x * p.x * p.x - 3.0 * p.x * p.y * p.y;
}
vec2 tHarmonicFault(vec2 uv, vec2 c, float which, float t)
{
    int m = int(min(which, 5.0));
    vec2 z = (uv - c) * 2.0;
    float e = 0.01;
    vec3 P0 = vec3(2.0 * z, dot(z, z) - 1.0) / (dot(z, z) + 1.0);
    vec2 zx = z + vec2(e, 0.0), zy = z + vec2(0.0, e);
    vec3 Px = vec3(2.0 * zx, dot(zx, zx) - 1.0) / (dot(zx, zx) + 1.0), Py = vec3(2.0 * zy, dot(zy, zy) - 1.0) / (dot(zy, zy) + 1.0);
    float y0 = shY(P0, m);
    vec2 g = vec2(shY(Px, m) - y0, shY(Py, m) - y0) / e;
    return uv + 0.12 * y0 * g * cos(t * 0.4) * 0.2;
}
// Stage B: folds and mirrors ----------------------------------------------------------------------------------
// Heighway dragon fold: the dragon curve's turn by 45 degrees and scale sqrt 2, the fold turned right or left in turn.
vec2 tDragonFold(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0, sg = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = rot2(0.7853982 * sg) * p * 1.4142136; sc *= 1.4142136;
        p.x = abs(p.x) - 0.7;
        sg = -sg;
    }
    return c + p / sc * 1.2;
}
// Gosper fold: seven-fold flowsnake, scale sqrt 7 and the angle 19.1 degrees, the fold across the axis.
vec2 tGosperFold(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p.y = abs(p.y);
        p = rot2(0.333473) * p * 2.6457513; sc *= 2.6457513;
        p.x -= 1.6;
    }
    return c + p / sc * 1.3;
}
// Fibonacci-word mirror: mirror lines at the points of the Fibonacci quasi-lattice (gaps 1.618 and 1 in the order of
// the word); the picture is the distance to the nearest mirror, so it never repeats.
vec2 tFibonacciMirror(vec2 uv, vec2 c, float scale, float ang)
{
    vec2 p = rot2(ang) * (uv - c) * scale;
    float x = p.x + 40.0;
    float k0 = floor(x / 1.382);
    float best = 9.0;
    for (int j = -1; j <= 2; ++j) {
        float k = max(k0 + float(j), 0.0);
        float y = k + 0.618034 * floor((k + 1.0) / 1.618034);
        best = min(best, abs(x - y));
    }
    return c + vec2(best * 0.9, p.y * 0.6);
}
// Thue-Morse mirror: the slope of a zigzag flips where the Thue-Morse sequence says, never periodic, never random.
vec2 tThueMorseMirror(vec2 uv, vec2 c, float w, float t)
{
    vec2 p = (uv - c) * w + vec2(0.3 * sin(t * 0.1), 0.0);
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
    return c + vec2(x * 0.45, p.y * 0.45);
}
// Cantor mirror: the distance to the Cantor set along both axes (a devil's carpet of folds).
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
vec2 tCantorMirror(vec2 uv, vec2 c, float scale, float t)
{
    vec2 p = (uv - c) * scale + 0.5;
    return c + vec2(cantorDist(p.x + 0.05 * sin(t * 0.2)), cantorDist(p.y)) * 3.0;
}
// Tent-map fold: the triangle wave doubled again and again, binary mirrors at every scale.
vec2 tTentFold(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * 1.4 + 0.5 + 0.03 * vec2(sin(t * 0.2), cos(t * 0.17));
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0);
        p = 1.0 - abs(1.0 - 2.0 * p);
        p = vec2(p.x + 0.35 * p.y, p.y + 0.2 * p.x);
    }
    return c + p * 1.2 - 0.3;
}
// Cat-map fold: the hyperbolic automorphism [[2,1],[1,1]] of the torus, each round folded by a mirror repeat.
vec2 tCatFold(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * 1.2 + 0.5;
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= iters) break;
        p = vec2(2.0 * p.x + p.y, p.x + p.y) + 0.05 * sin(t * 0.2);
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0);
    }
    return c + p - 0.5;
}
// Kaleidoscopic fold with a turn: abs, a shift, a turn that grows, a scale of 1.6: lace of a triangle's fold.
vec2 tKifsTriangle(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= iters) break;
        p = abs(p);
        p -= vec2(0.5, 0.3);
        p = rot2(0.5 + 0.15 * sin(t * 0.25) + 0.12 * float(i)) * p;
        p *= 1.6; sc *= 1.6;
    }
    return c + p / sc * 1.4;
}
// Whitney cusp fold: (x, y) -> (x, y^3 + a x y): the plane folds along a cusp and the photo lies over itself.
vec2 tWhitneyCusp(vec2 uv, vec2 c, float a, float t)
{
    vec2 p = (uv - c) * 2.2;
    float aa = a * (1.0 + 0.3 * sin(t * 0.3));
    return c + vec2(p.x, p.y * p.y * p.y * 0.5 + aa * p.x * p.y) * 0.5;
}
// Polar tent fold: the tent map in radius and angle at once, petals within petals.
vec2 tPolarTent(vec2 uv, vec2 c, float iters, float t)
{
    vec2 p = uv - c;
    float r = length(p) * 2.0, a = atan(p.y, p.x) / 3.14159265 * 0.5 + 0.5 + 0.02 * t;
    for (int i = 0; i < 3; ++i) {
        if (float(i) >= iters) break;
        r = 1.0 - abs(1.0 - 2.0 * abs(fract(r * 0.5 + 0.5) * 2.0 - 1.0));
        a = 1.0 - abs(1.0 - 2.0 * abs(fract(a * 0.5 + 0.5) * 2.0 - 1.0));
    }
    float th = a * 6.2831853;
    return c + r * vec2(cos(th), sin(th)) * 0.5;
}
// Stage C: lenses ---------------------------------------------------------------------------------------------
// Cylinder lens: stretched or squeezed in one direction only, the photo drawn into bands.
vec2 tCylinderLens(vec2 uv, vec2 c, float k, float ang)
{
    vec2 d = rot2(ang) * (uv - c);
    d.x *= 0.35 + k;
    return c + rot2(-ang) * d;
}
// Axicon: a cone lens bends every ray by the same angle toward the axis: a ring caustic of radius k.
vec2 tAxicon(vec2 uv, vec2 c, float k, float t)
{
    vec2 d = uv - c;
    float r = sqrt(dot(d, d) + 0.002);
    return uv - d / r * k * (0.8 + 0.2 * sin(t * 0.3));
}
// Fresnel step lens: concentric zones, each a slice of a lens: the picture slips back at every step (soft ramps).
vec2 tFresnelStep(vec2 uv, vec2 c, float zones, float t)
{
    vec2 d = uv - c;
    float f = fract(length(d) * zones - 0.05 * t);
    float saw = smoothstep(0.0, 0.85, f) * (1.0 - smoothstep(0.85, 1.0, f));
    return c + d * (1.0 - 0.3 * (saw - 0.5));
}
// Compound eye: a grid of lenslets, each showing the photo a little turned and flipped (displacement dies at the cell edge).
vec2 tCompoundEye(vec2 uv, vec2 c, float cells, float t)
{
    vec2 q = (uv - c) * cells;
    vec2 f = fract(q + 0.5) - 0.5;
    vec2 e = abs(f) * 2.0;
    float edge = 1.0 - max(e.x, e.y) * max(e.x, e.y);
    float sg = (mod(floor(q.x + 0.5) + floor(q.y + 0.5), 2.0) < 0.5) ? 1.0 : -1.0;
    return uv - 1.6 * sg * f / cells * edge - 0.4 * rot2(0.3 * sin(t * 0.2)) * f / cells * edge;
}
// Luneburg lens: a ball of refractive index sqrt(2 - r^2) focuses parallel rays on the far rim.
vec2 tLuneburg(vec2 uv, vec2 c, float R, float t)
{
    vec2 d = (uv - c) / R;
    float r2 = dot(d, d);
    vec2 dir = vec2(cos(0.2 * t), sin(0.2 * t));
    float s = (1.0 - sqrt(max(1.0 - r2, 0.0))) * smoothstep(1.05, 0.85, sqrt(r2));
    return uv + dir * s * R * 1.2;
}
// Maxwell fish eye: every point is imaged on another, the photo turned inside out in a disc (blended into the rim).
vec2 tMaxwell(vec2 uv, vec2 c, float R, float t)
{
    vec2 d = (uv - c) / R;
    float r2 = dot(d, d);
    vec2 inv = -d / max(r2, 0.06) * 0.5 + d * 0.5;
    float w = smoothstep(1.0, 0.8, sqrt(r2));
    return c + mix(d, inv, w) * R;
}
// Veselago lens: negative refraction in a slab: inside it the image inverts and focuses twice.
vec2 tVeselago(vec2 uv, vec2 c, float thick, float t)
{
    float y0 = c.y + 0.1 * sin(t * 0.2);
    float s = uv.y - y0;
    float a = abs(s);
    float inside = 1.0 - smoothstep(thick * 0.9, thick, a);
    float s2 = s * (2.0 * a / thick - 1.0);
    return vec2(uv.x, y0 + mix(s, s2, inside));
}
// Inferior mirage: the sky mirrored into the ground along a hot horizon, with a shimmer in the seam.
vec2 tMirage(vec2 uv, vec2 c, float amp, float t)
{
    float h = c.y;
    float d = uv.y - h;
    float shimmer = exp(-d * d / 0.004) * amp * 0.02 * sin(60.0 * uv.x + 3.0 * t + 20.0 * d);
    return vec2(uv.x + shimmer + 0.01 * amp * sin(25.0 * d + t) * exp(-d * d / 0.02), h + abs(d));
}
// Stage D: flows and waves ------------------------------------------------------------------------------------
// Langmuir cells: counter-rotating roll pairs along the wind, drift lines gather in the convergence zones.
vec2 tLangmuir(vec2 uv, float cells, float strength, float t)
{
    float k = 6.2831853 * cells;
    float ph = k * uv.x + 0.3 * t;
    return uv + strength * 0.03 * vec2(sin(ph), 0.0) + strength * 0.05 * vec2(0.0, cos(ph) * sin(0.7 * uv.y * k * 0.3 + t * 0.2));
}
// Ekman spiral: the current turns with depth and thins: layers of the photo, each at another angle.
vec2 tEkman(vec2 uv, float rate, float strength, float t)
{
    float depth = uv.y * 3.0;
    float a = rate * depth + 0.2 * t;
    return uv + strength * 0.05 * exp(-0.5 * depth) * vec2(cos(a), sin(a)) * 3.0;
}
// Capillary ring waves: short ripples round many sources, crossing into lattices.
vec2 tCapillary(vec2 uv, float n, float strength, float t)
{
    vec2 d = vec2(0.0);
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= n) break;
        vec2 s = vec2(hash11(float(i) * 3.1 + 1.0), hash11(float(i) * 5.7 + 2.0));
        vec2 e = uv - s;
        float r = length(e);
        d += e / max(r, 1e-3) * sin(70.0 * r - 3.0 * t + float(i)) / (1.0 + 8.0 * r);
    }
    return uv + strength * 0.04 * d;
}
// KdV soliton train: sech^2 humps of different height that pass through each other; the photo rides them.
vec2 tSolitons(vec2 uv, float strength, float t)
{
    float h = 0.0;
    for (int i = 0; i < 4; ++i) {
        float sp = 0.6 + 0.5 * float(i);
        float x0 = fract(0.05 * t * sp + 0.27 * float(i)) * 2.0 - 0.5;
        float u = (uv.x - x0) * (3.0 + 2.0 * sp);
        float sh = 1.0 / cosh(u);
        h += sp * sh * sh;
    }
    return uv + vec2(0.0, strength * 0.16 * h);
}
// Airy wave packet: displacement along a curve that accelerates like a parabola, with side lobes behind it.
float airyApprox(float x)
{
    if (x > 1.0) return exp(-0.6667 * x * sqrt(x)) / (3.5449 * sqrt(sqrt(x)));
    if (x < -1.0) { float a = -x; return sin(0.6667 * a * sqrt(a) + 0.7853982) / (1.7725 * sqrt(sqrt(a))); }
    return 0.3550 - 0.2588 * x + 0.0592 * x * x * x;
}
vec2 tAiryPacket(vec2 uv, vec2 c, float strength, float t)
{
    float x = (uv.x - c.x) * 6.0 - 0.4 * t;
    float a = airyApprox(x * 0.8);
    return uv + vec2(0.0, strength * 0.25 * a) + vec2(0.06 * strength * a * a, 0.0);
}
// Kida vortex: an elliptical patch of constant vorticity, turning as a whole, its rim wavy.
vec2 tKida(vec2 uv, vec2 c, float ell, float t)
{
    vec2 d = rot2(0.1 * t) * (uv - c);
    float ph = atan(d.y, d.x);
    float rho = length(vec2(d.x / ell, d.y * ell)) * 3.0 * (1.0 + 0.12 * sin(3.0 * ph + 0.6 * t));
    float th = 1.8 * (rho < 1.0 ? 1.0 : 1.0 / (rho * rho));
    return c + rot2(-0.1 * t) * (rot2(th * sin(0.4 * t + 1.0)) * d);
}
// Lamb-Oseen vortex row: soft vortices of alternating sense in a row (Gamma / 2 pi r^2 (1 - exp(-r^2 / rc^2))).
vec2 tLambOseenRow(vec2 uv, vec2 c, float gap, float t)
{
    float row = c.y;
    for (int i = -2; i <= 2; ++i) {
        float xi = c.x + (float(i) + fract(0.05 * t)) * gap;
        vec2 d = uv - vec2(xi, row);
        float r2 = dot(d, d);
        float sg = mod(float(i) + floor(0.05 * t), 2.0) < 0.5 ? 1.0 : -1.0;
        uv = vec2(xi, row) + rot2(sg * 1.6 * (1.0 - exp(-r2 / 0.01)) / (1.0 + 40.0 * r2) * (0.5 + 0.5 * sin(t * 0.3 + float(i)))) * d;
    }
    return uv;
}
// Faraday standing waves: a vibrating surface's square or hexagonal standing wave pattern.
vec2 tFaraday(vec2 uv, float hex, float strength, float t)
{
    vec2 g = vec2(0.0);
    float amp = cos(t * 0.8);
    int n = hex < 0.5 ? 2 : 3;
    for (int j = 0; j < 3; ++j) {
        if (j >= n) break;
        vec2 e = hex < 0.5 ? (j == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : cexpi(1.0471976 * float(j));
        g -= e * sin(25.0 * dot(e, uv));
    }
    return uv + strength * 0.02 * amp * g;
}

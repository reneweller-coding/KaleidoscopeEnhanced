//@doc
 * @brief STEINER CHAIN RINGS: Steiner chains: rings of circles rolling between two circles, each touching its two
 * neighbours and both circles, the inner circle sitting off-centre so the rings swell on one side and shrink on the
 * other -- and the same chain again inside every circle of the chain and inside the inner circle, all glowing; the
 * whole figure is mirrored outward, so it fills the picture.  A Steiner chain is a concentric ring of circles moved by
 * a Moebius map of the disc: the picture's point is mapped back into the concentric frame, measured there and the
 * distance scaled by the map's stretch.  The number of circles changes with the chords (cross-faded).  The rings are
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the chains roll (integrated) and the inner circle wanders
 *   audioHarmAdvance -> the number of circles in the chain changes with the chords (cross-faded)
 *   audioSwell       -> the rings' glow
 *
 * Knobs: offP (how far off-centre the inner circle sits), countP (the base number of circles), hueP.
//@params offP countP
//@audio audioHarmAdvance audioSwell
//@body
/**  The light of a concentric Steiner chain in the unit disc (and of its two bounding circles).
 *
 * @param w     The point in the chain's frame. (in)
 * @param n     The number of circles. (in)
 * @param roll  The chain's roll. (in)
 * @param px    One pixel in the chain's frame's units. (in)
 *
 * @return
 *   x the light, y the index of the nearest chain circle (z its inside: 1 inside), w the inner circle's inside.
 **/
vec4 chain(vec2 w, float n, float roll, float px)
{
    float s = sin(3.14159265 / n);
    float d = 1.0 / (1.0 + s), rho = s * d, r1 = d - rho;
    float k = floor((atan(w.y, w.x) - roll) * n / 6.2831853 + 0.5);
    float ak = roll + 6.2831853 * k / n;
    vec2 c = d * vec2(cos(ak), sin(ak));
    float dc = abs(length(w - c) - rho);
    float di = abs(length(w) - r1), dout = abs(length(w) - 1.0);
    float wd = 1.5 * px;
    float light = exp(-pow(dc / wd, 2.0)) + 0.7 * exp(-pow(di / wd, 2.0)) + 0.7 * exp(-pow(dout / wd, 2.0));
    return vec4(light, k, step(length(w - c), rho), step(length(w), r1));
}

/**  A Moebius map of the unit disc: moves the point a to the centre.
 *
 * @param z  The point. (in)
 * @param a  The point that goes to the centre. (in)
 *
 * @return
 *   (z - a) / (1 - conj(a) z).
 **/
vec2 mobius(vec2 z, vec2 a)
{
    vec2 num = z - a;
    vec2 den = vec2(1.0 - (a.x * z.x + a.y * z.y), -(a.x * z.y - a.y * z.x));
    return vec2(num.x * den.x + num.y * den.y, num.y * den.x - num.x * den.y) / dot(den, den);
}

/**  The nested chains for one circle count.
 *
 * @param z     The point in the outer disc's frame. (in)
 * @param n     The number of circles. (in)
 * @param roll  The chains' roll. (in)
 * @param a     The point the Moebius map sends to the centre. (in)
 * @param px    One pixel in the disc's units. (in)
 *
 * @return
 *   The light.
 **/
float nested(vec2 z, float n, float roll, vec2 a, float px)
{
    vec2 w = mobius(z, a);
    vec2 den = vec2(1.0 - (a.x * z.x + a.y * z.y), -(a.x * z.y - a.y * z.x));
    float stretch = (1.0 - dot(a, a)) / dot(den, den);                // |dw/dz|
    vec4 c1 = chain(w, n, roll, px * stretch);
    float light = c1.x;
    // the same chain inside the chain circle, or inside the inner circle
    float s = sin(3.14159265 / n);
    float d = 1.0 / (1.0 + s), rho = s * d, r1 = d - rho;
    if (c1.z > 0.5) {
        float ak = roll + 6.2831853 * c1.y / n;
        vec2 w2 = (w - d * vec2(cos(ak), sin(ak))) / rho;
        light += 0.75 * chain(w2, n, -1.7 * roll + c1.y, px * stretch / rho).x;
    } else if (c1.w > 0.5) {
        light += 0.75 * chain(w / r1, n, -1.3 * roll, px * stretch / r1).x;
    }
    return light;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float Rr = 0.62;
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float n0 = 6.0 + floor(3.0 * clamp(countP, 0.0, 1.0));
    float nA = n0 + mod(hk, 4.0), nB = n0 + mod(hk + 1.0, 4.0);
    float off = 0.15 + 0.3 * clamp(offP, 0.0, 1.0);
    vec2 a = off * vec2(cos(0.3 * run), 0.7 * sin(0.23 * run));
    vec2 z = p / Rr;
    float px = 1.0 / (resolution.y * Rr);
    float outside = 0.0;
    float zz = dot(z, z);
    if (zz > 1.0) { px *= zz; z /= zz; outside = 1.0; }              // mirrored outward by inversion
    float light = (1.0 - hm) * nested(z, nA, run, a, px) + hm * nested(z, nB, run, a, px);
    float glow = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (1.0 - 0.35 * outside);
    vec3 col = famCol(fh, 0.45) * 0.02 + famLight(fh, 0.4 + 0.2 * outside, 0.6) * light * glow;
    finish(famExpose(col, 1.85, 0.80, 0.00, fh));
}

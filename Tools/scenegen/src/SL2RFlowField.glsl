//@doc
 * @brief SL2R FLOW FIELD: the photo carried by the flows of SL(2,R), the symmetries of the hyperbolic plane, seen in
 * the Poincare disc -- a one-parameter flow streams the picture along its lines: round a centre (elliptic), from one
 * point of the rim to another (hyperbolic), or along circles touching the rim (parabolic).  The flow's generator
 * wanders through the Lie algebra, so the stream bends continuously from one kind into the next, the swirl's centre
 * drifting out to the rim and splitting into a source and a sink.  The photo streaks along the flow lines.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the generator wanders and the photo streams (integrated)
 *   audioSwell      -> the streaks lengthen
 *   audioKick       -> the rim flashes (light)
 *
 * Knobs: speedP (the stream's speed), kindP (the bias toward swirling or streaming), photoP (photo share), hueP.
//@params speedP kindP photoP
//@audio audioSwell audioKick
//@body
/**  Complex division.
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   a / b.
 **/
vec2 cdivF(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12); }

/**  The flow exp(tau X) of a trace-free real 2x2 matrix X = [[a, b], [c, -a]], applied to a point of the upper
 * half-plane as a Moebius map.
 *
 * @param z    The point (Im z > 0). (in)
 * @param X    a, b, c (the generator). (in)
 * @param tau  The flow time. (in)
 *
 * @return
 *   The image.
 **/
vec2 flowSL2(vec2 z, vec3 X, float tau)
{
    float dl = X.x * X.x + X.y * X.z;                           // -det X: > 0 hyperbolic, < 0 elliptic
    float cs, sn;
    if (dl > 1e-5) { float s = sqrt(dl); cs = cosh(s * tau); sn = sinh(s * tau) / s; }
    else if (dl < -1e-5) { float s = sqrt(-dl); cs = cos(s * tau); sn = sin(s * tau) / s; }
    else { cs = 1.0; sn = tau; }
    float m11 = cs + sn * X.x, m12 = sn * X.y, m21 = sn * X.z, m22 = cs - sn * X.x;
    return cdivF(m11 * z + vec2(m12, 0.0), m21 * z + vec2(m22, 0.0));
}

/**  The photo at a point of the disc, after flowing back by tau.
 *
 * @param w    The point of the disc. (in)
 * @param X    The generator. (in)
 * @param tau  The flow time. (in)
 *
 * @return
 *   The photo's colour there.
 **/
vec3 photoBack(vec2 w, vec3 X, float tau)
{
    vec2 z = cdivF(vec2(-w.y, 1.0 + w.x), vec2(1.0 - w.x, -w.y));   // the Cayley map: i (1 + w) / (1 - w)
    z.y = max(z.y, 1e-4);
    z = flowSL2(z, X, -tau);
    vec2 ws = cdivF(z - vec2(0.0, 1.0), z + vec2(0.0, 1.0));     // back into the disc
    return imgLod(ws * 0.48 + 0.5, 0.4);
}

void main()
{
    vec2 p = screenP();
    vec2 w = p / 0.98;
    float ww = dot(w, w);
    if (ww > 1.0) { w /= ww; ww = 1.0 / ww; }                  // beyond the rim: its mirror image
    w *= 0.999;
    // the generator wanders: -det X = A^2 - B^2 passes from hyperbolic through parabolic to elliptic
    float ph1 = 0.02 * sceneTime + 0.004 * audioPhase, ph2 = 0.013 * sceneTime + 0.003 * audioPhase;
    float A = 0.8, B = 0.8 + (0.6 * sin(ph2) + 0.3 * (clamp(kindP, 0.0, 1.0) - 0.5));
    vec3 X = vec3(A * cos(ph1), B + A * sin(ph1), -B + A * sin(ph1));
    // the stream: two phases a half apart, each restarting unseen while the other carries the picture
    float T = (0.1 + 0.2 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.01 * audioPhase;
    float span = 1.4, streak = 0.015 + 0.045 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(T + 0.5 * float(ph));
        float wgt = 1.0 - abs(2.0 * f - 1.0);
        float tau = span * (f - 0.5);
        vec3 c = vec3(0.0);
        for (int k = 0; k < 4; ++k) c += photoBack(w, X, tau - streak * float(k)) * (1.0 - 0.2 * float(k));
        col += wgt * c / 2.8;
    }
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    col = mix(col * tone * 1.6, col * 1.15, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0));
    float rim = smoothstep(0.85, 1.0, ww);
    col = mix(col, col * 0.4 + mix(tone, vec3(1.0), 0.4) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0)), rim * 0.6);
    finish(col);
}

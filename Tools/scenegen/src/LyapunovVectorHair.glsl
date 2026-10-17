//@doc
 * @brief LYAPUNOV VECTOR HAIR: a chaotic, time-periodic flow seen through its Lyapunov vectors -- at every point the
 * direction in which nearby fluid is torn apart fastest, over a short look ahead.  Drawn as a field of hair: the
 * photo and a fine fibre texture are combed along those directions, and where the stretching is strongest (the
 * ridges of the finite-time Lyapunov exponent) the hair is lit.  The flow beats on, so the whole pelt is stroked
 * back and forth.  A periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the flow's phase (integrated): the hair is combed with the music
 *   audioSwell      -> the look-ahead (longer in loud passages: sharper, more tangled ridges)
 *   audioKick       -> the ridges flash (light)
 *
 * Knobs: cellsP (the flow's cells on screen), combP (how far the photo is combed), fibreP (the fibres' share), hueP.
//@params cellsP combP fibreP
//@audio audioSwell audioKick
//@body
/**  The time-periodic cellular flow's velocity.
 *
 * @param x  The point (the period is 2 pi). (in)
 * @param t  The flow's phase. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 flowV(vec2 x, float t)
{
    // psi = sin(x + 0.6 sin t) sin y + 0.4 sin(2x + t) cos(2y - 0.5 t): u = d psi / dy, v = -d psi / dx
    float s1 = x.x + 0.6 * sin(t);
    vec2 u1 = vec2(sin(s1) * cos(x.y), -cos(s1) * sin(x.y));
    float a2 = 2.0 * x.x + t, b2 = 2.0 * x.y - 0.5 * t;
    vec2 u2 = 0.4 * vec2(-2.0 * sin(a2) * sin(b2), -2.0 * cos(a2) * cos(b2));
    return u1 + u2;
}

void main()
{
    vec2 p = screenP();
    float cells = 1.0 + 1.5 * clamp(cellsP, 0.0, 1.0);
    vec2 x = p * cells * 6.2831853;
    float t0 = 0.3 * audioPhase + 0.15 * sceneTime;
    float T = 2.0 + 2.5 * clamp(audioSwell, 0.0, 1.0);
    // three nearby particles, integrated over the look-ahead (midpoint steps)
    float e = 0.01, dt = T / 24.0;
    vec2 a = x, b = x + vec2(e, 0.0), c = x + vec2(0.0, e);
    float t = t0;
    for (int i = 0; i < 24; ++i) {
        vec2 ka = flowV(a, t), kb = flowV(b, t), kc = flowV(c, t);
        a += dt * flowV(a + 0.5 * dt * ka, t + 0.5 * dt);
        b += dt * flowV(b + 0.5 * dt * kb, t + 0.5 * dt);
        c += dt * flowV(c + 0.5 * dt * kc, t + 0.5 * dt);
        t += dt;
    }
    mat2 J = mat2((b - a) / e, (c - a) / e);
    mat2 C = transpose(J) * J;
    // the largest eigenvalue and its eigenvector of the symmetric C
    float tr = C[0][0] + C[1][1], det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
    float l1 = 0.5 * tr + sqrt(max(0.25 * tr * tr - det, 0.0));
    vec2 v = abs(C[1][0]) > 1e-6 ? normalize(vec2(l1 - C[1][1], C[1][0])) : vec2(1.0, 0.0);
    float ftle = log(max(l1, 1.0)) / (2.0 * T);
    // the hair: the photo and a fibre texture combed along v
    float comb = 0.004 + 0.012 * clamp(combP, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = vec3(0.0);
    float fib = 0.0;
    for (int i = -4; i <= 4; ++i) {
        vec2 o = v * float(i) * comb;
        photo += imgLod(uv + o, 0.4);
        fib += hash21(floor((p + o / 0.7) * resolution.y * 0.5));
    }
    photo /= 9.0;
    fib /= 9.0;
    vec3 tone = imgPalette(0.3 + 0.4 * ftle + 0.03 * audioPhase);
    vec3 col = photo * (0.55 + 0.7 * clamp(ftle * 1.2, 0.0, 1.0)) * mix(1.0, 0.5 + fib, 0.3 + 0.5 * clamp(fibreP, 0.0, 1.0));
    col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.5, 1.1, ftle) * 0.35 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

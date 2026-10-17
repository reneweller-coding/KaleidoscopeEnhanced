//@doc
 * @brief LENS SPACE INTERIOR: inside a lens space -- the three-sphere wrapped p times around itself, every point
 * identified with its turn by 1/p round one great circle and q/p round the linked one.  The light runs along great
 * circles, so the eye sees the few things in the space again and again: six balls, each strung into a spiral chain
 * of p copies winding round the two core circles, which are glowing tubes, the copies shrinking with distance and growing again
 * behind the eye.  The photo fills every copy.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes the space: p and q (crossfaded)
 *   audioAdvance    -> the eye's flight along a great circle (integrated)
 *   audioKick       -> the core tubes flash (light)
 *
 * Knobs: ballP (the balls' size), coreP (the core tubes' thickness), photoP (photo share), hueP.
//@params ballP coreP photoP
//@audio audioKick audioHarmAdvance
//@body
float gId = 0.0;           // what was hit: 0, 1 the core tubes, 2 .. 7 the balls
vec4 gQ = vec4(0.0);       // the hit, folded into the fundamental domain

/**  Turns a complex number by an angle.
 *
 * @param z  The number. (in)
 * @param a  The angle. (in)
 *
 * @return
 *   z e^{i a}.
 **/
vec2 cturn(vec2 z, float a) { return vec2(z.x * cos(a) - z.y * sin(a), z.x * sin(a) + z.y * cos(a)); }

/**  The angular distance to the lens space's contents, folded by the action (z1, z2) -> (w z1, w^q z2).
 *
 * @param x     The point on the three-sphere. (in)
 * @param pq    p and q. (in)
 * @param rb    The balls' angular radius. (in)
 * @param rc    The core tubes' angular radius. (in)
 *
 * @return
 *   The distance (sets gId, gQ).
 **/
float lensD(vec4 x, vec2 pq, float rb, float rc)
{
    float a1 = atan(x.y, x.x);
    float k = floor(a1 * pq.x / 6.2831853 + 0.5);
    float best = 1e9;
    vec4 bestQ = x;
    float bestId = 0.0;
    // the two core circles: invariant, no folding needed
    float dA = asin(clamp(length(x.xy), 0.0, 1.0)) - rc;        // the circle z1 = 0
    float dB = asin(clamp(length(x.zw), 0.0, 1.0)) - rc;        // the circle z2 = 0
    if (dA < best) { best = dA; bestId = 0.0; }
    if (dB < best) { best = dB; bestId = 1.0; }
    for (int j = -1; j <= 1; ++j) {
        float kk = k + float(j);
        float ang = -6.2831853 * kk / pq.x;
        vec4 f = vec4(cturn(x.xy, ang), cturn(x.zw, ang * pq.y));
        for (int b = 0; b < 6; ++b) {
            // six balls in the fundamental domain (z1 real): z1 = cos(al), z2 = sin(al) e^(i ga)
            float al = 0.45 + 0.17 * float(b), ga = 1.0471976 * float(b) + 0.4;
            vec4 c = vec4(cos(al), 0.0, sin(al) * cos(ga), sin(al) * sin(ga));
            float db = acos(clamp(dot(f, c), -1.0, 1.0)) - rb * (0.6 + 0.09 * float(b));
            if (db < best) { best = db; bestId = 2.0 + float(b); bestQ = f; }
        }
    }
    gId = bestId;
    gQ = bestQ;
    return best;
}

/**  p and q of the lens space for one step of the harmony.
 *
 * @param i  The step. (in)
 *
 * @return
 *   (p, q).
 **/
vec2 lensPQ(int i)
{
    if (i == 0) return vec2(5.0, 2.0);
    if (i == 1) return vec2(7.0, 3.0);
    if (i == 2) return vec2(8.0, 3.0);
    if (i == 3) return vec2(9.0, 2.0);
    if (i == 4) return vec2(10.0, 3.0);
    return vec2(12.0, 5.0);
}

/**  Renders the lens space from one eye.
 *
 * @param c   The eye on the three-sphere. (in)
 * @param d   The view direction (unit, tangent at c). (in)
 * @param pq  p and q. (in)
 * @param rb  The balls' angular radius. (in)
 * @param rc  The core tubes' angular radius. (in)
 *
 * @return
 *   The colour.
 **/
vec3 renderLens(vec4 c, vec4 d, vec2 pq, float rb, float rc)
{
    float t = 0.002, glow = 0.0;
    bool hit = false;
    float side = lensD(c, pq, rb, rc) < 0.0 ? -1.0 : 1.0;       // inside a ball or a tube: march to its inner wall
    for (int i = 0; i < 100; ++i) {
        vec4 x = cos(t) * c + sin(t) * d;                       // the light runs along a great circle
        float dd = side * lensD(x, pq, rb, rc);
        glow += 0.02 * exp(-25.0 * max(dd, 0.0)) * exp(-0.3 * t);
        if (dd < 0.0006) { hit = true; break; }
        t += dd * 0.85;
        if (t > 6.2) break;
    }
    vec3 tone0 = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 bg = tone0 * (0.08 + 1.5 * glow);
    if (!hit) return bg;
    vec4 x = cos(t) * c + sin(t) * d;
    float id = gId;
    vec4 q = gQ;
    // the light: the ray's own direction against the surface's slope along it
    float e = 0.002;
    float slope = side * (lensD(cos(t - e) * c + sin(t - e) * d, pq, rb, rc) - lensD(cos(t + e) * c + sin(t + e) * d, pq, rb, rc)) / (2.0 * e);
    float diff = 0.5 + 0.6 * clamp(slope, 0.0, 1.0);
    vec3 tone = imgPalette(0.15 + 0.13 * id + 0.03 * audioPhase);
    vec3 c2;
    if (id < 1.5) {
        vec3 photo = imgLod(mirrorUV((id < 0.5 ? x.zw : x.xy) * 0.8 + 0.5), 1.0);
        c2 = mix(tone * 1.3, photo, 0.3) * (0.7 + 0.8 * clamp(audioKick, 0.0, 1.0)) * diff;
    } else {
        vec3 photo = imgLod(q.xy * 0.6 + q.zw * 0.4 + 0.3, 0.4);
        c2 = mix(tone * 1.4, photo * 1.6, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff;
    }
    return mix(bg, c2, exp(-0.2 * t));
}

void main()
{
    vec2 p = screenP();
    float rb = 0.1 + 0.08 * clamp(ballP, 0.0, 1.0);
    float rc = 0.02 + 0.03 * clamp(coreP, 0.0, 1.0);
    // the eye flies along a great circle that keeps clear of both cores (|z1| = |z2| throughout), turning slowly
    float a = 0.05 * sceneTime + 0.25 * audioAdvance, b = 0.031 * sceneTime;
    vec4 u = vec4(0.7071068, 0.0, 0.7071068, 0.0), v = vec4(0.0, 0.7071068, 0.0, 0.7071068);
    vec4 w1 = vec4(0.7071068, 0.0, -0.7071068, 0.0), w2 = vec4(0.0, 0.7071068, 0.0, -0.7071068);
    vec4 c = cos(a) * u + sin(a) * v, e3 = -sin(a) * u + cos(a) * v;
    vec4 e1 = cos(b) * w1 + sin(b) * w2, e2 = -sin(b) * w1 + cos(b) * w2;
    vec4 d = normalize(e3 * 1.3 + e1 * p.x + e2 * p.y);
    float h = max(audioHarmAdvance, 0.0);
    int iA = int(mod(floor(h), 6.0)), iB = int(mod(floor(h) + 1.0, 6.0));
    float g = smoothstep(0.2, 0.8, fract(h));
    vec3 col = vec3(0.0);
    if (g < 0.999) col += (1.0 - g) * renderLens(c, d, lensPQ(iA), rb, rc);
    if (g > 0.001) col += g * renderLens(c, d, lensPQ(iB), rb, rc);
    finish(col);
}

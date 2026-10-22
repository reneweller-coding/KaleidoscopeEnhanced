//@doc
 * @brief JULIA SLICE SWEEP 4D: a quaternion Julia set lives in four dimensions; a three-dimensional slice through it
 * wanders along the fourth, and of the slice only its glowing rim is seen -- the edge where the surface turns away
 * from the eye -- a shape of light that swells, splits and closes as the slice moves.  The distance estimate is
 * 0.5 |q| log |q| / |q'| with the derivative carried as 2 |q| |q'|.  One colour family from the photo; the rim's
 * shade follows how far the orbit got.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the slice's place along the fourth dimension (integrated): the body morphs; and the orbit
 *   audioChromaHue -> the key tilts the Julia constant
 *   audioSwell     -> the rim widens
 *
 * Knobs: rimP (how thin the rim), sliceP (how far the slice swings), hueP.  Distinct from
 * QuaternionicJulia4DFlight, which shows the bodies.
//@params rimP sliceP
//@audio audioChromaHue audioSwell
//@body
/**  The quaternion square.
 *
 * @param q  The quaternion. (in)
 *
 * @return
 *   q^2.
 **/
vec4 qsq(vec4 q)
{
    return vec4(q.x * q.x - dot(q.yzw, q.yzw), 2.0 * q.x * q.yzw);
}

/**  The quaternion Julia set's distance in the slice w = w0.
 *
 * @param p    The point in the slice. (in)
 * @param w0   The slice's place along the fourth axis. (in)
 * @param c    The Julia constant. (in)
 * @param it   Returns how many steps the orbit took. (out)
 *
 * @return
 *   The distance estimate.
 **/
float juliaDE(vec3 p, float w0, vec4 c, out float it)
{
    vec4 q = vec4(p, w0);
    float md = 1.0;
    it = 0.0;
    for (int i = 0; i < 11; ++i) {
        md *= 2.0 * length(q);
        q = qsq(q) + c;
        it += 1.0;
        if (dot(q, q) > 16.0) break;
    }
    float r = length(q);
    return 0.5 * r * log(max(r, 1e-6)) / max(md, 1e-6);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float w0 = (0.25 + 0.3 * clamp(sliceP, 0.0, 1.0)) * sin(0.11 * audioAdvance + 0.012 * sceneTime);
    vec4 c = vec4(-0.29, -0.4, 0.34, 0.24) + vec4(0.05 * sin(audioChromaHue), 0.04 * cos(audioChromaHue), 0.0, 0.0);
    float rimPow = 2.0 + 3.0 * clamp(rimP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float orbit = 0.03 * sceneTime + 0.1 * audioAdvance;
    vec3 ro = 1.45 * vec3(cos(orbit), 0.4 * sin(0.7 * orbit), sin(orbit));
    vec3 fw = normalize(-ro + 0.35 * vec3(sin(0.05 * sceneTime), 0.3 * cos(0.04 * sceneTime), cos(0.05 * sceneTime)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * p.y);
    vec3 col = vec3(0.0);
    float t = 0.05, it = 0.0, glow = 0.0;
    bool hit = false;
    for (int i = 0; i < 110; ++i) {
        float d = juliaDE(ro + rd * t, w0, c, it);
        glow += exp(-30.0 * max(d, 0.0)) * 0.02;
        if (d < 0.0008) { hit = true; break; }
        t += d * 0.8;
        if (t > 4.5) break;
    }
    if (hit) {
        vec3 x = ro + rd * t;
        const vec2 e = vec2(0.0015, 0.0);
        float i1;
        vec3 n = normalize(vec3(juliaDE(x + e.xyy, w0, c, i1) - juliaDE(x - e.xyy, w0, c, i1),
                                juliaDE(x + e.yxy, w0, c, i1) - juliaDE(x - e.yxy, w0, c, i1),
                                juliaDE(x + e.yyx, w0, c, i1) - juliaDE(x - e.yyx, w0, c, i1)));
        float rim = pow(1.0 - abs(dot(n, rd)), rimPow - 1.2 * swell);
        col += famLight(fh, clamp(length(x) * 0.7, 0.0, 1.0), 0.4 * rim) * rim * 1.4;
    }
    col += famCol(fh, 0.4) * glow * (0.5 + 0.6 * swell);
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 1.15, 1.00, 0.00, fh));
}

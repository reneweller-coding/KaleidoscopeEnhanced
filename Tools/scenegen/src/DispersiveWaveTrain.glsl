//@doc
 * @brief DISPERSIVE WAVE TRAIN: the Kelvin wake, without a ship -- a point disturbance moving over deep water leaves
 * a wedge of 19.5 degrees filled with transverse waves across its axis and divergent waves along its edges, the
 * classic feathered V.  Here several such wakes drift over the frame in different directions, their patterns
 * crossing; the water refracts the photo, the crests catch the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness  -> rough music sharpens the divergent crests, smooth music keeps them soft
 *   audioAdvance    -> the sources move on (integrated)
 *   audioKick       -> the cusps flash (light)
 *
 * Knobs: sourcesP (how many wakes), waveP (the wavelength), depthP (how strongly the water refracts), hueP.
//@params sourcesP waveP depthP
//@audio audioKick audioRoughness
//@body
/**  The wake of a source at the origin moving along -x, from Kelvin's crest lines: the crests are the curves
 * x = A cos t (1 + sin^2 t), y = A cos^2 t sin t, each crest one value of A.  A point inside the 19.5 degree wedge
 * lies on two crests (a transverse and a divergent one); both are found by bisection on the ratio y / x, and the
 * point is lit where A is near a whole number of wavelengths.
 *
 * @param x    The point in the source's frame (behind the source: x > 0). (in)
 * @param lam  The wavelength. (in)
 * @param ph   The crests' travel (wavelengths). (in)
 * @param ex   The divergent waves' sharpness. (in)
 *
 * @return
 *   The height.
 **/
float wake(vec2 x, float lam, float ph, float ex)
{
    if (x.x <= 0.0) return 0.0;
    float r = abs(x.y) / x.x;
    if (r >= 0.3535) return 0.0;                                // outside the Kelvin wedge
    float h = 0.0;
    for (int br = 0; br < 2; ++br) {
        // f(t) = cos t sin t / (1 + sin^2 t) rises to 0.3535 at t = 0.6155, then falls: one root on each side
        float lo = br == 0 ? 0.0 : 0.6155, hi = br == 0 ? 0.6155 : 1.5707;
        for (int it = 0; it < 12; ++it) {
            float t = 0.5 * (lo + hi);
            float st = sin(t), ct = cos(t);
            float f = ct * st / (1.0 + st * st);
            bool below = f < r;
            if ((br == 0) == below) lo = t; else hi = t;
        }
        float t = 0.5 * (lo + hi);
        float A = x.x / (cos(t) * (1.0 + sin(t) * sin(t)));
        float crest = pow(0.5 + 0.5 * cos(6.2831853 * (A / lam - ph)), br == 0 ? 2.0 : ex);
        h += crest * (br == 0 ? 0.7 : 1.0);
    }
    // stronger toward the cusp line (where the two branches meet), fading with distance
    return h * (0.5 + 0.8 * smoothstep(0.2, 0.35, r)) * exp(-x.x * 0.35) * smoothstep(0.0, 0.05, x.x);
}

void main()
{
    vec2 p = screenP();
    int n = 3 + int(3.0 * clamp(sourcesP, 0.0, 1.0));
    float lam = 0.05 + 0.06 * clamp(waveP, 0.0, 1.0);
    float ex = 2.0 + 10.0 * clamp(audioRoughness, 0.0, 1.0);    // rough music: sharper divergent crests
    float crestRun = 0.6 * sceneTime;
    float h = 0.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= n) break;
        float fi = float(i);
        float a = 6.2831853 * hash11(fi * 3.7);
        vec2 dir = vec2(cos(a), sin(a));
        // the source moves along dir, wrapping round the frame
        float run = fract(0.012 * sceneTime + 0.002 * audioAdvance + hash11(fi * 1.1));
        float travel = run * 4.0 - 1.2;
        float fade = sin(3.14159265 * run);                     // a wake fades out before its source wraps round
        vec2 src = dir * travel + vec2(-dir.y, dir.x) * (hash11(fi * 5.9) - 0.5) * 0.6;
        vec2 d = p - src;
        vec2 local = vec2(-dot(d, dir), dot(d, vec2(-dir.y, dir.x)));   // behind the source: +x
        h += wake(local, lam, crestRun, ex) * fade;
    }
    // the slope from screen-space derivatives (cheap: no second evaluation of the wakes)
    vec2 g = vec2(dFdx(h), dFdy(h)) * resolution.y;
    vec2 uv = p * 0.75 + 0.5 + g * (0.0002 + 0.0008 * clamp(depthP, 0.0, 1.0));
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.45 + 0.2 * h + 0.03 * audioPhase);
    vec3 col = photo * (0.7 + 0.4 * h) + mix(tone, vec3(1.0), 0.6) * smoothstep(0.15, 0.8, h) * 0.6
               * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}

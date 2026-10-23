//@doc
 * @brief RADAR AMBIGUITY RIDGE LATTICE: the ambiguity function of radar: range against Doppler shows peaks and ridges that depend on the signal; the picture shows a lattice of ridges in the colours of the photo that bend with the form of the pulse.  The ambiguity surface of a chirped pulse train: a ridge along range
 * plus chirp times Doppler, repeated at the pulse repetition interval, with the sinc lobes of the train.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the chirp rate (the pulse form) (smoothed)
 *   audioAdvance -> the lattice drifts (integrated)
 *
 * Knobs: sizeP (the pulse repetition), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
float sinc(float x) { return abs(x) < 1e-3 ? 1.0 : sin(x) / x; }
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float pri = 0.22 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float beta = 2.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    vec2 q = p + 0.05 * vec2(sin(0.01 * audioAdvance + 0.02 * sceneTime), cos(0.012 * audioAdvance));
    float tau = q.x;
    float nu = q.y * 3.5;
    float k = floor(tau / pri + 0.5);
    float tl = tau - k * pri;
    float T = pri * 0.48;
    float tri = clamp(1.0 - abs(tl) / T, 0.0, 1.0);
    float arg = 3.1415927 * (nu * 1.6 + beta * tl * 4.0) * (0.5 + 0.5 * tri);
    float chirp = abs(sinc(arg));
    float train = abs(sinc(3.1415927 * 2.0 * nu * 0.5 + 1e-3));
    float env = exp(-abs(k) * 0.35);
    float v = pow(chirp * tri, 1.2) * (0.35 + 0.65 * train) * env;
    float ridge = smoothstep(0.1, 0.8, v);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 col = c * (0.14 + 1.6 * ridge) + vec3(0.9, 0.95, 1.0) * pow(v, 3.0) * 0.3 + imgLod(p * 0.85 + 0.5, 2.5) * 0.08;
    finish(col);
}

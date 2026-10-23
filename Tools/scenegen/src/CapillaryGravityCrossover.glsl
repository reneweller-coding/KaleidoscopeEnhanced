//@doc
 * @brief CAPILLARY GRAVITY CROSSOVER: the passage from gravity waves to capillary waves, at the minimum of the phase velocity: large waves roll slowly on, small ripples run ahead of them and curl in front, the shortest fastest of all; the
 * photo is moved by the sum and shaded by the surface's slope, so the picture has long swells with a fine sparkle of ripples on them.  The crossover wavelength follows the spectral spread, the sea runs on with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the crossover wave number (more spread, more of the picture rippled)
 *   audioSwell      -> the height of the waves
 *   audioAdvance    -> the water runs on (integrated)
 *
 * Knobs: rippleP (the strength of the ripples), hueP.
//@params rippleP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float tt = 0.5 * sceneTime + 0.4 * audioAdvance;
    float kc = 6.0 + 18.0 * clamp(audioSpread, 0.0, 1.0);
    float A = 0.3 * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float rp = 0.3 + 1.2 * clamp(rippleP, 0.0, 1.0);
    vec2 D = vec2(0.0), G = vec2(0.0);
    for (int i = 0; i < 32; ++i) {
        float fi = float(i);
        vec3 h = vec3(hash11(fi * 3.17 + 0.3), hash11(fi * 7.31 + 1.1), hash11(fi * 1.93 + 5.7));
        float k = 1.5 * exp(h.x * 3.6);
        float th = 0.3 + (h.y - 0.5) * 2.2;
        vec2 dir = vec2(cos(th), sin(th));
        float w = 0.9 * sqrt(k * (1.0 + (k / kc) * (k / kc)));
        float ph = k * dot(p, dir) - w * tt + 6.2831853 * h.z;
        float a = A * (3.0 / k) * (k > kc ? rp : 1.0) / 3.0;
        D += a * dir * cos(ph);
        G += a * k * dir * cos(ph);
    }
    vec3 c = imgLod((p + D) * 0.8 + 0.5, 0.7);
    vec3 n = normalize(vec3(-G * 0.5, 1.0));
    float lam = clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(vec3(-0.4, 0.5, 1.8))), 0.0, 1.0), 50.0);
    finish(c * (0.55 + 0.6 * lam) + 0.3 * spec * mix(c, vec3(1.0), 0.5));
}

//@doc
 * @brief SEA SPECTRUM PHOTO: a sea after the Pierson-Moskowitz spectrum: dozens of waves of every length, the long ones faster than the short (deep water, omega over the root of k), in which the photo rocks in swells and never repeats; the
 * photo is moved by the orbits of the water particles and shaded by the slope of the surface.  The spectrum of wave numbers is filled by the spectrum of the music -- the peak of the sea moves to the shorter waves as the music turns brighter (the
 * spectral rolloff) and the sea spreads over more directions as the spectrum widens.  The sea runs on with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRolloff    -> the peak wave number of the sea (bass: long waves, highs: short ones)
 *   audioSpread     -> the spread of the directions
 *   audioSwell      -> the height of the sea
 *   audioAdvance    -> the sea runs on (integrated)
 *
 * Knobs: seaP (the base height of the sea), hueP.
//@params seaP
//@audio audioRolloff audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float tt = 0.5 * sceneTime + 0.4 * audioAdvance;
    float k0 = 3.0 + 9.0 * clamp(audioRolloff, 0.0, 1.0);
    float wind = 0.4 * sin(0.02 * sceneTime);
    float spreadA = 0.5 + 1.8 * clamp(audioSpread, 0.0, 1.0);
    float A = (0.1 + 0.18 * clamp(seaP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec2 D = vec2(0.0), G = vec2(0.0);
    float eta = 0.0;
    for (int i = 0; i < 32; ++i) {
        float fi = float(i);
        vec3 h = vec3(hash11(fi * 3.17 + 0.3), hash11(fi * 7.31 + 1.1), hash11(fi * 1.93 + 5.7));
        float k = 1.5 * exp(h.x * 3.6);
        float th = wind + (h.y - 0.5) * spreadA;
        vec2 dir = vec2(cos(th), sin(th));
        float w = 0.9 * sqrt(k);
        float ph = k * dot(p, dir) - w * tt + 6.2831853 * h.z;
        float a = A * (k0 / k) * exp(-0.35 * (k0 / k) * (k0 / k)) / 5.0;
        D += a * dir * cos(ph);
        eta += a * sin(ph);
        G += a * k * dir * cos(ph);
    }
    vec3 c = imgLod((p + D * 0.8 + vec2(0.0, 0.3 * eta)) * 0.8 + 0.5, 0.7);
    vec3 n = normalize(vec3(-G * 0.5, 1.0));
    float lam = clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(vec3(-0.4, 0.5, 1.8))), 0.0, 1.0), 40.0);
    finish(c * (0.55 + 0.6 * lam) + 0.25 * spec * mix(c, vec3(1.0), 0.5));
}

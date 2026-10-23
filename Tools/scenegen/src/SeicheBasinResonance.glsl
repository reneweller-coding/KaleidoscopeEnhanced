//@doc
 * @brief SEICHE BASIN RESONANCE: seiches, the standing waves of a basin: the modes of a rectangular basin with the frequencies of their wave numbers, which overlap and beat with one another; the photo sloshes to and fro in the
 * basin with the water, its colour shifting along the slope of the surface and its light dipping where the water is low.  The mode frequencies are those of the harmonics (the partials of a note), the amplitudes follow the swell of
 * the music, and the pattern of beats is the sum of the nearly equal frequencies.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the partials' frequencies drift with the chords
 *   audioSwell      -> the amplitude of the sloshing
 *
 * Knobs: modeP (how many modes), hueP.
//@params modeP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 q = vec2(p.x / asp + 0.5, 0.5 - p.y);
    float tt = 0.6 * sceneTime;
    float f0 = 0.5 * (1.0 + 0.06 * sin(0.45 * audioHarmAdvance));
    float A = 0.15 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    float nm = 3.0 + 5.0 * clamp(modeP, 0.0, 1.0);
    vec2 D = vec2(0.0);
    float eta = 0.0;
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float m = 1.0 + mod(fi * 2.0, 4.0);
        float n = floor(fi * 0.5);
        float w = f0 * (1.0 + 0.55 * sqrt(m * m * 0.4 + n * n) * 2.0 + 0.0 * fi);
        float wt = clamp(nm - fi, 0.0, 1.0);
        float a = A * wt / (1.0 + 0.5 * fi);
        float cx = cos(3.1415927 * m * q.x), cy = cos(3.1415927 * n * q.y);
        float sx = sin(3.1415927 * m * q.x);
        float ct = cos(6.2831853 * w * tt + fi);
        float st = sin(6.2831853 * w * tt + fi);
        eta += a * cx * cy * ct;
        D.x += a * 0.5 * sx * cy * st;
        D.y += a * 0.3 * cx * sin(3.1415927 * n * q.y) * st * (n > 0.5 ? 1.0 : 0.0);
    }
    vec3 c = imgLod((p + D * 1.5) * 0.8 + 0.5, 0.7);
    finish(c * (0.9 + 1.2 * eta) * 1.05);
}

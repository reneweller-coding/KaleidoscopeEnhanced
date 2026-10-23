//@doc
 * @brief BOGOLIUBOV SHOCK FRONTS: waves in a superfluid: long waves run at a constant speed of sound, short ones faster, in proportion to the square of the wave number (Bogoliubov's dispersion); a source moving faster than sound leaves a
 * cone of shock fronts, the Mach cone, whose fine ripples run ahead of it in the cone's edge.  Three sources move over the picture and every one draws its wake: the photo is shifted by the wakes and shaded by their slopes.  The speed of
 * the sources follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the speed of the sources (above the speed of sound)
 *   audioAdvance    -> the sources move (integrated)
 *
 * Knobs: waveP (the strength of the wakes), hueP.
//@params waveP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.06 * audioAdvance;
    float c0 = 1.0;
    float V = c0 * (1.25 + 1.4 * clamp(audioSwell, 0.0, 1.0));
    float thm = acos(clamp(c0 / V, 0.0, 1.0));
    float A = 0.012 + 0.03 * clamp(waveP, 0.0, 1.0);
    vec2 D = vec2(0.0);
    for (int s = 0; s < 3; ++s) {
        float fs = float(s);
        vec2 pos = vec2(0.6 * sin(1.0 * t + 2.0 * fs), 0.3 * sin(1.37 * t + 1.3 * fs));
        vec2 vel = vec2(0.6 * cos(1.0 * t + 2.0 * fs), 0.3 * 1.37 * cos(1.37 * t + 1.3 * fs));
        float va = atan(vel.y, vel.x);
        vec2 rel = rot2(-va) * (p - pos);
        float eta = 0.0;
        vec2 grd = vec2(0.0);
        for (int j = 0; j < 24; ++j) {
            float u = (float(j) + 0.5) / 24.0;
            float th = (u * 2.0 - 1.0) * thm * 0.98;
            float k = 2.0 * sqrt(max(V * V * cos(th) * cos(th) - c0 * c0, 0.0)) * 14.0;
            vec2 kv = k * vec2(cos(th), sin(th));
            float ph = dot(kv, rel);
            float wgt = (1.0 - abs(u * 2.0 - 1.0) * 0.5) / (1.0 + 0.04 * k);
            eta += wgt * sin(ph);
            grd += wgt * cos(ph) * kv;
        }
        float behind = smoothstep(0.1, -0.2, rel.x);
        D += A * (rot2(va) * grd) * 0.02 * behind * 3.0;
    }
    vec3 c = imgLod((p + D) * 0.8 + 0.5, 0.7);
    finish(c * (0.8 + 0.2 * clamp(length(D) * 25.0, 0.0, 1.0)) * 1.08);
}

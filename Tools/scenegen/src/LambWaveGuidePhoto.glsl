//@doc
 * @brief LAMB WAVE GUIDE PHOTO: Lamb waves in a plate: symmetric and antisymmetric modes, each with a dispersion of its own -- the slow flexural mode that turns to a surface wave at high frequency, the fast extensional mode, and the
 * higher modes that appear only above their cut-off frequency -- which lie on top of one another and draw streaky patterns of interference in the photo.  The number of modes follows the key (a new mode fading in).  The plate rings on with
 * the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of modes (a new one fading in)
 *   audioAdvance    -> the plate rings on (integrated)
 *   audioSwell      -> the size of the waves
 *
 * Knobs: plateP (the thickness of the plate), hueP.
//@params plateP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float tt = 0.5 * sceneTime + 0.4 * audioAdvance;
    float nm = 1.5 + 2.5 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float thick = 0.6 + 0.8 * clamp(plateP, 0.0, 1.0);
    float A = 0.2 * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec2 D = vec2(0.0), G = vec2(0.0);
    for (int m = 0; m < 4; ++m) {
        float fm = float(m);
        float wm = clamp(nm - fm, 0.0, 1.0);
        for (int i = 0; i < 8; ++i) {
            float fi = float(i) + 8.0 * fm;
            vec3 h = vec3(hash11(fi * 3.17 + 0.3), hash11(fi * 7.31 + 1.1), hash11(fi * 1.93 + 5.7));
            float k = 3.0 * exp(h.x * 2.4) / thick;
            float th = 6.2831853 * h.y;
            vec2 dir = vec2(cos(th), sin(th));
            float w = m == 0 ? 0.04 * k * k / sqrt(1.0 + 0.02 * k * k) : (m == 1 ? 1.6 * k / sqrt(1.0 + 0.1 * k) : sqrt(pow(4.0 + 3.0 * fm, 2.0) + 1.6 * k * k));
            float ph = k * dot(p, dir) - w * tt + 6.2831853 * h.z;
            float a = wm * A / (1.0 + 0.15 * k);
            D += a * dir * cos(ph);
            G += a * k * dir * cos(ph);
        }
    }
    vec3 c = imgLod((p + D) * 0.8 + 0.5, 0.7);
    vec3 n = normalize(vec3(-G * 0.3, 1.0));
    float lam = clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    finish(c * (0.6 + 0.5 * lam));
}

//@doc
 * @brief EUCLIDEAN PHOTO RINGS: four rings, each carrying a Euclidean rhythm -- three in eight, five in eight, seven in twelve, five in sixteen -- the hits of the rings are windows into the photo,
 * and the rings turn through one another, a flash at the top as each hit passes the pointer; where the rings are dark only a faint ghost of the photo stays.  With the spectral spread more hits join each ring (crossing over).
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the rings turn a whole number of times in a phrase (so the pattern closes)
 *   audioSpread     -> more hits per ring, crossing over
 *   audioBarPhase   -> a soft pulse over the whole bar
 *
 * Knobs: ringP (the width of the rings), hueP.
//@params ringP
//@audio audioSpread
//@body
/**  Whether a step is a hit in the Euclidean rhythm of h hits in n steps.
 *
 * @param k  The step. (in)
 * @param n  The number of steps. (in)
 * @param h  The number of hits. (in)
 *
 * @return
 *   1 for a hit, otherwise 0.
 **/
float eucHit(int k, int n, int h) { return ((k * h) % n) < h ? 1.0 : 0.0; }
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float r = length(p), a = atan(p.y, p.x);
    float ph = rhyPhrase();
    float sp = smoothstep(0.25, 0.75, clamp(audioSpread, 0.0, 1.0));
    float w = 0.03 + 0.03 * clamp(ringP, 0.0, 1.0);
    vec3 col = imgLod(uv, 3.0) * 0.3;
    vec3 c = imgLod(uv, 0.6);
    float top = exp(-pow((mod(a - 1.5707963 + 3.1415927, 6.2831853) - 3.1415927) / 0.12, 2.0));
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float rc = 0.13 + 0.105 * fi;
        int n = i == 0 ? 8 : (i == 1 ? 8 : (i == 2 ? 12 : 16));
        int h = i == 0 ? 3 : (i == 1 ? 5 : (i == 2 ? 7 : 5));
        float m = i == 0 ? 2.0 : (i == 1 ? -3.0 : (i == 2 ? 4.0 : -2.0));
        float ang = a - 6.2831853 * m * ph;
        float s = (ang / 6.2831853 + 1.0) * float(n);
        float sf = mod(s, float(n));
        int k = int(sf);
        float fk = fract(sf);
        float hit = mix(eucHit(k, n, h), eucHit(k, n, h + 2), sp);
        float arc = smoothstep(0.0, 0.1, fk) * smoothstep(1.0, 0.9, fk);
        float band = smoothstep(w, w - 0.012, abs(r - rc));
        col += smoothstep(w + 0.006, w, abs(r - rc)) * 0.025;
        col = mix(col, c * (1.0 + 0.8 * hit * top), band * hit * arc);
    }
    col = mix(col, c * 1.2, smoothstep(0.045, 0.035, r));
    finish(col * (0.95 + 0.15 * sin(6.2831853 * rhyBar())));
}

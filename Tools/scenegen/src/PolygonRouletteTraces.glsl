//@doc
 * @brief POLYGON ROULETTE TRACES: a field of rolling polygons: in each cell a wheel rolls round a polygon-shaped
 * track, and a pen on its spoke traces a roulette -- a trochoid whose loops bulge at the track's corners and flatten
 * along its sides -- the traces together filling the picture like lace.  The track is a regular polygon in polar
 * form, r(theta) = cos(pi / n) / cos(mod(theta, 2 pi / n) - pi / n); the pen sits on a circle turning k times as
 * fast as the wheel goes round.  Each trace is a closed curve sampled and drawn; the pen is a bright point on it.
 * The traces' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the track's corner count follows the chord changes (3, 4, 5, 6; the light cross-faded)
 *   audioAdvance     -> the pens roll on (integrated)
 *   audioSwell       -> the traces' glow
 *
 * Knobs: loopP (how many loops per round), cellP (the cells' size), hueP.
//@params loopP cellP
//@audio audioHarmAdvance audioSwell
//@body
/**  A roulette's distance and its pen's.
 *
 * @param q     The point (cell units). (in)
 * @param n     The track's corners. (in)
 * @param k     The loops per round. (in)
 * @param run   The pen's place. (in)
 * @param pen   Returns the distance to the pen. (out)
 *
 * @return
 *   The distance to the trace.
 **/
float roulette(vec2 q, float n, float k, float run, out float pen)
{
    float best = 1e9;
    vec2 prev = vec2(0.0);
    float sec = 6.2831853 / n;
    for (int i = 0; i <= 160; ++i) {
        float t = 6.2831853 * float(i) / 160.0;
        float rb = 0.28 * cos(3.14159265 / n) / cos(mod(t, sec) - 0.5 * sec);
        vec2 cur = rb * vec2(cos(t), sin(t)) + 0.13 * vec2(cos(k * t), sin(k * t));
        if (i > 0) {
            vec2 e = cur - prev;
            best = min(best, length(q - prev - e * clamp(dot(q - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0)));
        }
        prev = cur;
    }
    float rbr = 0.28 * cos(3.14159265 / n) / cos(mod(run, sec) - 0.5 * sec);
    pen = length(q - (rbr * vec2(cos(run), sin(run)) + 0.13 * vec2(cos(k * run), sin(k * run))));
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float S = 0.5 + 0.25 * clamp(cellP, 0.0, 1.0);
    float k = -floor(6.0 + 8.0 * clamp(loopP, 0.0, 1.0));       // negative: the pen turns against the round (loops)
    float run = 0.15 * sceneTime + 0.6 * audioAdvance;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 cid = floor(p / S + 0.5);
    vec2 q = (p - cid * S) / S;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    q = rot2(6.2831853 * hc) * q;
    float nA = 3.0 + mod(hk + floor(hc * 4.0), 4.0), nB = 3.0 + mod(hk + 1.0 + floor(hc * 4.0), 4.0);
    float pA, pB = 1e9;
    float dA = roulette(q, nA, k, run + 6.0 * hc, pA);
    float dB = hm > 0.002 ? roulette(q, nB, k, run + 6.0 * hc, pB) : 1e9;
    float g = (1.0 - hm) * (exp(-pow(dA / 0.005, 2.0)) + 0.15 * exp(-dA / 0.02))
            + hm * (exp(-pow(dB / 0.005, 2.0)) + 0.15 * exp(-dB / 0.02));
    float pen = (1.0 - hm) * exp(-pow(pA / 0.02, 2.0)) + hm * exp(-pow(pB / 0.02, 2.0));
    vec3 col = (famLight(fh, 0.2 + 0.6 * hc, 0.3) * g + famLight(fh, 0.5, 0.85) * pen) * glow;
    finish(famExpose(col, 2.50, 0.70, 0.03, fh));
}

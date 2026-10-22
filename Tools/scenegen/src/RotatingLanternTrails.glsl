//@doc
 * @brief ROTATING LANTERN TRAILS: lanterns on rotating arms -- an arm turning on the end of another arm -- in many
 * depth planes, photographed in long exposure: each draws a ring of warm light that loops into spirals and
 * rosettes (an epitrochoid), the planes overlapping to fill the room.  A lantern's trail is the closed curve
 * x = R1 e^(i t) + R2 e^(i k t) for its arms' speed ratio k; the lantern itself is a bright point running along it.
 * The rigs stand on a jittered grid in three depth planes, the far ones smaller and dimmer.  The light is shades of
 * one colour family from the photo, warm toward white at the lanterns.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the arms' speed ratio (3, 4, 5, 6) shifts with the chord changes (the light cross-faded)
 *   audioAdvance     -> the lanterns run round their trails (integrated)
 *   audioSwell       -> the trails' glow
 *
 * Knobs: rigP (how many rigs), loopP (the inner arm's length), hueP.
//@params rigP loopP
//@audio audioHarmAdvance audioSwell
//@body
/**  A rig's trail distance and its lantern's.
 *
 * @param q     The point (rig centre at 0, scale 1). (in)
 * @param k     The arms' speed ratio. (in)
 * @param r2    The inner arm's length. (in)
 * @param run   The lantern's place. (in)
 * @param lamp  Returns the distance to the lantern. (out)
 *
 * @return
 *   The distance to the trail.
 **/
float trail(vec2 q, float k, float r2, float run, out float lamp)
{
    float best = 1e9;
    vec2 prev = vec2(0.3 + r2, 0.0);
    for (int i = 1; i <= 90; ++i) {
        float t = 6.2831853 * float(i) / 90.0;
        vec2 cur = 0.3 * vec2(cos(t), sin(t)) + r2 * vec2(cos(k * t), sin(k * t));
        vec2 e = cur - prev;
        best = min(best, length(q - prev - e * clamp(dot(q - prev, e) / dot(e, e), 0.0, 1.0)));
        prev = cur;
    }
    lamp = length(q - (0.3 * vec2(cos(run), sin(run)) + r2 * vec2(cos(k * run), sin(k * run))));
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float r2 = 0.08 + 0.1 * clamp(loopP, 0.0, 1.0);
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.2 * sceneTime + 0.9 * audioAdvance;
    float S = 0.7 - 0.25 * clamp(rigP, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int L = 2; L >= 0; --L) {
        float fl = float(L);
        float sc = 1.0 + 0.7 * fl;
        vec2 q0 = p * sc + vec2(0.3 * fl, 0.17 * fl);
        vec2 cid = floor(q0 / S + 0.5);
        vec2 q = (q0 - cid * S) / S;
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233)) + 9.0 * fl) * 43758.5453);
        q = rot2(6.2831853 * hc) * q;
        float kA = 3.0 + mod(hk + floor(hc * 4.0), 4.0), kB = 3.0 + mod(hk + 1.0 + floor(hc * 4.0), 4.0);
        float lA, lB;
        float dA = trail(q, kA, r2, run + 6.2831853 * hc, lA);
        float dB = hm > 0.002 ? trail(q, kB, r2, run + 6.2831853 * hc, lB) : 1e9;
        if (hm <= 0.002) lB = 1e9;
        float g = (1.0 - hm) * (exp(-pow(dA / 0.008, 2.0)) * 0.6 + 0.12 * exp(-dA / 0.03))
                + hm * (exp(-pow(dB / 0.008, 2.0)) * 0.6 + 0.12 * exp(-dB / 0.03));
        float lamp = (1.0 - hm) * exp(-pow(lA / 0.025, 2.0)) + hm * exp(-pow(lB / 0.025, 2.0));
        col += (famLight(fh, 0.1 + 0.3 * hc, 0.3) * g + famLight(fh, 0.15, 0.85) * lamp) * glow / (1.0 + 0.8 * fl);
    }
    finish(famExpose(col, 1.85, 0.80, 0.00, fh));
}

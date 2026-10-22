//@doc
 * @brief POI FLOWER PATTERNS: a grid of poi spinners photographed in long exposure: each pair of glowing poi draws a
 * flower -- the hand circling slowly, the poi head circling fast round it, against the hand's turn (antispin: petals
 * pointing inward) or with it (inspin: loops outward) -- and the flowers overlap into a carpet of light.  A head's
 * path is x = R1 e^(i t) + R2 e^(i k t), closed for whole k, with |k - 1| petals; the long exposure shows the whole
 * path, the head itself a bright point running along it.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance   -> the petal count steps with the chord changes (the light of two counts cross-faded)
 *   audioSectionId/Age -> every new section turns antispin into inspin and back (gliding: the two patterns cross-faded)
 *   audioAdvance       -> the heads run round their flowers (integrated)
 *
 * Knobs: cellP (the flowers' size), headP (the poi heads' brightness), hueP.
//@params cellP headP
//@audio audioHarmAdvance audioSectionId audioSectionPrev audioSectionAge
//@body
/**  A poi flower's distance and its head's.
 *
 * @param q     The point (flower centre at 0). (in)
 * @param k     The head's turn ratio (negative: antispin). (in)
 * @param run   The head's place (radians of the hand's turn). (in)
 * @param head  Returns the distance to the head. (out)
 *
 * @return
 *   The distance to the path.
 **/
float flower(vec2 q, float k, float run, out float head)
{
    const float R1 = 0.2, R2 = 0.22;
    float best = 1e9;
    vec2 prev = vec2(R1 + R2, 0.0);
    for (int i = 1; i <= 96; ++i) {
        float t = 6.2831853 * float(i) / 96.0;
        vec2 cur = R1 * vec2(cos(t), sin(t)) + R2 * vec2(cos(k * t), sin(k * t));
        vec2 e = cur - prev;
        best = min(best, length(q - prev - e * clamp(dot(q - prev, e) / dot(e, e), 0.0, 1.0)));
        prev = cur;
    }
    vec2 hp = R1 * vec2(cos(run), sin(run)) + R2 * vec2(cos(k * run), sin(k * run));
    head = length(q - hp);
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float S = 0.42 + 0.25 * clamp(cellP, 0.0, 1.0);
    float sA = mod(max(audioSectionPrev, 0.0), 2.0) * 2.0 - 1.0, sB = mod(max(audioSectionId, 0.0), 2.0) * 2.0 - 1.0;
    float sm = smoothstep(0.0, 6.0, audioSectionAge);
    float run = 0.15 * sceneTime + 0.6 * audioAdvance;
    vec2 cid = floor(p / S + 0.5);
    vec2 q = (p - cid * S) / S * 1.15;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    q = rot2(6.2831853 * hc) * q;
    vec3 col = vec3(0.0);
    for (int j = 0; j < 4; ++j) {
        float wHarm = (j & 1) == 0 ? 1.0 - hm : hm;
        float wSpin = j < 2 ? 1.0 - sm : sm;
        float w = wHarm * wSpin;
        if (w < 0.002) continue;
        float petals = 3.0 + mod(hk + float(j & 1) + floor(hc * 3.0), 4.0);
        float sgn = j < 2 ? sA : sB;
        float k = sgn < 0.0 ? 1.0 - petals : 1.0 + petals;       // antispin petals point in, inspin loops out
        float head;
        float d = flower(q, k, run + 6.2831853 * hc, head);
        float g = exp(-pow(d / 0.006, 2.0)) * 0.6 + 0.12 * exp(-d / 0.025);
        float hd = exp(-pow(head / 0.02, 2.0)) * (0.6 + 1.0 * clamp(headP, 0.0, 1.0));
        col += famLight(fh, 0.2 + 0.6 * hc, 0.3) * (g + hd) * w;
    }
    finish(col);
}

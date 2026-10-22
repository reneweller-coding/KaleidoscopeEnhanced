//@doc
 * @brief MESH GRADIENT SILK: soft gradients flowing like silk between a handful of colour points taken from the photo,
 * with a faint sheen running across them; the colour points wander, and with every chord change they set out for new
 * places.  The colour at a place is the points' colours weighted by the inverse of the distance to each (to the power
 * three), which blends them as smoothly as a mesh gradient; each point drifts on its own slow path round a place that
 * the harmony chooses, cross-faded as a chord changes; the sheen is fine bands along a slowly turning direction.  The
 * colours are the photo's, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the colour points set out for new places with every chord change (cross-faded)
 *   audioAdvance     -> the points drift on their paths (integrated)
 *   audioSwell       -> the sheen's strength
 *
 * Knobs: pointsP (how many colour points), sheenP (the sheen's strength), hueP.
//@params pointsP sheenP
//@audio audioHarmAdvance audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(4.0 + 4.0 * clamp(pointsP, 0.0, 1.0));
    float run = 0.06 * sceneTime + 0.25 * audioAdvance;
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int k = 0; k < 8; ++k) {
        float i = float(k);
        if (i >= n) break;
        vec2 hA = hash22(vec2(i, mod(hk, 11.0))), hB = hash22(vec2(i, mod(hk + 1.0, 11.0)));
        vec2 home = mix(hA, hB, m) - 0.5;
        vec2 c = home * vec2(1.6, 0.9) + 0.15 * vec2(sin(run * (0.7 + 0.1 * i) + 2.0 * i), cos(run * (0.6 + 0.13 * i) + i));
        vec3 col = tone(imgLod(vec2(0.15 + 0.7 * fract(i * 0.618034), 0.2 + 0.6 * fract(i * 0.381966)), 3.0), fh);
        float d2 = dot(p - c, p - c);
        float w = 1.0 / pow(d2 + 0.02, 1.5);
        acc += col * w;
        wsum += w;
    }
    vec3 col = acc / wsum;
    float ta = 0.03 * sceneTime;
    vec2 dir = vec2(cos(ta), sin(ta));
    float flow = dot(p, dir) * 90.0 + 4.0 * fbm(p * 2.0 + 0.02 * sceneTime);
    float sheen = pow(0.5 + 0.5 * sin(flow), 3.0) * (0.015 + 0.05 * clamp(sheenP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    col = col * 0.9 + vec3(1.0) * sheen * luma(col) * 2.0;
    finish(col);
}

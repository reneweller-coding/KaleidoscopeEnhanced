//@doc
 * @brief CONFORMAL KALEIDO BLOOM: a rosette that wells up endlessly out of one point and drains into another -- a
 * source and a sink joined by a Moebius map: w = (z - a) / (z - b) sends the source a to 0 and the sink b to
 * infinity, so in log w (log |w|, arg w) the stream between them is a straight shift.  The rosette lives in those
 * log coordinates, periodic in the shift, so the flow runs forever without a seam: rings bloom out of a, sweep over
 * the frame and close round b.  The mirror fold is taken in arg w, so the petals stay petals all the way.  The
 * photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the stream's strength (integrated: the rings flow faster with the music)
 *   audioHarmAdvance -> the source and the sink wander with the chord changes
 *   audioSwell       -> the rings' light
 *
 * Knobs: petalP (the petals' count), ringP (the rings' spacing), hueP.  Distinct from the chains with a Moebius map,
 * which fold without a source and a sink.
//@params petalP ringP
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
    float h = max(audioHarmAdvance, 0.0);
    float petals = floor(5.0 + 5.0 * clamp(petalP, 0.0, 1.0));
    float period = 0.6 + 0.5 * clamp(ringP, 0.0, 1.0);          // log |w| per ring
    vec2 a = vec2(-0.45, -0.1) + 0.12 * vec2(sin(0.7 * h), cos(0.5 * h));
    vec2 b = vec2(0.5, 0.15) + 0.12 * vec2(cos(0.6 * h + 1.0), sin(0.45 * h));
    float flow = 0.05 * sceneTime + 0.25 * audioAdvance;
    // w = (z - a) / (z - b)
    vec2 nu = p - a, de = p - b;
    vec2 w = vec2(nu.x * de.x + nu.y * de.y, nu.y * de.x - nu.x * de.y) / max(dot(de, de), 1e-6);
    float u = log(max(length(w), 1e-6)) - flow;                 // the stream: a shift in log |w|
    float v = atan(w.y, w.x);
    // the rosette in (u, v): rings periodic in u, petals mirrored in v
    float uu = abs(fract(u / period) * 2.0 - 1.0);               // mirrored rings: no seam as the flow runs
    float sec = 6.2831853 / petals;
    float vv = abs(mod(v, sec) - 0.5 * sec) / (0.5 * sec);
    vec2 uv = vec2(0.15 + 0.7 * uu, 0.15 + 0.7 * vv);
    vec3 col = tone(imgLod(uv, 0.7), fh);
    col *= 0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    // the source glows, the sink darkens
    col += famLight(fh, 0.6, 0.6) * 0.25 * exp(-length(p - a) * 9.0);
    col *= smoothstep(0.0, 0.08, length(p - b));
    finish(col);
}

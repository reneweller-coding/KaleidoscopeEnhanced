//@doc
 * @brief CALCITE DOUBLE IMAGE: the photo seen through a large calcite rhomb: inside the crystal everything is double,
 * two pictures shifted against each other, polarised across each other; as the crystal turns the two pictures circle
 * round each other, and a slowly turning polariser lets one fade while the other comes up.  The crystal is a rhombus
 * with the calcite's 78/102-degree angles, larger than half the screen, with bright edges and a faint third picture
 * from the inner reflection; outside it the photo shows single and dimmed.  The pictures are offset by the walk-off
 * vector, which turns with the crystal; their strengths follow cos^2 and sin^2 of the angle between polariser and
 * crystal.  The photo's colours, calmed toward one colour family, the two pictures a shade apart.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> how far apart the two pictures are (the walk-off)
 *   audioAdvance -> the crystal turns (integrated): the pictures circle each other
 *
 * Knobs: sizeP (the crystal's size), splitP (the base walk-off), hueP.
//@params sizeP splitP
//@audio audioSwell
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
    float turn = 0.02 * sceneTime + 0.08 * audioAdvance;
    float pol = 0.05 * sceneTime;                                   // the polariser turns on its own, slowly
    float sep = (0.02 + 0.03 * clamp(splitP, 0.0, 1.0)) * (0.6 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    vec2 walk = sep * vec2(cos(turn + 0.6), sin(turn + 0.6));
    float A = 0.55 + 0.2 * clamp(sizeP, 0.0, 1.0);
    // the rhomb in its own frame: q = a e1 + b e2 with the edges e1, e2 at 78 degrees
    vec2 c = 0.08 * vec2(sin(0.5 * turn), cos(0.37 * turn));
    vec2 q = rot2(-turn) * (p - c);
    const float CA = 0.2079117, SA = 0.9781476;                     // cos, sin of 78 degrees
    float b = q.y / SA, a = q.x - b * CA;
    float edge = min(A - abs(a), A * 0.75 - abs(b)) * SA;
    float inside = smoothstep(0.0, 0.004, edge);
    vec2 uv = p * 0.6 + 0.5;
    vec3 single = tone(imgLod(uv, 0.5), fh);
    float w = pow(cos(pol - turn), 2.0);
    vec3 o = tone(imgLod(uv - 0.3 * walk, 0.5), fh) * mix(vec3(1.0), famCol(fh, 0.3), 0.15);
    vec3 e = tone(imgLod(uv + 0.3 * walk, 0.5), fh) * mix(vec3(1.0), famCol(fh, 0.7), 0.15);
    vec3 ghost = tone(imgLod(uv + 0.9 * walk, 1.5), fh);
    vec3 dbl = o * (0.2 + 0.7 * w) + e * (0.2 + 0.7 * (1.0 - w)) + ghost * 0.08;
    vec3 col = mix(single * 0.45, dbl, inside);
    // the crystal's edges catch the light, and the faces near them a soft sheen
    col += famLight(fh, 0.6, 0.85) * (exp(-pow(edge / 0.004, 2.0)) * 0.7 + exp(-max(edge, 0.0) / 0.05) * 0.06 * inside);
    finish(col);
}

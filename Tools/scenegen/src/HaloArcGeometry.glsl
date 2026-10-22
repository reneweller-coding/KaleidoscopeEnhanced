//@doc
 * @brief HALO ARC GEOMETRY: the halo arcs of ice crystals drawn as pure light geometry from several suns at once: round
 * each sun the 22-degree ring with its warm inner edge and a fainter 46-degree ring, the parhelic circle as a level
 * band through the sun, sundogs either side and the tangent arcs above and below that bend from wings into a ring as
 * the crystals tilt -- the suns' figures overlap into a net over the whole picture.  Halo light has a sharp inner edge
 * and fades outward; the sundogs move out as the crystals tilt (their offset grows like 1/cos of the tilt), the
 * tangent arcs are parabolas whose bend follows the tilt.  The photo tints the sky; the arcs are shades of one colour
 * family with white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the crystals' tilt glides with the chords: sundogs move out, tangent arcs bend into rings
 *   audioAdvance     -> the suns wander (integrated)
 *   audioSwell       -> the arcs' brightness
 *
 * Knobs: sunP (how many suns), ringP (the halos' size), hueP.
//@params sunP ringP
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

/**  A halo line's light: a sharp inner edge and a soft fall-off outward, as halos look.
 *
 * @param d  The signed distance from the line (negative toward the sun). (in)
 * @param w  The outward fall-off. (in)
 *
 * @return
 *   The light, 0..1.
 **/
float haloLine(float d, float w)
{
    return exp(-pow(min(d, 0.0) / 0.004, 2.0)) * exp(-max(d, 0.0) / w);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float ns = floor(3.0 + 3.0 * clamp(sunP, 0.0, 1.0));
    float R = 0.2 + 0.12 * clamp(ringP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float tilt = 0.5 + 0.5 * sin(0.6 * h);
    float wander = 0.02 * sceneTime + 0.08 * audioAdvance;
    float bright = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = tone(imgLod(p * 0.5 + 0.5, 6.0), fh) * 0.08 + famCol(fh, 0.4) * 0.02;
    vec3 warm = famCol(fh, 0.25), white = famLight(fh, 0.6, 0.85);
    for (int s = 0; s < 6; ++s) {
        float fs = float(s);
        if (fs >= ns) break;
        vec2 sun = vec2(0.75 * sin(wander * (0.7 + 0.2 * fs) + 2.1 * fs), 0.35 * sin(wander * (0.5 + 0.15 * fs) + 1.3 * fs + 0.5));
        vec2 d = p - sun;
        float r = length(d);
        float R2 = R * (0.9 + 0.2 * fract(fs * 0.618));
        // the rings: the inner edge warm, the outer fall-off white
        float d22 = r - R2;
        vec3 l = mix(warm, white, smoothstep(0.0, 0.03, d22)) * haloLine(d22, 0.05);
        l += mix(warm, white, smoothstep(0.0, 0.04, r - 2.1 * R2)) * haloLine(r - 2.1 * R2, 0.07) * 0.35;
        // the parhelic circle: a level band through the sun, fading far out
        l += white * exp(-pow(d.y / 0.003, 2.0)) * exp(-abs(d.x) / 1.2) * 0.45;
        // the sundogs, moving out as the crystals tilt
        float off = R2 / cos(0.9 * tilt);
        float dd = abs(d.x) - off;
        l += mix(warm, white, smoothstep(0.0, 0.03, dd)) * haloLine(dd, 0.04) * exp(-pow(d.y / 0.025, 2.0)) * 1.2;
        // the tangent arcs: parabolas touching the ring above and below, hugging it as the crystals tilt
        float a = mix(2.5, -0.85 / (2.0 * R2), tilt);
        float nrm = sqrt(1.0 + 4.0 * a * a * d.x * d.x);
        float up = (d.y - (R2 + a * d.x * d.x)) / nrm, dn = (-d.y - (R2 + a * d.x * d.x)) / nrm;
        float wing = exp(-abs(d.x) / 0.4) * 0.6;
        l += white * (haloLine(up, 0.04) + haloLine(dn, 0.04) * 0.6) * wing;
        l += famLight(fh, 0.5, 0.95) * exp(-r / 0.015) * 1.5;        // the sun itself
        col += l * bright * 0.55;
    }
    finish(col);
}

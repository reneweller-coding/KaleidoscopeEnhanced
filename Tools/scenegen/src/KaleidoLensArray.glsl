//@doc
 * @brief KALEIDO LENS ARRAY: a field of small round lenses lying over a large kaleidoscope: each lens shows a magnified,
 * turned piece of the rosette beneath it, the lenses drift slowly over it, and where they pass the pattern swells and
 * swirls.  A lens of radius R magnifies its middle by m and less toward its rim (the bulge falls off as 1 - (r/R)^2),
 * so its picture joins the rosette at its edge; the lens also turns what it shows a little.  The photo's own colours,
 * calmed toward one colour family; each lens' rim catches a thin line of light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the lenses' strength (how much they magnify)
 *   audioAdvance -> the lenses drift and the rosette turns (integrated)
 *
 * Knobs: lensP (the lenses' size), sidesP (the rosette's symmetry), hueP.  Distinct from FlyEyeLensArray, which has no
 * kaleidoscope beneath.
//@params lensP sidesP
//@audio audioSwell
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
}

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
    float S = 0.18 + 0.12 * clamp(lensP, 0.0, 1.0);
    float sides = floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    float mag = 1.6 + 1.6 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.1 * audioAdvance;
    // the lenses on a drifting hexagonal lattice
    vec2 g = p / S + vec2(drift * 3.0, drift * 1.3);
    vec2 r = vec2(1.0, 1.7320508);
    vec2 a = mod(g, r) - 0.5 * r, b = mod(g - 0.5 * r, r) - 0.5 * r;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 centreS = (g - q - vec2(drift * 3.0, drift * 1.3)) * S;   // the lens' centre on screen
    float rl = length(q) / 0.46;                                   // 0 at the middle, 1 at the rim
    vec2 seen = p;
    float hc = fract(sin(dot(floor(g - q + 0.5), vec2(12.9898, 78.233))) * 43758.5453);
    if (rl < 1.0) {
        float k = 1.0 + (mag - 1.0) * (1.0 - rl * rl);
        seen = centreS + rot2((0.4 * (hc - 0.5)) * (1.0 - rl * rl)) * (p - centreS) / k;
    }
    vec2 kk = kfold(rot2(0.03 * sceneTime + 0.12 * audioAdvance) * seen, sides);
    vec3 col = tone(imgLod(kk * 0.45 + vec2(0.5, 0.42), 0.6), fh);
    col += famLight(fh, 0.6, 0.6) * exp(-pow((rl - 1.0) / 0.03, 2.0)) * 0.25;
    col *= 0.8 + 0.2 * smoothstep(1.0, 0.7, rl);
    finish(col);
}

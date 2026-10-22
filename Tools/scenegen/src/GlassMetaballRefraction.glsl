//@doc
 * @brief GLASS METABALL REFRACTION: blobs of clear glass flow before the photo, merging when they meet and parting
 * again, bending the picture behind them: their middles magnify a little, their rims bend it hard and catch thin
 * highlights.  The blobs are metaballs -- the field sum r^2/|x - c|^2 over the balls, glass where it passes 1 -- and the
 * glass' surface height is a smooth step of that field; the picture is pushed by the height's slope, taken from the
 * field's analytic gradient.  The photo's colours, calmed toward one colour family; outside the glass the photo is
 * dimmed a little so the blobs stand out.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> how many balls there are (the loudness envelope: they swell in and shrink out one by one)
 *   audioAdvance -> the balls drift (integrated)
 *
 * Knobs: ballP (the balls' size), bendP (how strongly the glass bends), hueP.
//@params ballP bendP
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
    float n = 3.0 + 5.0 * clamp(audioSwell, 0.0, 1.0);
    float rb = 0.11 + 0.06 * clamp(ballP, 0.0, 1.0);
    float bend = 0.02 + 0.03 * clamp(bendP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float F = 0.0;
    vec2 G = vec2(0.0);
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float w = clamp(n - fi, 0.0, 1.0);
        if (w <= 0.0) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        vec2 c = vec2(0.7 * sin(run * (0.5 + 0.3 * h1) + 6.2831853 * h2), 0.33 * sin(run * (0.4 + 0.3 * h2) + 6.2831853 * h1));
        float r = rb * (0.8 + 0.4 * h2) * w;
        vec2 d = p - c;
        float dd = dot(d, d) + 1e-4;
        F += r * r / dd;
        G -= 2.0 * r * r * d / (dd * dd);
    }
    // the glass' height: a smooth step of the field; its slope pushes the picture
    float t = clamp((F - 0.8) / 1.7, 0.0, 1.0);
    vec2 slope = G * (6.0 * t * (1.0 - t) / 1.7);
    vec2 seen = p - bend * slope;
    float inside = smoothstep(0.9, 1.05, F);
    vec3 col = tone(imgLod(seen * 0.6 + 0.5, 0.5), fh) * mix(0.7, 1.08, inside);
    col += famLight(fh, 0.6, 0.85) * inside * exp(-pow((F - 1.05) / 0.12, 2.0)) * 0.45;
    col += famLight(fh, 0.5, 0.7) * inside * smoothstep(0.2, 2.5, length(slope)) * 0.1;
    finish(col);
}

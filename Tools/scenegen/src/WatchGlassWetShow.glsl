//@doc
 * @brief WATCH GLASS WET SHOW: the "wet show" of the Joshua Light Show: dyes, oil and water between two watch glasses
 * on an overhead projector, the glasses pressed together again and again so the colours swell, spread and pulse,
 * thrown huge onto the wall.  Three dyes are three soft fields of warped noise, each bounded by an oil front with a
 * bright meniscus; pressing the glasses squeezes everything outward from the middle and lets it flow back.  Oil
 * bubbles float as rings.  The dyes are two or three tones taken from the photo, calmed toward one colour family;
 * the projector's lamp makes a soft round field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the pressing: a soft press and release (integrated, so it follows the music's drive)
 *   audioOnset   -> a fresh drop of dye swells up (small)
 *   audioSwell   -> the dyes' saturation and light
 *
 * Knobs: dyeP (how much dye is in the dish), oilP (how many oil bubbles), hueP.  Distinct from OilProjector (an oil
 * wheel) and LiquidLightShow (a finished dish).
//@params dyeP oilP
//@audio audioOnset audioSwell
//@body
/**  A dye's colour: one of three tones of the photo, calmed toward the colour family.
 *
 * @param k   Which dye, 0..2. (in)
 * @param fh  The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 dyeTone(float k, float fh)
{
    vec3 c = imgLod(vec2(0.25 + 0.25 * k, 0.4 + 0.15 * sin(3.0 * k)), 6.0);
    float l = luma(c);
    return mix(c * 1.3, famCol(fh, 0.2 + 0.3 * k) * (0.6 + 0.8 * l), 0.5);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float dye = 0.4 + 0.5 * clamp(dyeP, 0.0, 1.0);
    float press = 0.5 - 0.5 * cos(3.14159265 * audioAdvance + 0.4 * sceneTime);
    float r = length(p);
    // pressing squeezes the dish outward from the middle; releasing lets it flow back
    vec2 q = p / (1.0 + 0.18 * press * exp(-r * r * 2.0));
    float t = 0.03 * sceneTime + 0.1 * audioAdvance;
    vec3 col = vec3(0.0);
    float cover = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        vec2 w = q * (1.2 + 0.3 * fk) + vec2(3.1 * fk, 1.7 * fk);
        w += 0.6 * vec2(fbm(w + vec2(t, 0.3 * fk)), fbm(w.yx - vec2(0.2 * fk, t)));
        float f = fbm(w * 0.9 + t * (0.5 + 0.2 * fk));
        float edge = f - (0.62 - 0.22 * dye) - 0.06 * clamp(audioOnset, 0.0, 1.0) * exp(-dot(q - 0.3 * vec2(sin(fk), cos(fk)), q - 0.3 * vec2(sin(fk), cos(fk))) * 6.0);
        float body = smoothstep(0.0, 0.08, edge);
        float meniscus = exp(-pow(edge / 0.012, 2.0));
        vec3 dc = dyeTone(fk, fh) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
        col = mix(col, col * 0.4 + dc, body * 0.75);
        col += famLight(fh, 0.2 + 0.3 * fk, 0.7) * meniscus * 0.35;
        cover = max(cover, body);
    }
    // oil bubbles: rings that drift with the flow
    float bubbles = 0.0;
    vec2 g = q * 6.0 + vec2(0.4 * t, -0.3 * t);
    vec2 gid = floor(g);
    float hg = fract(sin(dot(gid, vec2(12.9898, 78.233))) * 43758.5453);
    if (hg < 0.15 + 0.35 * clamp(oilP, 0.0, 1.0)) {
        vec2 c = gid + 0.5 + 0.3 * (vec2(fract(hg * 7.3), fract(hg * 3.1)) - 0.5);
        float rr = length(g - c) / (0.15 + 0.2 * fract(hg * 5.7));
        bubbles = exp(-pow((rr - 1.0) / 0.12, 2.0)) * step(rr, 1.3);
    }
    col += famLight(fh, 0.6, 0.8) * bubbles * 0.25;
    // the projector's lamp: a soft round field, dark beyond
    col *= smoothstep(1.15, 0.55, r) * (0.75 + 0.35 * exp(-r * r * 3.0));
    finish(col);
}

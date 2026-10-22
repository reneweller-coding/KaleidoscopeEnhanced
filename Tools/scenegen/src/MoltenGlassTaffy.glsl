//@doc
 * @brief MOLTEN GLASS TAFFY: glowing ribbons of molten glass pulled and folded over and over like taffy: layered bands
 * of hot glass, each pull stretching them thinner and laying them over one another, a white-hot core where they are
 * thickest and a glassy sheen where the bands bend.  The bands are the level lines of a coordinate carried through
 * several smooth pulls: each pull shifts the plane by a wave of the other axis, which stretches the bands, bends them
 * back on themselves and thins them out; the pulls glide.  The glow runs from deep embers to white heat in shades of
 * one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the pulling (integrated): the ribbons stretch and fold over
 *   audioSwell   -> the glow's heat
 *
 * Knobs: foldP (how many pulls), bandP (how many bands), hueP.
//@params foldP bandP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float F = floor(4.0 + 2.0 * clamp(foldP, 0.0, 1.0));
    float bands = 3.0 + 3.0 * clamp(bandP, 0.0, 1.0);
    float fold = 0.04 * sceneTime + 0.15 * audioAdvance;
    float heat = 0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = p * 1.4;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        if (fi >= F) break;
        // one pull: a wave of the other axis shifts the plane, stretching and folding the bands
        q.x += 0.55 * sin(2.2 * q.y + fold * (0.5 + 0.1 * fi) + 1.3 * fi);
        q.y += 0.55 * sin(2.0 * q.x - fold * (0.4 + 0.13 * fi) + 2.1 * fi);
    }
    // the bands: level lines of the pulled coordinate
    float v = q.y * bands * 1.2 + 0.3 * fold;
    float band = 0.5 + 0.5 * cos(6.2831853 * v);
    float core = pow(band, 4.0);
    float body = smoothstep(0.25, 0.95, band);
    // the ribbons fade where the folds pile up too thin to tell apart
    float sheet = 0.55 + 0.45 * smoothstep(0.2, 0.8, fbm(1.5 * p + 0.2 * fold));
    vec3 col = mix(famCol(fh, 0.2) * 0.12, famCol(fh, 0.55) * 0.9, body);
    col = mix(col, vec3(1.0, 0.95, 0.85), core * heat * 0.8);
    col *= heat * sheet;
    // a glassy sheen where the band's slope across the screen changes fastest
    float slope = length(vec2(dFdx(v), dFdy(v)));
    col += famLight(fh, 0.6, 0.8) * smoothstep(0.3, 0.9, sin(6.2831853 * v + 1.2)) * smoothstep(0.02, 0.2, slope) * 0.15;
    finish(col);
}

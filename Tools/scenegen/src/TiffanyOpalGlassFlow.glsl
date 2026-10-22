//@doc
 * @brief TIFFANY OPAL GLASS FLOW: a window of opalescent art glass lit from behind: pieces of streaky glass held in dark
 * lead lines, each with milky swirls and colour streaks that flow slowly through it, the streaks of every piece running
 * their own way and turning when the chords change.  The pieces are the cells of a jittered Voronoi pattern with the
 * lead along their borders; in each piece the streaks are noise stretched along the piece's own direction, the milky
 * opal a second, softer noise, and the light behind comes through brighter where the glass is clear.  The glass'
 * colours are shades of one family from the photo with milky white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the streaks flow (integrated)
 *   audioHarmAdvance -> every chord change turns the pieces' streaks a little (gliding)
 *   audioSwell       -> the light behind the window
 *
 * Knobs: pieceP (the pieces' size), streakP (how fine the streaks are), hueP.
//@params pieceP streakP
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
    float S = 0.16 + 0.1 * clamp(pieceP, 0.0, 1.0);
    float fine = 10.0 + 14.0 * clamp(streakP, 0.0, 1.0);
    float flow = 0.03 * sceneTime + 0.1 * audioAdvance;
    float h = max(audioHarmAdvance, 0.0);
    float turn = floor(h) + smoothstep(0.15, 0.85, fract(h));
    // the pieces: the nearest site, then the distance to the border with the neighbours (the lead)
    vec2 g = p / S, gi = floor(g);
    vec2 best = vec2(0.0), bs = vec2(0.0);
    float d1 = 9.0;
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        vec2 site = cell + 0.15 + 0.7 * hash22(cell);
        float dd = length(g - site);
        if (dd < d1) { d1 = dd; best = cell; bs = site; }
    }
    float edge = 9.0;
    for (int k = 0; k < 25; ++k) {
        vec2 cell = floor(bs) + vec2(float(k % 5) - 2.0, float(k / 5) - 2.0);
        if (cell == best) continue;
        vec2 site = cell + 0.15 + 0.7 * hash22(cell);
        edge = min(edge, dot(0.5 * (bs + site) - g, normalize(site - bs)));
    }
    edge *= S;
    float hp = hash21(best);
    // the piece's glass: streaks along its own direction, milky opal swirls through it
    vec2 u = rot2(6.2831853 * hp + 0.4 * turn) * p;
    float streak = fbm(vec2(1.5 * u.x + flow, fine * u.y + 3.0 * hp));
    float opal = fbm(3.0 * p + vec2(-0.7 * flow, 0.4 * flow) + 10.0 * hp);
    vec3 gc = mix(famCol(fh, fract(hp + 0.5 * streak)), tone(imgLod(bs * S * 0.6 + 0.5, 4.0), fh), 0.3);
    vec3 glass = gc * (0.45 + 0.9 * streak);
    glass = mix(glass, vec3(0.95, 0.93, 0.9) * (0.65 + 0.35 * opal), 0.7 * smoothstep(0.45, 0.75, opal));
    float light = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + 0.5 * fbm(0.8 * p + 0.2 * flow));
    vec3 col = glass * light;
    // the lead: dark, with a thin sheen along its middle
    float lead = smoothstep(0.004, 0.009, edge);
    col = mix(famCol(fh, 0.4) * 0.03 + vec3(0.06) * exp(-pow(edge / 0.002, 2.0)), col, lead);
    finish(col);
}

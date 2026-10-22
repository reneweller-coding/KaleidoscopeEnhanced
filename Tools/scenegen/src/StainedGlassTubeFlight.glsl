//@doc
 * @brief STAINED GLASS TUBE FLIGHT: a flight through a tube of stained glass lit from outside: panes of the photo's
 * colours between dark leads, a light circling round the tube so the panes glow in turn, and their colours falling
 * softly on the haze inside; the tracery changes as the harmony moves.  The panes are a Voronoi tiling of the unrolled
 * wall with a whole number of cells around, so it closes; the leads are the cells' borders (the distance to the
 * nearest border, measured to the bisectors).  The light outside turns with the integrated phase.  A chord change
 * cross-fades to another tiling (other seeds), as light.  The panes take the photo's colours, calmed toward one colour
 * family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase       -> the light outside circles round the tube (integrated)
 *   audioHarmAdvance -> the tracery: a chord change brings another tiling (cross-faded)
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the light's strength
 *
 * Knobs: paneP (the panes' size), hazeP (how much colour the haze takes), hueP.
//@params paneP hazeP
//@audio audioPhase audioHarmAdvance audioSwell
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

/**  The stained glass at a place on the unrolled wall, in cells.
 *
 * @param q     The place (x around, in cells; y along, in cells). (in)
 * @param M     The cells around. (in)
 * @param seed  The tiling's seed. (in)
 * @param px    A pixel in cells. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   rgb the glass's colour, a how much lead covers it.
 **/
vec4 glass(vec2 q, float M, float seed, float px, float fh)
{
    vec2 ip = floor(q);
    float d1 = 9.0;
    vec2 best = vec2(0.0), bid = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = ip + vec2(float(i), float(j));
            vec2 id = vec2(mod(c.x, M), c.y);
            vec2 g = c + 0.15 + 0.7 * hash22(id + seed);
            float d = dot(q - g, q - g);
            if (d < d1) { d1 = d; best = g; bid = id; }
        }
    float edge = 9.0;
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = ip + vec2(float(i), float(j));
            vec2 g = c + 0.15 + 0.7 * hash22(vec2(mod(c.x, M), c.y) + seed);
            vec2 dg = g - best;
            if (dot(dg, dg) < 1e-6) continue;
            vec2 n = normalize(dg);
            edge = min(edge, dot(0.5 * (best + g) - q, n));
        }
    vec3 pane = tone(imgLod(fract(vec2(bid.x / M, bid.y * 0.137)) * 0.8 + 0.1, 3.0), fh);
    float lead = 1.0 - smoothstep(0.03, 0.03 + 2.0 * px, edge);
    return vec4(pane * (0.85 + 0.3 * hash21(bid + seed + 3.0)), lead);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float M = floor(9.0 + 7.0 * clamp(paneP, 0.0, 1.0));
    float cw = 6.2831853 * R0 / M;                                    // a cell's size
    vec2 q = vec2(a / 6.2831853 * M, (z + fly) / cw);
    float px = R0 / (r * r * resolution.y) / cw;
    float detail = 1.0 - smoothstep(0.1, 0.3, px);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    vec4 gA = glass(q, M, mod(hk, 5.0) * 7.31, px, fh);
    vec4 gB = glass(q, M, mod(hk + 1.0, 5.0) * 7.31, px, fh);
    vec4 g = mix(gA, gB, m);
    float la = 0.03 * sceneTime + 0.4 * audioPhase;
    float lit = 0.3 + 1.1 * pow(max(cos(a - la), 0.0), 2.0) + 0.4 * pow(max(cos(a - la - 3.14159265), 0.0), 4.0);
    float glow = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * lit;
    vec3 col = mix(g.rgb * glow, vec3(0.015), g.a * detail);
    col = mix(col, tone(imgLod(vec2(0.5 + 0.3 * cos(a), 0.5 + 0.3 * sin(a)), 5.0), fh) * 0.4 * glow, 1.0 - detail);
    // the haze inside takes the panes' colours, more toward the lit side
    vec3 haze = tone(imgLod(vec2(0.5 + 0.3 * cos(la), 0.5 + 0.3 * sin(la)), 6.0), fh);
    col += haze * (0.05 + 0.2 * clamp(hazeP, 0.0, 1.0)) * (1.0 - exp(-0.15 * z)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(6.0, 20.0, z));
    finish(col);
}

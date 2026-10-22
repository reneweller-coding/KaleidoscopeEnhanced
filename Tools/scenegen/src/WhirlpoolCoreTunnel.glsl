//@doc
 * @brief WHIRLPOOL CORE TUNNEL: the view looks down the core of a whirlpool: spiral walls of water wind into the
 * depth, streaked by the flow and crossed by bright caustics, turning with the music's drive while the light reaches
 * deeper as it swells.  The wall is the tunnel's, wound into a fixed spiral; the whole funnel turns by the integrated
 * drive, and its water streams down along the spiral.  The streaks are sines of whole multiples of the angle (no seam),
 * the caustics a tileable water-caustic iteration over the wound wall.  The water is toned by the photo, calmed toward
 * one colour family.  Distinct from TextureMaelstrom, which is flat.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the funnel turns and its water streams down (integrated)
 *   audioSwell   -> the light reaches deeper into the funnel
 *   audioPhase   -> the caustics drift (integrated)
 *
 * Knobs: twistP (how tightly the spiral winds), causticP (how bright the caustics are), hueP.
//@params twistP causticP
//@audio audioSwell audioPhase
//@body
/**  A tileable water caustic (period 1 in both coordinates).
 *
 * @param uv  The place. (in)
 * @param t   The caustic's time. (in)
 *
 * @return
 *   The caustic's brightness.
 **/
float caustic(vec2 uv, float t)
{
    vec2 pp = mod(uv * 6.2831853, 6.2831853) - 250.0;
    vec2 i = pp;
    float c = 1.0;
    for (int n = 0; n < 4; ++n) {
        float tn = t * (1.0 - 3.5 / float(n + 1));
        i = pp + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
        c += 1.0 / length(vec2(pp.x / (sin(i.x + tn) / 0.005), pp.y / (cos(i.y + tn) / 0.005)));
    }
    c = 1.17 - pow(c / 4.0, 1.4);
    return pow(abs(c), 8.0);
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
    const float R0 = 0.35;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float spin = 0.05 * sceneTime + 0.5 * audioAdvance;
    float tw = 0.25 + 0.3 * clamp(twistP, 0.0, 1.0);
    float s = a + spin + tw * z;                                      // the wound wall's angle
    float u = z + 0.4 * sceneTime + 1.2 * audioAdvance;               // the water streaming down
    float streak = 0.5 + 0.18 * sin(5.0 * s + 0.6 * u) + 0.14 * sin(8.0 * s - 0.4 * u + 1.3) + 0.1 * sin(13.0 * s + 0.9 * u + 2.1);
    float cs = caustic(vec2(s / 6.2831853 * 3.0, u * 0.35), 0.4 * sceneTime + 0.3 * audioPhase);
    float dpx = R0 / (r * r * resolution.y);
    float detail = 1.0 - smoothstep(0.05, 0.2, dpx);                  // the caustics melt far down
    vec3 water = tone(imgLod(vec2(0.5 + 0.3 * cos(s), 0.5 + 0.3 * sin(s)), 4.0), fh);
    float depth = 3.0 + 5.0 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = water * (0.25 + 0.5 * streak) * exp(-z / depth);
    col += famLight(fh, 0.6, 0.6) * min(cs, 2.0) * (0.3 + 0.6 * clamp(causticP, 0.0, 1.0)) * detail * exp(-z / (1.3 * depth));
    col += famCol(fh, 0.5) * 0.15 * exp(-r * 6.0);                    // the core's glow
    finish(col);
}

//@doc
 * @brief FISCHINGER OPTICAL POEM: after Oskar Fischinger's "An Optical Poem": circles, discs and bars fill a deep
 * space in rows and swarms -- they approach out of the depth, circle each other and fall into order exactly with
 * the music, then scatter again.  Three groups of twenty-four shapes each move between a scattered swarm and an
 * ordered figure (a row, a ring, a spiral), the blend following the phrase; every shape has a depth, so the near
 * ones are large and soft and the far ones small and sharp.  The shapes' colours are shades of one colour family
 * from the photo, one of them a pale near-white, as in the film.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos     -> the groups fall into order toward a phrase's middle and scatter toward its end (smooth)
 *   audioSectionId/Age -> every new section gives each group another figure (row, ring or spiral; over six seconds)
 *   audioBass/Mid/High -> each group's light follows its band
 *   audioAdvance       -> the swarms drift and the figures turn (integrated)
 *
 * Knobs: sizeP (the shapes' size), depthP (how deep the space is), hueP.
//@params sizeP depthP
//@audio audioPhrasePos audioSectionId audioSectionPrev audioSectionAge audioBass audioMid audioHigh
//@body
/**  A shape's ordered place in a figure.
 *
 * @param fig  0 a row, 1 a ring, 2 a spiral. (in)
 * @param i    The shape's number in its group, 0..23. (in)
 * @param g    The group. (in)
 * @param t    The figure's turn. (in)
 *
 * @return
 *   The place (xy) and the depth (z).
 **/
vec3 figurePlace(float fig, float i, float g, float t)
{
    float u = i / 23.0;
    if (fig < 0.5) return vec3(-0.85 + 1.7 * u, 0.32 * (g - 1.0), 1.0 + 0.4 * g);
    if (fig < 1.5) {
        float a = 6.2831853 * u + t * (g - 1.0 + 0.5);
        return vec3(0.38 * cos(a), 0.38 * sin(a) * 0.9, 1.0 + 0.6 * g + 0.2 * sin(a));
    }
    float a = 12.566 * u + t;
    return vec3((0.08 + 0.4 * u) * cos(a), (0.08 + 0.4 * u) * sin(a), 0.8 + 1.5 * u + 0.3 * g);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float size = 0.03 + 0.03 * clamp(sizeP, 0.0, 1.0);
    float deep = 1.0 + 2.0 * clamp(depthP, 0.0, 1.0);
    float order = smoothstep(0.1, 0.4, audioPhrasePos) * (1.0 - smoothstep(0.7, 0.95, audioPhrasePos));
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float t = 0.05 * sceneTime + 0.25 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.025;
    for (int g = 0; g < 3; ++g) {
        float fg = float(g);
        float figA = mod(max(audioSectionPrev, 0.0) + fg, 3.0), figB = mod(max(audioSectionId, 0.0) + fg, 3.0);
        float band = g == 0 ? audioBass : g == 1 ? audioMid : audioHigh;
        vec3 tint = g == 2 ? famLight(fh, 0.5, 0.85) : famCol(fh, 0.25 + 0.5 * fg);
        for (int i = 0; i < 24; ++i) {
            float fi = float(i);
            float h1 = fract(sin(fi * 12.9898 + fg * 7.7) * 43758.5453), h2 = fract(sin(fi * 78.233 + fg * 3.1) * 43758.5453);
            vec3 swarm = vec3(1.3 * (h1 - 0.5) + 0.25 * sin(t * (0.5 + h2) + 6.0 * h1),
                              0.9 * (h2 - 0.5) + 0.2 * cos(t * (0.4 + h1) + 6.0 * h2), 0.7 + deep * fract(h1 + h2 + 0.05 * t));
            vec3 place = mix(figurePlace(figA, fi, fg, t), figurePlace(figB, fi, fg, t), m);
            vec3 at = mix(swarm, place, order);
            vec2 sp = at.xy / at.z;
            float r = size / at.z;
            float d;
            if (g == 1) {
                vec2 q = rot2(t + fi) * (p - sp);                  // the bars
                d = length(max(abs(q) - vec2(r * 2.2, r * 0.45), 0.0));
            } else {
                d = length(p - sp) - r;                            // circles and discs
                if (g == 0) d = abs(d + 0.25 * r) - 0.25 * r;      // the first group: rings
            }
            float soft = 0.002 + 0.01 / at.z * (at.z < 1.0 ? 2.0 : 0.3);
            float cover = smoothstep(soft, -soft, d);
            col = mix(col, tint * (0.5 + 0.9 * clamp(band, 0.0, 1.0)) * (1.2 / at.z), cover * 0.9);
        }
    }
    finish(col);
}

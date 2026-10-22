//@doc
 * @brief GEL SHEETS OVERLAP: transparent colour gels drift over a light table, turning slowly, and where they overlap
 * their colours mix by subtraction into deeper tones; their edges glow where the light leaks past them; they drift with
 * the music's phase, and every section lays a new set of sheets (cross-faded).  Every sheet is a rounded rectangle
 * with its own place, angle and filter; the light that reaches a place is the table's light multiplied by every sheet
 * over it, so two sheets give a deeper colour than either.  A section's set comes from its number.  The filters are two
 * or three shades of the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase         -> the sheets drift and turn (integrated)
 *   audioSectionId/Age -> every section lays a new set of sheets (cross-faded over six seconds)
 *   audioSwell         -> the table's light
 *
 * Knobs: countP (how many sheets), sizeP (the sheets' size), hueP.
//@params countP sizeP
//@audio audioPhase audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The light through a set of sheets at a place.
 *
 * @param p    The place. (in)
 * @param sec  The section, which lays the set. (in)
 * @param n    How many sheets. (in)
 * @param sz   The sheets' size. (in)
 * @param run  The drift. (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   rgb the transmitted share, a the edges' glow.
 **/
vec4 sheets(vec2 p, float sec, float n, float sz, float run, float fh)
{
    vec3 t = vec3(1.0);
    float edge = 0.0;
    for (int k = 0; k < 9; ++k) {
        float i = float(k);
        if (i >= n) break;
        vec2 h = hash22(vec2(i, sec * 3.7 + 1.0));
        vec2 c = vec2((h.x - 0.5) * 1.5, (h.y - 0.5) * 0.85) + 0.15 * vec2(sin(run * (0.6 + 0.1 * i) + i), cos(run * (0.5 + 0.13 * i) + 2.0 * i));
        float an = 6.2831853 * hash11(i + sec * 9.1) + 0.3 * sin(run * 0.4 + i);
        vec2 q = rot2(an) * (p - c);
        vec2 hs = sz * vec2(0.35 + 0.25 * hash11(i * 2.3 + sec), 0.22 + 0.15 * hash11(i * 4.1 + sec));
        vec2 dq = abs(q) - hs + 0.04;
        float d = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - 0.04;
        float inside = 1.0 - smoothstep(-0.003, 0.003, d);
        vec3 filt = mix(vec3(1.0), famCol(fh, 0.15 + 0.7 * hash11(i * 7.7 + sec)), 0.7);
        t *= mix(vec3(1.0), filt, inside);
        edge += exp(-pow(d / 0.006, 2.0));
    }
    return vec4(t, edge);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(4.0 + 5.0 * clamp(countP, 0.0, 1.0));
    float sz = 0.8 + 0.5 * clamp(sizeP, 0.0, 1.0);
    float run = 0.05 * sceneTime + 0.4 * audioPhase;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec4 sA = sheets(p, max(audioSectionPrev, 0.0), n, sz, run, fh);
    vec4 sB = sheets(p, max(audioSectionId, 0.0), n, sz, run, fh);
    vec4 s = mix(sA, sB, m);
    vec3 table = famLight(fh, 0.5, 0.75) * (0.55 + 0.45 * exp(-dot(p, p) * 1.2)) * (0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = table * s.rgb + famLight(fh, 0.5, 0.9) * s.a * 0.25;
    finish(col);
}
